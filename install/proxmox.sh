#!/usr/bin/env bash
# Ordo auf Proxmox VE installieren: legt einen kleinen Alpine-LXC an und richtet darin
# die App (Caddy) und den CalDAV-Server (Radicale) ein. Auf dem Proxmox-Host als root:
#
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/bischofone/ordo/main/install/proxmox.sh)"
#
# Alles ist vorbelegt; Enter übernimmt den Vorschlag. Ohne Rückfragen: ORDO_YES=1 voranstellen.
# Werte lassen sich auch vorgeben, z. B.:
#   ORDO_CTID=120 ORDO_DOMAIN=ordo.example.de ORDO_USER=alex bash -c "$(curl -fsSL …)"
#
# Variablen: ORDO_CTID, ORDO_HOSTNAME, ORDO_STORAGE, ORDO_BRIDGE, ORDO_IP (dhcp oder 10.0.0.5/24),
#            ORDO_GATEWAY, ORDO_DISK (GB), ORDO_MEMORY (MB), ORDO_CORES, ORDO_DOMAIN,
#            ORDO_USER, ORDO_PASSWORD, ORDO_NEXTCLOUD (z. B. https://cloud.example.com),
#            ORDO_AUTOUPDATE (j/n),
#            ORDO_TOKEN (nur für private Forks nötig)
set -euo pipefail
# Bricht etwas ab, soll man sehen, wo – nie wieder stilles Beenden
trap 'printf "\033[1;31m✗ Abbruch in Zeile %s: %s\033[0m\n" "$LINENO" "$BASH_COMMAND" >&2' ERR

RAW="${ORDO_RAW:-https://raw.githubusercontent.com/bischofone/ordo/${ORDO_BRANCH:-main}}"

blue() { printf '\033[1;34m%s\033[0m\n' "$*"; }
say() { printf '\033[1;34m›\033[0m %s\n' "$*"; }
die() {
	printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2
	exit 1
}

# ---------- Prüfen ----------

[ "$(id -u)" = 0 ] || die "Bitte als root auf dem Proxmox-Host ausführen."
for c in pct pveam pvesh pvesm; do
	command -v "$c" >/dev/null || die "„$c“ fehlt – läuft das wirklich auf einem Proxmox-VE-Host?"
done

