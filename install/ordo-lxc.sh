#!/bin/sh
# Ordo in einem Alpine-Linux-Container einrichten und pflegen.
# Wird von install/proxmox.sh als /usr/local/sbin/ordo in den Container gelegt.
#
#   ordo install NAME [PASSWORT]   Pakete, App, CalDAV und Webserver einrichten, ersten Benutzer anlegen
#   update                         Kurzform für „ordo update“
#   ordo update [--neu] [--quelle] neueste Version holen (--neu: auch wenn aktuell, --quelle: selbst bauen)
#   ordo auto-update an|aus        jede Nacht automatisch aktualisieren
#   ordo benutzer                  Benutzer verwalten – Menü: anlegen, Passwort, Zugangsdaten, löschen
#   ordo user-list                 Benutzer mit Listen, Aufgaben und letzter Änderung
#   ordo user-add NAME [PASSWORT]  Benutzer anlegen (ohne Passwort: sicheres wird erzeugt)
#   ordo user-passwd NAME [PASSW.] Passwort neu setzen (ohne Passwort: wird erzeugt)
#   ordo user-del NAME [--daten]   Benutzer entfernen (--daten: auch seine Aufgaben, vorher gesichert)
#   ordo domain [DOMAIN]           Domain setzen (mit Domain: automatisch HTTPS), leer = nur HTTP auf Port 80
#   ordo nextcloud ADRESSE         Weiterleitung zu Nextcloud (o. a. CalDAV-Server ohne CORS) erlauben
#   ordo nextcloud-entfernen HOST  Weiterleitung wieder entfernen
#   ordo sicherung                 Aufgaben und Benutzer sichern (nach /var/backups/ordo)
#   ordo status                    Version, Dienste, Adressen
#
# Updates: GitHub baut nach jedem erfolgreich getesteten Stand ein fertiges Paket
# (Release „main-build“). „update“ lädt es, prüft die Prüfsumme, sichert vorher die Daten,
# aktualisiert auch diesen Befehl selbst und passt die Einstellungen an. Ohne Paket (privater
# Fork, anderer Zweig, GitHub nicht erreichbar) wird aus dem Quellcode gebaut.
#
# Einstellungen über Umgebungsvariablen:
#   ORDO_REPO    Git-Adresse   (Standard: https://github.com/bischofone/ordo.git)
#   ORDO_BRANCH  Zweig         (Standard: main)
#   ORDO_TOKEN   GitHub-Token, nur für private Forks nötig
#   ORDO_DOMAIN  Domain beim ersten Einrichten (sonst nur HTTP auf Port 80)
#   ORDO_PROXY_HOSTS  Nextcloud-Server für die Weiterleitung, z. B. cloud.example.com
set -eu
# Feste Suchpfade – „pct exec“ bringt je nach Proxmox-Version einen knappen PATH mit
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

REPO="${ORDO_REPO:-https://github.com/bischofone/ordo.git}"
BRANCH="${ORDO_BRANCH:-main}"
APP_DIR=/var/www/ordo
CONF_DIR=/etc/ordo
USERS=/etc/radicale/users
DATA=/var/lib/radicale/collections
BACKUPS=/var/backups/ordo
RELEASE_TAG=main-build

say() { printf '\033[1;34m›\033[0m %s\n' "$*"; }
die() {
	printf '\033[1;31m✗\033[0m %s\n' "$*" >&2
	exit 1
}

[ "$(id -u)" = 0 ] || die "Bitte als root ausführen."
[ -f /etc/alpine-release ] || die "Dieses Skript ist für Alpine Linux gedacht."

gen_password() {
	p="$(head -c 512 /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9')"
	printf '%.16s' "$p"
}

# ---------- Pakete ----------

install_packages() {
	say "Pakete installieren …"
	# Caddy und Radicale liegen in „community“
	ver="$(cut -d. -f1,2 /etc/alpine-release)"
	grep -q '/community' /etc/apk/repositories ||
		echo "https://dl-cdn.alpinelinux.org/alpine/v$ver/community" >>/etc/apk/repositories
	apk update -q
	apk add -q caddy radicale py3-bcrypt apache2-utils ca-certificates tzdata curl
}

