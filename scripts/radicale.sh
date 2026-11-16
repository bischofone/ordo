#!/usr/bin/env bash
# Startet einen lokalen Radicale-CalDAV-Server für Entwicklung und Tests.
#   scripts/radicale.sh [port] [datenordner]
# Benutzer: test / Passwort: test (nur lokal!). CORS ist offen, damit die Browser-App
# direkt darauf zugreifen kann. Für den echten Server siehe docker/.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${1:-5232}"
DATA="${2:-$ROOT/dev/radicale/data}"
VENV="$ROOT/dev/radicale/.venv"

if [ ! -x "$VENV/bin/radicale" ]; then
	echo "Radicale wird eingerichtet (einmalig) …"
	python3 -m venv "$VENV"
	"$VENV/bin/pip" install -q "radicale==3.9.1"
fi

mkdir -p "$DATA"
CONF="$(mktemp)"
USERS="$ROOT/dev/radicale/users"
[ -f "$USERS" ] || echo "test:test" > "$USERS"
cat > "$CONF" <<CONF
[server]
hosts = 127.0.0.1:$PORT
[auth]
type = htpasswd
htpasswd_filename = $USERS
htpasswd_encryption = plain
[storage]
filesystem_folder = $DATA
[rights]
type = owner_only
[logging]
level = warning
[headers]
Access-Control-Allow-Origin = *
Access-Control-Allow-Methods = GET, PUT, DELETE, PROPFIND, PROPPATCH, REPORT, MKCALENDAR, MKCOL, OPTIONS
Access-Control-Allow-Headers = Authorization, Content-Type, Depth, If-Match, If-None-Match, Prefer
Access-Control-Expose-Headers = ETag
CONF
exec "$VENV/bin/radicale" --config "$CONF"