blue "
   ___          _
  / _ \ _ __ __| | ___
 | | | | '__/ _\` |/ _ \\
 | |_| | | | (_| | (_) |
  \___/|_|  \__,_|\___/   Aufgaben in Ordnung – Installation als LXC
"

# Frage mit Vorschlag; bei ORDO_YES=1 oder ohne Terminal wird der Vorschlag genommen
ask() {
	local var="$1" text="$2" def="$3" val
	if [ -n "${!var:-}" ]; then return; fi
	if [ "${ORDO_YES:-}" = 1 ] || [ ! -t 0 ]; then
		printf -v "$var" '%s' "$def"
		return
	fi
	read -r -p "  $text [$def]: " val </dev/tty || true
	printf -v "$var" '%s' "${val:-$def}"
}

# Aktive Speicher für einen Inhaltstyp: „Name freier-Platz“ je Zeile
storages() { pvesm status -content "$1" 2>/dev/null | awk 'NR>1 && $3=="active" {print $1, $6}' || true; }
# Vorschlag: bevorzugte Namen zuerst, sonst der mit dem meisten freien Platz –
# aber keine Speicher, die nach Sicherung klingen (ohne Pipes, die vorzeitig schließen)
pick_storage() {
	local list name
	list="$(storages "$1")"
	shift
	for name in "$@"; do
		if grep -q "^$name " <<<"$list"; then
			echo "$name"
			return
		fi
	done
	list="$(grep -viE '^(backup|bak|pbs|dump)' <<<"$list" || true)"
	sort -k2 -nr <<<"$list" | awk 'NR==1 {print $1}'
}
default_rootfs="$(pick_storage rootdir local-lvm local-zfs)"
default_tmpl="$(pick_storage vztmpl local)"
[ -n "$default_rootfs" ] || die "Kein Speicher für Container gefunden."
[ -n "$default_tmpl" ] || die "Kein Speicher für Vorlagen gefunden."

echo "Einstellungen (Enter = Vorschlag):"
ask ORDO_CTID "Container-ID" "$(pvesh get /cluster/nextid)"
ask ORDO_HOSTNAME "Hostname" "ordo"
rootfs_names="$(awk '{print $1}' <<<"$(storages rootdir)" | paste -sd ',' - | sed 's/,/, /g')"
ask ORDO_STORAGE "Speicher ($rootfs_names)" "$default_rootfs"
ask ORDO_DISK "Festplatte in GB" "2"
ask ORDO_MEMORY "Arbeitsspeicher in MB" "256"
ask ORDO_CORES "CPU-Kerne" "1"
ask ORDO_BRIDGE "Netzwerk-Bridge" "vmbr0"
ask ORDO_IP "IP-Adresse (dhcp oder z. B. 192.168.1.50/24)" "dhcp"
if [ "$ORDO_IP" != dhcp ]; then ask ORDO_GATEWAY "Gateway" ""; fi
ask ORDO_DOMAIN "Domain für HTTPS (leer = nur HTTP im Heimnetz)" ""
ask ORDO_NEXTCLOUD "Nextcloud-Adresse für Sync/Kalender (leer = keine)" ""
ask ORDO_USER "Ordo-Benutzer" "ordo"
ORDO_USER="$(printf '%s' "$ORDO_USER" | tr 'A-Z' 'a-z')"
ask ORDO_AUTOUPDATE "Jede Nacht automatisch aktualisieren? (j/n)" "n"
ORDO_PASSWORD="${ORDO_PASSWORD:-}"
ORDO_TOKEN="${ORDO_TOKEN:-}"

pct status "$ORDO_CTID" >/dev/null 2>&1 && die "Container $ORDO_CTID gibt es schon."
if [ -z "$ORDO_PASSWORD" ]; then
	# Erst eine feste Menge Zufall lesen, dann filtern – ohne „head“ am Ende der Pipe,
	# das die Leitung vorzeitig schließt (würde mit pipefail das Skript beenden)
	ORDO_PASSWORD="$(head -c 512 /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9')"
	ORDO_PASSWORD="${ORDO_PASSWORD:0:16}"
fi

echo
say "Los geht's: Container $ORDO_CTID ($ORDO_HOSTNAME) auf $ORDO_STORAGE, ${ORDO_DISK} GB, ${ORDO_MEMORY} MB RAM"

# ---------- Vorlage ----------

say "Alpine-Vorlage suchen …"
pveam update >/dev/null 2>&1 || true
available="$(pveam available --section system 2>/dev/null || true)"
# Nur Vorlagen für die Architektur dieses Rechners (amd64 bzw. arm64)
arch="$(dpkg --print-architecture 2>/dev/null || true)"
case "$arch" in
amd64 | arm64) ;;
*) arch="$(uname -m | sed 's/x86_64/amd64/; s/aarch64/arm64/')" ;;
esac
template="$(awk -v a="_${arch}." '$2 ~ /^alpine-3/ && index($2, a) {print $2}' <<<"$available" | sort -V | tail -n 1)"
[ -n "$template" ] || die "Keine Alpine-Vorlage für $arch gefunden (pveam available)."
installed="$(pveam list "$default_tmpl" 2>/dev/null || true)"
if ! grep -qF "$template" <<<"$installed"; then
	say "Vorlage $template herunterladen …"
	pveam download "$default_tmpl" "$template" >/dev/null
fi

# ---------- Container ----------

net="name=eth0,bridge=$ORDO_BRIDGE,ip=$ORDO_IP"
[ -n "${ORDO_GATEWAY:-}" ] && net="$net,gw=$ORDO_GATEWAY"

say "Container $ORDO_CTID anlegen …"
# Zum Bauen kurz mehr Speicher; danach wird auf den gewählten Wert verkleinert.
pct create "$ORDO_CTID" "$default_tmpl:vztmpl/$template" \
	--hostname "$ORDO_HOSTNAME" \
	--ostype alpine \
	--unprivileged 1 \
	--cores "$ORDO_CORES" \
	--memory 1536 --swap 512 \
	--rootfs "$ORDO_STORAGE:$ORDO_DISK" \
	--net0 "$net" \
	--onboot 1 \
	--tags ordo \
	--description "Ordo – Aufgaben-App mit CalDAV. Pflege im Container: ordo update | ordo status | ordo user-add NAME" \
	>/dev/null

if ! pct start "$ORDO_CTID"; then
	# Der Container ist frisch angelegt und leer – wieder entfernen, damit nichts liegen bleibt
	pct destroy "$ORDO_CTID" --purge >/dev/null 2>&1 || true
	die "Container $ORDO_CTID ließ sich nicht starten und wurde wieder entfernt."
fi

say "Warten auf Netzwerk …"
for _ in $(seq 1 30); do
	pct exec "$ORDO_CTID" -- sh -c 'wget -q -O /dev/null http://dl-cdn.alpinelinux.org/alpine/' 2>/dev/null && break
	sleep 2
