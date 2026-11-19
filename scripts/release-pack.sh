#!/bin/sh
# Fertiges Update-Paket schnüren (nach „pnpm build“) – macht die CI nach jedem geprüften Stand.
#   scripts/release-pack.sh [ZIELORDNER]   (Standard: release/)
# Ergebnis: ordo-app.tar.gz (die App), ordo-lxc.sh (Befehl „ordo“), version.txt (Steckbrief
# mit Prüfsummen). „update“ im LXC lädt genau diese Dateien.
set -eu
out="${1:-release}"
[ -s build/index.html ] || {
	echo "build/ fehlt – erst pnpm build" >&2
	exit 1
}
rm -rf "$out"
mkdir -p "$out"
commit="${ORDO_COMMIT:-$(git rev-parse HEAD)}"
version="$(node -p "require('./package.json').version")"
# Feste Reihenfolge und Zeiten → gleiche Dateien ergeben das gleiche Paket
tar --sort=name --mtime='@0' --owner=0 --group=0 --numeric-owner -C build -czf "$out/ordo-app.tar.gz" .
cp install/ordo-lxc.sh "$out/ordo-lxc.sh"
sum() { sha256sum "$1" | cut -d' ' -f1; }
cat >"$out/version.txt" <<EOT
version=$version
commit=$commit
date=$(date -u +%Y-%m-%dT%H:%M:%SZ)
app_sha256=$(sum "$out/ordo-app.tar.gz")
script_sha256=$(sum "$out/ordo-lxc.sh")
EOT
cat "$out/version.txt"
