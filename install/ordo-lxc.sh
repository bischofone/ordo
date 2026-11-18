#!/bin/sh
# Ordo in einem Alpine-Linux-Container einrichten und pflegen.
# Wird von install/proxmox.sh als /usr/local/sbin/ordo in den Container gelegt.
#
#   ordo install NAME [PASSWORT]   Pakete, App, CalDAV und Webserver einrichten, ersten Benutzer anlegen
#   ordo update                    neueste Version von GitHub holen und bauen
#   ordo user-add NAME [PASSWORT]  Benutzer anlegen oder Passwort ändern (ohne Passwort: wird erzeugt)
#   ordo user-del NAME             Benutzer entfernen (seine Daten bleiben liegen)
#   ordo domain [DOMAIN]           Domain setzen (mit Domain: automatisch HTTPS), leer = nur HTTP auf Port 80
#   ordo nextcloud ADRESSE         Weiterleitung zu Nextcloud (o. a. CalDAV-Server ohne CORS) erlauben
#   ordo nextcloud-entfernen HOST  Weiterleitung wieder entfernen
#   ordo status                    Version, Dienste, Adressen
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
	apk add -q caddy radicale py3-bcrypt apache2-utils ca-certificates tzdata
}

# ---------- App bauen ----------

build_app() {
	say "Ordo herunterladen und bauen (dauert ein paar Minuten) …"
	apk add -q --virtual .ordo-build nodejs npm git
	# pnpm am liebsten als Alpine-Paket; sonst über npm (mit sichtbaren Fehlern)
	if ! apk add -q --virtual .ordo-pnpm pnpm 2>/dev/null; then
		npm install -g --no-fund --no-audit pnpm@10 || die "pnpm ließ sich nicht installieren."
	fi
	command -v pnpm >/dev/null || die "pnpm fehlt nach der Installation (PATH: $PATH)."

	src="$(mktemp -d)"
	url="$REPO"
	if [ -n "${ORDO_TOKEN:-}" ]; then
		url="$(echo "$REPO" | sed "s#https://#https://x-access-token:${ORDO_TOKEN}@#")"
	fi
	git clone -q --depth 1 --branch "$BRANCH" "$url" "$src" ||
		die "Herunterladen fehlgeschlagen. Internet erreichbar? Bei privatem Fork ORDO_TOKEN setzen."
	commit="$(git -C "$src" rev-parse --short HEAD)"

	(
		cd "$src"
		export CI=true
		pnpm install --frozen-lockfile --silent
		pnpm build >/dev/null
	) || die "Bauen fehlgeschlagen."

	mkdir -p "$(dirname "$APP_DIR")"
	rm -rf "$APP_DIR.neu"
	cp -r "$src/build" "$APP_DIR.neu"
	echo "$commit" >"$APP_DIR.neu/.version"
	rm -rf "$APP_DIR.alt"
	[ -d "$APP_DIR" ] && mv "$APP_DIR" "$APP_DIR.alt"
	mv "$APP_DIR.neu" "$APP_DIR"
	rm -rf "$APP_DIR.alt"

	say "Aufräumen (Node.js und Quellcode werden nicht mehr gebraucht) …"
	store="$(cd "$src" && pnpm store path 2>/dev/null || true)"
	rm -rf "$src" "${store:-/nonexistent}" /root/.npm /root/.cache /root/.local/share/pnpm
	npm uninstall -g --silent pnpm >/dev/null 2>&1 || true
	apk del -q .ordo-pnpm >/dev/null 2>&1 || true
	apk del -q .ordo-build
	rm -rf /var/cache/apk/*
	say "Ordo $commit ist gebaut."
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

user_add() {
	name="${1:-}"
	pass="${2:-}"
	[ -n "$name" ] || die "Name fehlt: ordo user-add NAME [PASSWORT]"
	generated=""
	if [ -z "$pass" ]; then
		pass="$(gen_password)"
		generated=1
	fi
	touch "$USERS"
	htpasswd -bB "$USERS" "$name" "$pass" >/dev/null 2>&1
	chown root:radicale "$USERS"
	chmod 640 "$USERS"
	say "Benutzer „$name“ angelegt."
	[ -n "$generated" ] && printf '  Passwort: %s\n' "$pass"
	return 0
}

user_del() {
	[ -n "${1:-}" ] || die "Name fehlt: ordo user-del NAME"
	htpasswd -D "$USERS" "$1" >/dev/null 2>&1 || die "Benutzer „$1“ gibt es nicht."
	say "Benutzer „$1“ entfernt (Daten liegen weiter unter $DATA)."
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
	build_app
	write_radicale_config
	write_caddyfile
	[ -n "${1:-}" ] && user_add "$1" "${2:-}"
	enable_services
	cmd_status
}

cmd_update() {
	build_app
	rc-service caddy reload >/dev/null 2>&1 || rc-service caddy restart >/dev/null
	say "Fertig. Geöffnete Apps laden die neue Version beim nächsten Start."
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
	printf 'Ordo-Version: %s\n' "$(cat "$APP_DIR/.version" 2>/dev/null || echo '–')"
	printf 'Radicale:     %s\n' "$(rc-service radicale status 2>/dev/null | sed 's/.*: //' || echo '–')"
	printf 'Caddy:        %s\n' "$(rc-service caddy status 2>/dev/null | sed 's/.*: //' || echo '–')"
	printf 'Benutzer:     %s\n' "$(cut -d: -f1 "$USERS" 2>/dev/null | tr '\n' ' ')"
	printf 'Nextcloud:    %s\n' "$(tr '\n' ' ' <"$CONF_DIR/proxy-hosts" 2>/dev/null || echo '–')"
	echo
	for a in $(addresses); do
		printf 'App:     %s/\n' "$a"
		printf 'CalDAV:  %s/dav/\n' "$a"
	done
	echo
}

case "${1:-}" in
install) shift && cmd_install "$@" ;;
update) cmd_update ;;
user-add) shift && user_add "$@" ;;
user-del) shift && user_del "$@" ;;
domain) shift && cmd_domain "$@" ;;
nextcloud) shift && cmd_nextcloud "$@" ;;
nextcloud-entfernen) shift && cmd_nextcloud_remove "$@" ;;
status) cmd_status ;;
*) sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//' ;;
esac