done
pct exec "$ORDO_CTID" -- sh -c 'wget -q -O /dev/null http://dl-cdn.alpinelinux.org/alpine/' 2>/dev/null ||
	die "Der Container kommt nicht ins Internet (Bridge/IP prüfen). Container $ORDO_CTID bleibt zum Nachsehen bestehen."

# ---------- Ordo einrichten ----------

script="$(mktemp)"
here="$(cd "$(dirname "${BASH_SOURCE[0]:-.}")" 2>/dev/null && pwd || true)"
if [ -f "$here/ordo-lxc.sh" ]; then
	cp "$here/ordo-lxc.sh" "$script"
else
	auth=()
	[ -n "$ORDO_TOKEN" ] && auth=(-H "Authorization: token $ORDO_TOKEN")
	curl -fsSL "${auth[@]}" "$RAW/install/ordo-lxc.sh" -o "$script" ||
		die "Konnte install/ordo-lxc.sh nicht laden (Internet erreichbar? Bei privatem Fork ORDO_TOKEN setzen)."
fi
# Den Ordner gibt es in der Alpine-Vorlage nicht von Haus aus
pct exec "$ORDO_CTID" -- mkdir -p /usr/local/sbin
pct push "$ORDO_CTID" "$script" /usr/local/sbin/ordo --perms 755
pct exec "$ORDO_CTID" -- test -s /usr/local/sbin/ordo ||
	die "Konnte den Befehl „ordo“ nicht in den Container kopieren. Container $ORDO_CTID bleibt zum Nachsehen bestehen."
say "Ordo im Container einrichten – Pakete, App bauen, Dienste (dauert 3–5 Minuten) …"
rm -f "$script"

pct exec "$ORDO_CTID" -- env \
	ORDO_DOMAIN="$ORDO_DOMAIN" ORDO_TOKEN="$ORDO_TOKEN" ORDO_PROXY_HOSTS="${ORDO_NEXTCLOUD:-}" \
	ORDO_REPO="${ORDO_REPO:-https://github.com/bischofone/ordo.git}" \
	ORDO_BRANCH="${ORDO_BRANCH:-main}" \
	/usr/local/sbin/ordo install "$ORDO_USER" "$ORDO_PASSWORD" ||
	die "Einrichtung im Container fehlgeschlagen. Nachsehen mit: pct enter $ORDO_CTID"

pct set "$ORDO_CTID" --memory "$ORDO_MEMORY" --swap 256 >/dev/null
case "$ORDO_AUTOUPDATE" in
[jJyY]*) pct exec "$ORDO_CTID" -- /usr/local/sbin/ordo auto-update an || true ;;
esac

# ---------- Fertig ----------

if [ -n "$ORDO_DOMAIN" ]; then
	url="https://$ORDO_DOMAIN"
else
	ip="$(pct exec "$ORDO_CTID" -- sh -c "ip -4 -o addr show eth0 | awk '{print \$4}' | cut -d/ -f1")"
	url="http://$ip"
fi

blue "
✓ Ordo läuft in Container $ORDO_CTID ($ORDO_HOSTNAME)
"
cat <<EOF
  App:       $url/
  CalDAV:    $url/dav/
  Benutzer:  $ORDO_USER
  Passwort:  $ORDO_PASSWORD

  In Ordo: Einstellungen → Sync → Konto hinzufügen, Server-Adresse $url/dav/

  Aktualisieren – im Container einfach „update“ eingeben, oder vom Host aus:
    pct exec $ORDO_CTID -- update                   neueste Version holen (Daten werden vorher gesichert)
    pct exec $ORDO_CTID -- ordo auto-update an      jede Nacht automatisch

  Pflege:
    pct exec $ORDO_CTID -- ordo benutzer            Benutzer verwalten (Menü)
    pct exec $ORDO_CTID -- ordo domain DOMAIN       Domain setzen (automatisch HTTPS)
    pct exec $ORDO_CTID -- ordo nextcloud ADRESSE   Nextcloud verbinden lassen (gegen CORS)
    pct exec $ORDO_CTID -- ordo status              Version und Adressen
EOF
if [ -z "$ORDO_DOMAIN" ]; then
	cat <<EOF

  Hinweis: Als App installieren (PWA) geht nur über HTTPS. Entweder eine Domain setzen
  (Port 80/443 zum Container weiterleiten) oder einen vorhandenen Reverse-Proxy
  (z. B. Nginx Proxy Manager) auf $url zeigen lassen.
EOF
fi
echo
