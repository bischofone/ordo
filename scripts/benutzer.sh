#!/usr/bin/env bash
# Benutzer des LOKALEN Test-Servers (pnpm radicale) verwalten – zum Ausprobieren auf dem
# eigenen Rechner. Auf dem echten Server: „ordo benutzer“ (Proxmox) bzw. docker/benutzer.sh.
#
#   pnpm benutzer                   alle Benutzer anzeigen
#   pnpm benutzer neu NAME          anlegen (Passwort wird erzeugt und angezeigt)
#   pnpm benutzer passwort NAME     Passwort neu setzen
#   pnpm benutzer loeschen NAME     entfernen (Daten bleiben unter dev/radicale/data)
#
# Lokal stehen die Passwörter im Klartext in dev/radicale/users (nur für Tests, nie im Betrieb).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
USERS="$ROOT/dev/radicale/users"
mkdir -p "$(dirname "$USERS")"
[ -f "$USERS" ] || echo "test:test" >"$USERS"

say() { printf '\033[1;34m›\033[0m %s\n' "$*"; }
die() {
	printf '\033[1;31m✗\033[0m %s\n' "$*" >&2
	exit 1
}
exists() { cut -d: -f1 "$USERS" | grep -qx "$1"; }
gen_password() {
	local p
	p="$(head -c 512 /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9')"
	printf '%.12s' "$p"
}
remove() { grep -v "^$1:" "$USERS" >"$USERS.neu" || true; mv "$USERS.neu" "$USERS"; }
access() {
	echo
	printf '  ┌ Zugangsdaten für %s (lokal)\n' "$1"
	printf '  │ Ordo öffnen:     http://localhost:5173/\n'
	printf '  │ Server-Adresse:  http://localhost:5173/dav/\n'
	printf '  │ Benutzer:        %s\n' "$1"
	printf '  │ Passwort:        %s\n' "$2"
	printf '  └ In Ordo: Einstellungen → Sync → „Anderer CalDAV-Server“.\n'
	printf '    Tipp: zweiten Benutzer in einem privaten Fenster ausprobieren (eigene lokale Daten).\n\n'
}

name="$(printf '%s' "${2:-}" | tr 'A-Z' 'a-z')"
need_name() {
	[ -n "$name" ] || die "Name fehlt: pnpm benutzer $1 NAME"
	printf '%s' "$name" | grep -Eq '^[a-z0-9][a-z0-9._-]{0,31}$' ||
		die "Ungültiger Name – erlaubt: Kleinbuchstaben, Ziffern, Punkt, - und _"
}

case "${1:-}" in
neu)
	need_name neu
	exists "$name" && die "„$name“ gibt es schon. Passwort ändern: pnpm benutzer passwort $name"
	pass="$(gen_password)"
	echo "$name:$pass" >>"$USERS"
	say "Benutzer „$name“ angelegt."
	access "$name" "$pass"
	;;
passwort)
	need_name passwort
	exists "$name" || die "Benutzer „$name“ gibt es nicht."
	pass="$(gen_password)"
	remove "$name"
	echo "$name:$pass" >>"$USERS"
	say "Neues Passwort für „$name“."
	access "$name" "$pass"
	;;
loeschen)
	need_name loeschen
	exists "$name" || die "Benutzer „$name“ gibt es nicht."
	remove "$name"
	say "Benutzer „$name“ entfernt (Daten bleiben unter dev/radicale/data)."
	;;
"" | liste)
	echo "Benutzer des lokalen Test-Servers:"
	while IFS=: read -r u p; do printf '  %-16s Passwort: %s\n' "$u" "$p"; done <"$USERS"
	echo
	sed -n '5,8p' "$0" | sed 's/^# \{0,1\}//'
	;;
*) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//' ;;
esac
