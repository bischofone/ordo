# Ordo-Server einrichten (Radicale + Caddy)

Ein kleiner Server reicht (z. B. ein VPS). Benötigt: Docker mit Compose und eine Domain,
die auf den Server zeigt.

Danach läuft:

- `https://DEINE-DOMAIN/` – die App (PWA, installierbar)
- `https://DEINE-DOMAIN/dav/` – der CalDAV-Server (auch für Tasks.org/DAVx⁵, Thunderbird)

## 1. Domain eintragen

```bash
cp .env.example .env
nano .env        # DOMAIN=ordo.deine-domain.de
```

## 2. Benutzer anlegen

```bash
./benutzer.sh neu alexander        # erzeugt ein sicheres Passwort und zeigt die Zugangsdaten
```

Weitere Befehle: `./benutzer.sh` (alle anzeigen), `./benutzer.sh passwort NAME` (neu setzen),
`./benutzer.sh loeschen NAME`. Jeder Benutzer sieht nur seine eigenen Listen. Passwörter werden
mit bcrypt gespeichert; ohne installiertes `htpasswd` nimmt das Skript kurz einen
Docker-Container dafür. Ein Neustart ist nicht nötig.

## 3. Starten

Im Ordner `docker/`:

```bash
docker compose up -d
```

Docker lädt das fertige Image `ghcr.io/bischofone/ordo` (Caddy + App, für amd64 und arm64).
Caddy holt beim ersten Start automatisch ein HTTPS-Zertifikat. Selbst bauen statt laden:
`docker compose build`.

## 4. In der App verbinden

Einstellungen → Synchronisation → Konto hinzufügen:

- Server-Adresse: `https://DEINE-DOMAIN/dav/`
- Benutzer und Passwort wie in Schritt 2

Danach bei jedem Pool „Neue Liste in …“ wählen. Auf weiteren Geräten dasselbe Konto
hinzufügen und die Listen mit „Als Pool übernehmen“ holen.

**Tasks.org/DAVx⁵:** Konto mit „Anmeldung mit URL und Benutzername“, URL
`https://DEINE-DOMAIN/dav/`. Die Listen erscheinen dort als Aufgabenlisten.

## Datensicherung

Alle Aufgaben liegen im Docker-Volume `radicale-data` als einzelne `.ics`-Dateien:

```bash
docker run --rm -v docker_radicale-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/radicale-backup.tgz -C /data .
```

## Aktualisieren

```bash
./update.sh                  # neueste Dateien + Image, vorher Sicherung nach sicherungen/
./update.sh --bauen          # Image selbst aus dem Quellcode bauen
```

Ein neues Image gibt es nach jedem Stand, der auf GitHub alle Tests bestanden hat. Geöffnete
Ordo-Fenster zeigen danach „Neue Version von Ordo ist da“.

Automatisch (z. B. jede Nacht um 4 Uhr), per `crontab -e`:

```
0 4 * * * cd /PFAD/ZU/ordo/docker && ./update.sh >> update.log 2>&1
```

## Andere Varianten

- **App und CalDAV auf getrennten Adressen:** siehe `Caddyfile.cors-beispiel`
  (dann braucht es CORS-Freigaben).
- **Nur lokal zum Ausprobieren** (ohne Docker): im Projektordner `pnpm radicale`
  startet Radicale auf `http://localhost:5232` (Benutzer `test`, Passwort `test`).
  Mit `pnpm dev` ist er in der App unter `http://localhost:5173/dav/` erreichbar.