# ---------- App holen ----------

dl() { curl -fsSL --retry 3 --connect-timeout 20 -o "$2" "$1"; }

# „besitzer/name“ des GitHub-Repos – leer bei anderen Servern
github_repo() {
	printf '%s' "$REPO" | sed -E 's#\.git$##; s#/+$##' | sed -nE 's#^https://github\.com/([^/]+/[^/]+)$#\1#p'
}

# Woher das fertige Paket kommt (leer → aus dem Quellcode bauen)
release_url() {
	if [ -n "${ORDO_RELEASE_URL:-}" ]; then
		echo "$ORDO_RELEASE_URL"
		return
	fi
	[ -z "${ORDO_TOKEN:-}" ] && [ "$BRANCH" = main ] || return 0
	r="$(github_repo)"
	[ -n "$r" ] && echo "https://github.com/$r/releases/download/$RELEASE_TAG"
	return 0
}

# Steckbrief des fertigen Pakets lesen → REL_COMMIT, REL_VERSION, REL_APP_SHA, REL_SCRIPT_SHA
read_release() {
	base="$(release_url)"
	[ -n "$base" ] || return 1
	dl "$base/version.txt" "$WORK/version.txt" 2>/dev/null || return 1
	REL_COMMIT="$(sed -n 's/^commit=//p' "$WORK/version.txt" | cut -c1-7)"
	REL_VERSION="$(sed -n 's/^version=//p' "$WORK/version.txt")"
	REL_APP_SHA="$(sed -n 's/^app_sha256=//p' "$WORK/version.txt")"
	REL_SCRIPT_SHA="$(sed -n 's/^script_sha256=//p' "$WORK/version.txt")"
	[ -n "$REL_COMMIT" ] && [ -n "$REL_APP_SHA" ]
}

# Neuester Stand auf GitHub (kann noch in der Prüfung sein) – leer, wenn unbekannt
latest_commit() {
	r="$(github_repo)"
	[ -n "$r" ] && [ -z "${ORDO_TOKEN:-}" ] || return 0
	curl -fsS --connect-timeout 10 -H 'Accept: application/vnd.github.sha' \
		"https://api.github.com/repos/$r/commits/$BRANCH" 2>/dev/null | cut -c1-7 || true
}

sha_ok() { [ "$(sha256sum "$1" | cut -d' ' -f1)" = "$2" ]; }

installed_commit() { cat "$APP_DIR/.version" 2>/dev/null || true; }

# Neue App-Dateien (Ordner $1) an die Stelle der alten setzen – in einem Rutsch
swap_app() {
	echo "$2" >"$1/.version"
	[ -n "${3:-}" ] && echo "$3" >"$1/.ordo-version"
	mkdir -p "$(dirname "$APP_DIR")"
	rm -rf "$APP_DIR.alt"
	[ -d "$APP_DIR" ] && mv "$APP_DIR" "$APP_DIR.alt"
	mv "$1" "$APP_DIR"
	rm -rf "$APP_DIR.alt"
}

# Den Befehl „ordo“ ersetzen (neue Unterbefehle, Korrekturen) und die Kurzform „update“ anlegen
install_self() {
	mkdir -p /usr/local/sbin /usr/local/bin
	if [ -n "${1:-}" ] && [ -s "$1" ] && ! cmp -s "$1" /usr/local/sbin/ordo; then
		cp "$1" /usr/local/sbin/ordo.neu && chmod 755 /usr/local/sbin/ordo.neu &&
			mv /usr/local/sbin/ordo.neu /usr/local/sbin/ordo
	fi
	cat >/usr/local/bin/update <<'EOF'
#!/bin/sh
# Ordo aktualisieren – Kurzform für „ordo update“
exec /usr/local/sbin/ordo update "$@"
EOF
	chmod 755 /usr/local/bin/update
	cat >/etc/motd <<'EOF'

  Ordo – Aufgaben in Ordnung
    update          neueste Version holen
    ordo benutzer   Benutzer verwalten
    ordo status     Version, Dienste, Adressen
    ordo            alle Befehle

EOF
}

