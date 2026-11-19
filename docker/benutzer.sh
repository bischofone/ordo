#!/bin/sh
# Ordo-Benutzer (CalDAV) verwalten – für die Docker-Installation. Im Ordner docker/:
#
#   ./benutzer.sh                 alle Benutzer anzeigen
#   ./benutzer.sh neu NAME        anlegen (sicheres Passwort wird erzeugt und angezeigt)
#   ./benutzer.sh passwort NAME   Passwort neu setzen
#   ./benutzer.sh loeschen NAME   entfernen (seine Aufgaben bleiben im Volume)
#
# Braucht kein installiertes htpasswd – notfalls läuft es kurz in einem Docker-Container.
# Radicale liest die Datei bei jeder Anmeldung neu, ein Neustart ist nicht nötig.
set -eu
cd "$(dirname "$0")"
USERS=radicale/users

say() { printf '\033[1;34m›\033[0m %s\n' "$*"; }
die() {
	printf '\033[1;31m✗\033[0m %s\n' "$*" >&2
	exit 1
}

htp() {
	if command -v htpasswd >/dev/null 2>&1; then
		htpasswd "$@" 2>/dev/null
	else
		# Dateipfad im Container: /r/users
		args=""
		for a in "$@"; do [ "$a" = "$USERS" ] && a=/r/users; args="$args $(printf "'%s'" "$a")"; done
		eval "docker run --rm -v \"\$PWD/radicale:/r\" httpd:2-alpine htpasswd $args" 2>/dev/null
	fi
}

gen_password() {
	p="$(head -c 512 /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9')"
	printf '%.16s' "$p"
}
exists() { [ -f "$USERS" ] && cut -d: -f1 "$USERS" | grep -qx "$1"; }
domain() { sed -n 's/^DOMAIN=//p' .env 2>/dev/null | head -1; }

access() {
	d="$(domain)"
	echo
	printf '  ┌ Zugangsdaten für %s\n' "$1"
	printf '  │ Ordo öffnen:     https://%s/\n' "${d:-DEINE-DOMAIN}"
	printf '  │ Server-Adresse:  https://%s/dav/\n' "${d:-DEINE-DOMAIN}"
	printf '  │ Benutzer:        %s\n' "$1"
	printf '  │ Passwort:        %s\n' "$2"
	printf '  └ In Ordo: Einstellungen → Sync → „Anderer CalDAV-Server“.\n\n'
}

name="$(printf '%s' "${2:-}" | tr 'A-Z' 'a-z')"
need_name() {
	[ -n "$name" ] || die "Name fehlt: ./benutzer.sh $1 NAME"
	printf '%s' "$name" | grep -Eq '^[a-z0-9][a-z0-9._-]{0,31}$' ||
		die "Ungültiger Name – erlaubt: Kleinbuchstaben, Ziffern, Punkt, - und _"
}

case "${1:-}" in
neu)
	need_name neu
	exists "$name" && die "„$name“ gibt es schon. Passwort ändern: ./benutzer.sh passwort $name"
	touch "$USERS"
	pass="$(gen_password)"
	htp -bB "$USERS" "$name" "$pass" >/dev/null
	say "Benutzer „$name“ angelegt."
	access "$name" "$pass"
	;;
passwort)
	need_name passwort
	exists "$name" || die "Benutzer „$name“ gibt es nicht."
	pass="$(gen_password)"
	htp -bB "$USERS" "$name" "$pass" >/dev/null
	say "Neues Passwort für „$name“."
	access "$name" "$pass"
	;;
loeschen)
	need_name loeschen
	exists "$name" || die "Benutzer „$name“ gibt es nicht."
	htp -D "$USERS" "$name" >/dev/null
	say "Benutzer „$name“ entfernt (seine Aufgaben bleiben im Volume radicale-data)."
	;;
"" | liste)
	if [ -s "$USERS" ]; then
		echo "Benutzer:"
		cut -d: -f1 "$USERS" | sort | sed 's/^/  /'
	else
		echo "Noch keine Benutzer."
	fi
	echo
	sed -n '4,7p' "$0" | sed 's/^# \{0,1\}//'
	;;
*) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//' ;;
esac
