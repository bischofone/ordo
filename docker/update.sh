#!/bin/sh
# Ordo (Docker) aktualisieren: neueste Anleitung/Compose-Datei, neuestes Image, Neustart.
# Im Ordner docker/ ausführen:  ./update.sh        (eigenes Image aus dem Quellcode: ./update.sh --bauen)
# Die Aufgaben liegen im Volume „radicale-data“ und bleiben erhalten; vorher wird gesichert.
set -eu
cd "$(dirname "$0")"

say() { printf '\033[1;34m›\033[0m %s\n' "$*"; }

if git -C .. rev-parse --git-dir >/dev/null 2>&1; then
	say "Neueste Dateien von GitHub holen …"
	git -C .. pull --ff-only || say "git pull ging nicht (lokale Änderungen?) – mache mit den vorhandenen Dateien weiter."
fi

# Sicherung der Aufgaben (die letzten 5 bleiben liegen)
volume="$(docker compose ps -q radicale 2>/dev/null | xargs -r docker inspect -f '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' 2>/dev/null || true)"
if [ -n "$volume" ]; then
	mkdir -p sicherungen
	f="ordo-$(date +%Y-%m-%d_%H%M%S).tar.gz"
	docker run --rm -v "$volume":/data:ro -v "$PWD/sicherungen":/backup alpine tar czf "/backup/$f" -C /data .
	ls -1t sicherungen/ordo-*.tar.gz | tail -n +6 | xargs -r rm -f
	say "Daten gesichert: docker/sicherungen/$f"
fi

if [ "${1:-}" = "--bauen" ]; then
	say "Image aus dem Quellcode bauen …"
	docker compose build --pull
else
	say "Neueste Images holen …"
	docker compose pull || {
		say "Image nicht erreichbar – baue es selbst."
		docker compose build --pull
	}
fi
docker compose up -d --remove-orphans
docker image prune -f >/dev/null
say "Fertig. Offene Ordo-Fenster zeigen „Neue Version“ und laden mit einem Klick neu."