# Fertiges Paket laden und einsetzen (Steckbrief muss schon gelesen sein)
fetch_app() {
	base="$(release_url)"
	say "Ordo $REL_COMMIT herunterladen …"
	dl "$base/ordo-app.tar.gz" "$WORK/ordo-app.tar.gz" || return 1
	if ! sha_ok "$WORK/ordo-app.tar.gz" "$REL_APP_SHA"; then
		say "Prüfsumme stimmt nicht (Paket wird vielleicht gerade erneuert)."
		return 1
	fi
	rm -rf "$APP_DIR.neu"
	mkdir -p "$APP_DIR.neu"
	tar xzf "$WORK/ordo-app.tar.gz" -C "$APP_DIR.neu" || return 1
	[ -s "$APP_DIR.neu/index.html" ] || return 1
	swap_app "$APP_DIR.neu" "$REL_COMMIT" "$REL_VERSION"
	say "Ordo $REL_VERSION ($REL_COMMIT) ist installiert."
}

# Bauwerkzeuge wieder entfernen (auch nach einem Fehler)
build_cleanup() {
	store="$(cd "$WORK/src" 2>/dev/null && pnpm store path 2>/dev/null || true)"
	rm -rf "$WORK/src" "${store:-/nonexistent}" /root/.npm /root/.cache /root/.local/share/pnpm
	npm uninstall -g --silent pnpm >/dev/null 2>&1 || true
	apk del -q .ordo-pnpm >/dev/null 2>&1 || true
	apk del -q .ordo-build >/dev/null 2>&1 || true
	rm -rf /var/cache/apk/*
}

# Aus dem Quellcode bauen – braucht ein paar Minuten und etwa 1 GB Arbeitsspeicher
build_app() {
	say "Ordo herunterladen und bauen (dauert ein paar Minuten) …"
	apk add -q --virtual .ordo-build nodejs npm git
	# pnpm am liebsten als Alpine-Paket; sonst über npm (mit sichtbaren Fehlern)
	if ! apk add -q --virtual .ordo-pnpm pnpm 2>/dev/null; then
		npm install -g --no-fund --no-audit pnpm@10 || die "pnpm ließ sich nicht installieren."
	fi
	command -v pnpm >/dev/null || die "pnpm fehlt nach der Installation (PATH: $PATH)."

	src="$WORK/src"
	url="$REPO"
	if [ -n "${ORDO_TOKEN:-}" ]; then
		url="$(echo "$REPO" | sed "s#https://#https://x-access-token:${ORDO_TOKEN}@#")"
	fi
	git clone -q --depth 1 --branch "$BRANCH" "$url" "$src" || {
		build_cleanup
		die "Herunterladen fehlgeschlagen. Internet erreichbar? Bei privatem Fork ORDO_TOKEN setzen."
	}
	commit="$(git -C "$src" rev-parse --short=7 HEAD)"
	version="$(sed -n 's/^[[:space:]]*"version": "\(.*\)".*/\1/p' "$src/package.json" | head -1)"
	install_self "$src/install/ordo-lxc.sh"

	(
		cd "$src"
		export CI=true ORDO_COMMIT="$commit"
		pnpm install --frozen-lockfile --silent
		pnpm build >/dev/null
	) || {
		build_cleanup
		die "Bauen fehlgeschlagen – die bisherige Version läuft unverändert weiter."
	}

	rm -rf "$APP_DIR.neu"
	cp -r "$src/build" "$APP_DIR.neu"
	swap_app "$APP_DIR.neu" "$commit" "$version"

	say "Aufräumen (Node.js und Quellcode werden nicht mehr gebraucht) …"
	build_cleanup
	say "Ordo $version ($commit) ist gebaut."
}

# Erst das fertige Paket versuchen, sonst selbst bauen
get_app() {
	if [ -z "${1:-}" ]; then
		if { [ -n "${REL_COMMIT:-}" ] || read_release; } && fetch_app; then return 0; fi
		say "Kein fertiges Paket verfügbar – Ordo wird aus dem Quellcode gebaut."
	fi
	build_app
}

# ---------- Sicherung ----------

