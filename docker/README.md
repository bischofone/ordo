# Server einrichten (Radicale + Caddy)

Ein kleiner Server reicht (z. B. ein VPS). Benötigt: Docker mit Compose und eine Domain,
die auf den Server zeigt.

Danach läuft:

- `https://DEINE-DOMAIN/` – die App (PWA, installierbar)
- `https://DEINE-DOMAIN/dav/` – der CalDAV-Server (auch für Tasks.org/DAVx⁵, Thunderbird)

## 1. Domain eintragen

```bash
cp .env.example .env
nano .env        # DOMAIN=tasks.deine-domain.de
```

## 2. Benutzer anlegen

Passwörter werden mit bcrypt gespeichert. Ohne installiertes `htpasswd` geht es über Docker:

```bash
docker run --rm httpd:2-alpine htpasswd -nbB alexander 'DEIN-PASSWORT' >> radicale/users
```

Für weitere Benutzer den Befehl wiederholen.

## 3. App bauen und starten

Auf dem Rechner mit dem Projekt (oder direkt auf dem Server):

```bash
pnpm install
pnpm build
```

Dann im Ordner `docker/`:

```bash
docker compose up -d
```

Caddy holt beim ersten Start automatisch ein HTTPS-Zertifikat.

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
pnpm build                   # neue App-Version
docker compose pull && docker compose up -d
```

## Andere Varianten

- **App und CalDAV auf getrennten Adressen:** siehe `Caddyfile.cors-beispiel`
  (dann braucht es CORS-Freigaben).
- **Nur lokal zum Ausprobieren** (ohne Docker): im Projektordner `pnpm radicale`
  startet Radicale auf `http://localhost:5232` (Benutzer `test`, Passwort `test`).
  Mit `pnpm dev` ist er in der App unter `http://localhost:5173/dav/` erreichbar.