backup_data() {
	[ -d "$DATA" ] || return 0
	mkdir -p "$BACKUPS"
	chmod 700 "$BACKUPS"
	f="$BACKUPS/ordo-$(date +%Y-%m-%d_%H%M%S).tar.gz"
	set -- "${DATA#/}"
	[ -f "$USERS" ] && set -- "$@" "${USERS#/}"
	[ -d "$CONF_DIR" ] && set -- "$@" "${CONF_DIR#/}"
	tar czf "$f" -C / "$@" ||
		die "Sicherung fehlgeschlagen – Update abgebrochen, nichts wurde verändert."
	# Die letzten 5 Sicherungen behalten
	ls -1t "$BACKUPS"/ordo-*.tar.gz 2>/dev/null | tail -n +6 | xargs -r rm -f
	say "Daten gesichert: $f"
}

# ---------- Konfiguration ----------

write_radicale_config() {
	mkdir -p /etc/radicale "$DATA"
	cat >/etc/radicale/config <<EOF
# Von „ordo install“ erzeugt.
[server]
hosts = 127.0.0.1:5232

[auth]
type = htpasswd
htpasswd_filename = $USERS
htpasswd_encryption = bcrypt
# Schutz gegen Passwort-Raten
delay = 1

[rights]
# Jeder sieht nur seine eigenen Listen
type = owner_only

[storage]
filesystem_folder = $DATA

[logging]
level = warning
EOF
	chown -R radicale:radicale "$(dirname "$DATA")"
}

# Erlaubte Server für die Weiterleitung, als Regex-Alternative (Punkte maskiert)
proxy_regex() {
	[ -s "$CONF_DIR/proxy-hosts" ] || return 0
	sed 's/\./\\./g' "$CONF_DIR/proxy-hosts" | paste -sd '|' -
}

write_caddyfile() {
	domain="$(cat "$CONF_DIR/domain" 2>/dev/null || true)"
	site="${domain:-:80}"
	hosts="$(proxy_regex)"
	ext=""
	if [ -n "$hosts" ]; then
		ext="
	# Weiterleitung zu CalDAV-Servern ohne CORS (z. B. Nextcloud): /ext/HOST/… → https://HOST/…
	@ext path_regexp ext ^/ext/($hosts)(/.*)\$
	handle @ext {
		rewrite * {re.ext.2}
		reverse_proxy {re.ext.1}:443 {
			header_up Host {re.ext.1}
			header_down -WWW-Authenticate
			transport http {
				tls
				tls_server_name {re.ext.1}
			}
		}
	}
	handle /ext/* {
		respond \"Weiterleitung zu diesem Server nicht erlaubt (ordo nextcloud HOST)\" 403
	}
"
	fi
	cat >/etc/caddy/Caddyfile <<EOF
# Von „ordo“ erzeugt. Domain ändern mit: ordo domain DEINE-DOMAIN
{
	admin off
}

$site {
	encode zstd gzip

	# CalDAV unter /dav/ – Radicale erfährt den Präfix über X-Script-Name
	handle_path /dav/* {
		reverse_proxy 127.0.0.1:5232 {
			header_up X-Script-Name /dav
		}
	}
	redir /.well-known/caldav /dav/ 301
$ext
	# Die App: statische Dateien, unbekannte Pfade → index.html
	handle {
		root * $APP_DIR
		header /service-worker.js Cache-Control "no-cache"
		header /_app/immutable/* Cache-Control "public, max-age=31536000, immutable"
		try_files {path} /index.html
		file_server
	}
}
EOF
	caddy fmt --overwrite /etc/caddy/Caddyfile >/dev/null 2>&1 || true
}

enable_services() {
	rc-update add radicale default >/dev/null 2>&1 || true
	rc-update add caddy default >/dev/null 2>&1 || true
	rc-service radicale restart >/dev/null
	rc-service caddy restart >/dev/null
}

# ---------- Benutzer ----------

# Jeder Benutzer hat seine eigenen Listen (Radicale: owner_only) unter $DATA/collection-root/NAME
user_dir() { echo "$DATA/collection-root/$1"; }
user_exists() { [ -f "$USERS" ] && cut -d: -f1 "$USERS" | grep -qx "$1"; }
user_names() { [ -f "$USERS" ] && cut -d: -f1 "$USERS" | sort || true; }

valid_name() {
	printf '%s' "$1" | grep -Eq '^[a-z0-9][a-z0-9._-]{0,31}$' ||
		die "Ungültiger Name „$1“ – erlaubt: Kleinbuchstaben, Ziffern, Punkt, - und _ (max. 32 Zeichen)."
}

set_password() {
	touch "$USERS"
	htpasswd -bB "$USERS" "$1" "$2" >/dev/null 2>&1 || die "Passwort ließ sich nicht setzen."
	chown root:radicale "$USERS"
	chmod 640 "$USERS"
}

# Zugangsdaten zum Weitergeben
show_access() {
	name="$1"
	pass="${2:-}"
	app="$(addresses | head -1)"
	echo
	printf '  ┌ Zugangsdaten für %s\n' "$name"
	printf '  │ Ordo öffnen:     %s/\n' "$app"
	printf '  │ Server-Adresse:  %s/dav/\n' "$app"
	printf '  │ Benutzer:        %s\n' "$name"
	if [ -n "$pass" ]; then
		printf '  │ Passwort:        %s\n' "$pass"
	else
		printf '  │ Passwort:        (wird nicht gespeichert – neu setzen mit: ordo user-passwd %s)\n' "$name"
	fi
	printf '  └ In Ordo: Einstellungen → Sync → „Anderer CalDAV-Server“. Auch für Tasks.org/DAVx⁵.\n'
	echo
}

# Listen, Aufgaben und letzte Änderung eines Benutzers
user_stats() {
	d="$(user_dir "$1")"
	if [ ! -d "$d" ]; then
		echo "noch keine Daten"
		return
	fi
	lists="$(find "$d" -mindepth 1 -maxdepth 1 -type d ! -name '.*' | wc -l)"
	tasks="$(find "$d" -mindepth 2 -maxdepth 2 -type f -name '*.ics' | wc -l)"
	last="$(find "$d" -type f -name '*.ics' -exec stat -c %Y {} + 2>/dev/null | sort -n | tail -1)"
	when="–"
	[ -n "$last" ] && when="$(date -d "@$last" '+%d.%m.%Y %H:%M' 2>/dev/null || echo '?')"
	echo "$lists Listen · $tasks Einträge · zuletzt geändert $when"
}

user_add() {
	name="${1:-}"
	pass="${2:-}"
	[ -n "$name" ] || die "Name fehlt: ordo user-add NAME [PASSWORT]"
	name="$(printf '%s' "$name" | tr 'A-Z' 'a-z')"
	valid_name "$name"
	if user_exists "$name"; then
		die "„$name“ gibt es schon. Passwort ändern mit: ordo user-passwd $name"
	fi
	[ -n "$pass" ] || pass="$(gen_password)"
	set_password "$name" "$pass"
	say "Benutzer „$name“ angelegt."
	show_access "$name" "$pass"
}

user_passwd() {
	name="${1:-}"
	pass="${2:-}"
	[ -n "$name" ] || die "Name fehlt: ordo user-passwd NAME [PASSWORT]"
	user_exists "$name" || die "Benutzer „$name“ gibt es nicht."
	[ -n "$pass" ] || pass="$(gen_password)"
	set_password "$name" "$pass"
	say "Neues Passwort für „$name“ gesetzt."
	show_access "$name" "$pass"
	echo "  Auf den Geräten: Einstellungen → Sync → beim Konto „Passwort ändern“."
}

user_del() {
	name="${1:-}"
	[ -n "$name" ] || die "Name fehlt: ordo user-del NAME [--daten]"
	user_exists "$name" || die "Benutzer „$name“ gibt es nicht."
	htpasswd -D "$USERS" "$name" >/dev/null 2>&1 || die "Entfernen fehlgeschlagen."
	if [ "${2:-}" = "--daten" ] && [ -d "$(user_dir "$name")" ]; then
		backup_data
		rm -rf "$(user_dir "$name")"
		say "Benutzer „$name“ und seine Daten entfernt (vorher gesichert)."
	else
		say "Benutzer „$name“ entfernt. Seine Daten liegen weiter unter $(user_dir "$name")."
	fi
}

user_list() {
	names="$(user_names)"
	if [ -z "$names" ]; then
		echo "Noch keine Benutzer. Anlegen mit: ordo user-add NAME"
		return
	fi
	for n in $names; do printf '  %-16s %s\n' "$n" "$(user_stats "$n")"; done
}

# ---------- Benutzer-Menü ----------

ask_line() {
	printf '%s' "$1" >/dev/tty
	read -r REPLY </dev/tty || REPLY=""
}

pick_user() {
	names="$(user_names)"
	[ -n "$names" ] || {
		echo "  Es gibt noch keine Benutzer."
		return 1
	}
	i=0
	for n in $names; do
		i=$((i + 1))
		printf '   %d  %s\n' "$i" "$n"
	done
	ask_line "  Nummer oder Name (Enter = zurück): "
	[ -n "$REPLY" ] || return 1
	case "$REPLY" in
	*[!0-9]*) PICKED="$REPLY" ;;
	*) PICKED="$(echo "$names" | sed -n "${REPLY}p")" ;;
	esac
	user_exists "${PICKED:-}" || {
		echo "  Unbekannt: $REPLY"
		return 1
	}
}

cmd_users_menu() {
	[ -t 0 ] || [ -r /dev/tty ] || die "Das Menü braucht ein Terminal. Ohne Menü: ordo user-list / user-add / user-passwd / user-del"
	while true; do
		printf '\n\033[1mOrdo – Benutzer\033[0m\n'
		user_list
		printf '\n  [n] Neu anlegen   [p] Passwort neu setzen   [z] Zugangsdaten zeigen   [l] Löschen   [q] Fertig\n'
		ask_line "  Auswahl: "
		case "$REPLY" in
		n | N)
			ask_line "  Name (z. B. maria): "
			[ -n "$REPLY" ] || continue
			name="$REPLY"
			ask_line "  Passwort (Enter = sicheres Passwort erzeugen): "
			(user_add "$name" "$REPLY") || true
			ask_line "  Weiter mit Enter …"
			;;
		p | P)
			pick_user || continue
			ask_line "  Neues Passwort (Enter = erzeugen): "
			(user_passwd "$PICKED" "$REPLY") || true
			ask_line "  Weiter mit Enter …"
			;;
		z | Z)
			pick_user || continue
			show_access "$PICKED"
			ask_line "  Weiter mit Enter …"
			;;
		l | L)
			pick_user || continue
			echo "  $(user_stats "$PICKED")"
			ask_line "  Zum Bestätigen den Namen „$PICKED“ eintippen: "
			[ "$REPLY" = "$PICKED" ] || {
				echo "  Abgebrochen."
				continue
			}
			ask_line "  Auch seine Aufgaben auf dem Server löschen? (j/N): "
			case "$REPLY" in
			j | J) (user_del "$PICKED" --daten) || true ;;
			*) (user_del "$PICKED") || true ;;
			esac
			;;
		q | Q | "") return 0 ;;
		*) echo "  Bitte n, p, z, l oder q." ;;
		esac
	done
}

# ---------- Befehle ----------

addresses() {
	domain="$(cat "$CONF_DIR/domain" 2>/dev/null || true)"
	if [ -n "$domain" ]; then
		echo "https://$domain"
	else
		ip -4 -o addr show scope global 2>/dev/null | awk '{sub(/\/.*/, "", $4); print "http://" $4}'
	fi
}

cmd_install() {
	mkdir -p "$CONF_DIR"
	[ -n "${ORDO_DOMAIN:-}" ] && echo "$ORDO_DOMAIN" >"$CONF_DIR/domain"
	for h in $(printf '%s' "${ORDO_PROXY_HOSTS:-}" | tr ',' ' '); do
		h="$(host_of "$h")"
		[ -n "$h" ] && { grep -qx "$h" "$CONF_DIR/proxy-hosts" 2>/dev/null || echo "$h" >>"$CONF_DIR/proxy-hosts"; }
	done
	install_packages
	get_app
	install_self
	write_radicale_config
	write_caddyfile
	if [ -n "${1:-}" ]; then
		if user_exists "$1"; then user_passwd "$1" "${2:-}"; else user_add "$1" "${2:-}"; fi
	fi
	enable_services
	cmd_status
}

cmd_update() {
	force=""
	from_source=""
	for a in "$@"; do
		case "$a" in
		--neu | --force | -f) force=1 ;;
		--quelle) from_source=1 ;;
		*) die "Unbekannte Option: $a (erlaubt: --neu, --quelle)" ;;
		esac
	done
	command -v curl >/dev/null || apk add -q curl

	have="$(installed_commit)"
	if [ -z "$from_source" ] && read_release; then
		# 1. Zuerst diesen Befehl selbst erneuern und mit der neuen Fassung weitermachen
		if [ -z "${ORDO_SELF_UPDATED:-}" ] && [ -n "$REL_SCRIPT_SHA" ] &&
			dl "$(release_url)/ordo-lxc.sh" "$WORK/ordo-lxc.sh" &&
			sha_ok "$WORK/ordo-lxc.sh" "$REL_SCRIPT_SHA" &&
			! cmp -s "$WORK/ordo-lxc.sh" /usr/local/sbin/ordo; then
			install_self "$WORK/ordo-lxc.sh"
			say "Befehl „ordo“ aktualisiert."
			rm -rf "$WORK"
			ORDO_SELF_UPDATED=1 exec /usr/local/sbin/ordo update "$@"
		fi
		newest="$(latest_commit)"
		if [ -n "$newest" ] && [ "$newest" != "$REL_COMMIT" ]; then
			say "Hinweis: Der allerneueste Stand ($newest) wird auf GitHub gerade noch geprüft."
			echo "  Installiert wird der letzte geprüfte Stand ($REL_COMMIT). In ein paar Minuten nochmal „update“."
		fi
		if [ "$have" = "$REL_COMMIT" ] && [ -z "$force" ]; then
			install_self
			apply_config
			say "Ordo ist aktuell ($(cat "$APP_DIR/.ordo-version" 2>/dev/null || echo "?") · $have)."
			return 0
		fi
	fi

	backup_data
	say "Pakete aktualisieren …"
	install_packages
	get_app "$from_source"
	install_self
	apply_config
	rc-service caddy reload >/dev/null 2>&1 || rc-service caddy restart >/dev/null
	say "Fertig. Offene Ordo-Fenster zeigen „Neue Version“ und laden mit einem Klick neu."
}

# Erzeugte Einstellungen an die neue Version anpassen; Dienste nur bei Änderungen neu starten
apply_config() {
	before="$(cat /etc/radicale/config /etc/caddy/Caddyfile 2>/dev/null | cksum)"
	write_radicale_config
	write_caddyfile
	after="$(cat /etc/radicale/config /etc/caddy/Caddyfile 2>/dev/null | cksum)"
	if [ "$before" != "$after" ]; then
		say "Einstellungen angepasst."
		rc-service radicale restart >/dev/null 2>&1 || true
		rc-service caddy restart >/dev/null 2>&1 || true
	fi
}

AUTO=/etc/periodic/daily/ordo-update

cmd_auto_update() {
	case "${1:-}" in
	an | on | ja)
		cat >"$AUTO" <<'EOF'
#!/bin/sh
# Von „ordo auto-update an“ angelegt – jede Nacht neueste geprüfte Version holen
/usr/local/sbin/ordo update >>/var/log/ordo-update.log 2>&1
EOF
		chmod 755 "$AUTO"
		rc-update add crond default >/dev/null 2>&1 || true
		rc-service crond start >/dev/null 2>&1 || true
		say "Automatische Updates sind an (jede Nacht, Protokoll: /var/log/ordo-update.log)."
		;;
	aus | off | nein)
		rm -f "$AUTO"
		say "Automatische Updates sind aus. Aktualisieren mit: update"
		;;
	*) die "ordo auto-update an  oder  ordo auto-update aus" ;;
	esac
}

cmd_domain() {
	mkdir -p "$CONF_DIR"
	if [ -n "${1:-}" ]; then echo "$1" >"$CONF_DIR/domain"; else rm -f "$CONF_DIR/domain"; fi
	write_caddyfile
	rc-service caddy restart >/dev/null
	say "Erreichbar unter: $(addresses | head -1)"
}

# Adresse oder Host → nur der Host (cloud.example.com)
host_of() { printf '%s' "$1" | sed -E 's#^[a-zA-Z]+://##; s#[/:].*$##' | tr 'A-Z' 'a-z'; }

cmd_nextcloud() {
	[ -n "${1:-}" ] || die "Adresse fehlt: ordo nextcloud cloud.example.com"
	h="$(host_of "$1")"
	printf '%s' "$h" | grep -Eq '^[a-z0-9.-]+$' || die "Ungültige Adresse: $1"
	mkdir -p "$CONF_DIR"
	touch "$CONF_DIR/proxy-hosts"
	grep -qx "$h" "$CONF_DIR/proxy-hosts" || echo "$h" >>"$CONF_DIR/proxy-hosts"
	write_caddyfile
	rc-service caddy restart >/dev/null
	say "Weiterleitung zu $h eingerichtet."
	echo "  In Ordo: Einstellungen → Sync → Nextcloud verbinden, Adresse https://$h"
}

cmd_nextcloud_remove() {
	h="$(host_of "${1:-}")"
	[ -n "$h" ] || die "Host fehlt: ordo nextcloud-entfernen cloud.example.com"
	if [ -f "$CONF_DIR/proxy-hosts" ]; then
		grep -vx "$h" "$CONF_DIR/proxy-hosts" >"$CONF_DIR/proxy-hosts.neu" || true
		mv "$CONF_DIR/proxy-hosts.neu" "$CONF_DIR/proxy-hosts"
	fi
	write_caddyfile
	rc-service caddy restart >/dev/null
	say "Weiterleitung zu $h entfernt."
}

cmd_status() {
	echo
	printf 'Ordo-Version: %s (%s)\n' "$(cat "$APP_DIR/.ordo-version" 2>/dev/null || echo '?')" "$(installed_commit)"
	printf 'Auto-Update:  %s\n' "$([ -x "$AUTO" ] && echo an || echo 'aus (ordo auto-update an)')"
	printf 'Sicherungen:  %s\n' "$(ls -1 "$BACKUPS"/ordo-*.tar.gz 2>/dev/null | wc -l) in $BACKUPS"
	printf 'Radicale:     %s\n' "$(rc-service radicale status 2>/dev/null | sed 's/.*: //' || echo '–')"
	printf 'Caddy:        %s\n' "$(rc-service caddy status 2>/dev/null | sed 's/.*: //' || echo '–')"
	printf 'Benutzer:     %s  (verwalten: ordo benutzer)\n' "$(user_names | tr '\n' ' ')"
	printf 'Nextcloud:    %s\n' "$(if [ -s "$CONF_DIR/proxy-hosts" ]; then tr '\n' ' ' <"$CONF_DIR/proxy-hosts"; else echo '–'; fi)"
	echo
	for a in $(addresses); do
		printf 'App:     %s/\n' "$a"
		printf 'CalDAV:  %s/dav/\n' "$a"
	done
	echo
}

# Arbeitsordner für Downloads; wird am Ende immer aufgeräumt
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

case "${1:-}" in
install) shift && cmd_install "$@" ;;
update) shift && cmd_update "$@" ;;
auto-update) shift && cmd_auto_update "$@" ;;
sicherung) backup_data ;;
benutzer | users) cmd_users_menu ;;
user-list) user_list ;;
user-add) shift && user_add "$@" ;;
user-passwd) shift && user_passwd "$@" ;;
user-del) shift && user_del "$@" ;;
domain) shift && cmd_domain "$@" ;;
nextcloud) shift && cmd_nextcloud "$@" ;;
nextcloud-entfernen) shift && cmd_nextcloud_remove "$@" ;;
status) cmd_status ;;
*) sed -n '2,/^set -eu/p' "$0" | grep '^#' | sed 's/^# \{0,1\}//' ;;
esac
