# Installation

Ordo ist eine Web-App, die komplett im Browser läuft. Es gibt drei Wege, sie zu nutzen:

1. **[Lokal ausprobieren](#1-lokal-ausprobieren)** – auf dem eigenen Rechner, in ein paar Minuten.
2. **[Auf einem eigenen Server](#2-eigener-server)** – erreichbar von allen Geräten, mit Sync.
3. **[Auf Handy und PC installieren](#3-auf-geräten-installieren)** – als App mit eigenem Icon (PWA).

Ohne Sync-Server bleiben alle Daten auf dem Gerät, in dem Browser, in dem du Ordo öffnest.

---

## 1. Lokal ausprobieren

### Voraussetzungen

| Programm | Version       | Prüfen mit |
| -------- | ------------- | ---------- |
| Git      | beliebig      | `git -v`   |
| Node.js  | 22 oder neuer | `node -v`  |
| pnpm     | 10 oder neuer | `pnpm -v`  |

**Installieren, falls etwas fehlt:**

- **Arch / Manjaro:** `sudo pacman -S git nodejs pnpm`
- **Debian / Ubuntu:** `sudo apt install git nodejs npm`, danach `sudo npm install -g pnpm`
  (ist `nodejs` zu alt, Node über <https://nodejs.org> oder `nvm` installieren)
- **macOS (Homebrew):** `brew install git node pnpm`
- **Windows:** Node.js von <https://nodejs.org>, Git von <https://git-scm.com>,
  dann in der Eingabeaufforderung `npm install -g pnpm`

### Holen und starten

```bash
git clone https://github.com/bischofone/tasks-app.git ordo
cd ordo
pnpm install
pnpm dev
```

Im Browser <http://localhost:5173> öffnen. Änderungen am Code erscheinen sofort.

### Fertige Version bauen

```bash
pnpm build      # erzeugt den Ordner build/ – reine statische Dateien
pnpm serve      # liefert build/ auf http://localhost:4173 aus
```

Den Ordner `build/` kann jeder Webserver ausliefern (Caddy, nginx, Apache, GitHub Pages …).
Wichtig: Unbekannte Pfade müssen auf `index.html` zeigen (Single-Page-App).

### Sync lokal ausprobieren

Ein kleiner CalDAV-Testserver (Radicale) ist eingebaut. Er braucht nur Python 3:

```bash
pnpm radicale   # Terminal 1 – richtet beim ersten Mal Radicale ein
pnpm dev        # Terminal 2
```

In Ordo: **Einstellungen → Sync → Konto hinzufügen**

- Server-Adresse: `http://localhost:5173/dav/`
- Benutzer `test`, Passwort `test`

Danach in einem Pool über den Stift-Knopf unter „Synchronisation“ **„Neue Liste in …“** wählen.
Ein zweites Browserfenster im privaten Modus spielt ein zweites Gerät.

---

## 2. Eigener Server

Für den Alltag läuft Ordo zusammen mit einem CalDAV-Server auf einem kleinen Server
(ein günstiger VPS reicht). Fertig vorbereitet ist das in [`docker/`](../docker/README.md):

- **Caddy** liefert die App aus und holt automatisch ein HTTPS-Zertifikat.
- **Radicale** speichert die Aufgaben (als einzelne `.ics`-Dateien).
- App und CalDAV laufen unter derselben Adresse – es sind keine CORS-Einstellungen nötig.

Kurzfassung (Details und Datensicherung in der [Server-Anleitung](../docker/README.md)):

```bash
pnpm install && pnpm build                 # App bauen
cd docker
cp .env.example .env && nano .env          # DOMAIN=ordo.deine-domain.de
docker run --rm httpd:2-alpine htpasswd -nbB DEIN-NAME 'DEIN-PASSWORT' >> radicale/users
docker compose up -d
```

Danach ist Ordo unter `https://DEINE-DOMAIN/` erreichbar, der CalDAV-Server unter
`https://DEINE-DOMAIN/dav/`.

**Schon einen CalDAV-Server?** Nextcloud, Radicale, Baïkal usw. funktionieren auch.
Dann muss der Server Anfragen aus dem Browser erlauben (CORS) – ein Beispiel für Caddy
steht in [`docker/Caddyfile.cors-beispiel`](../docker/Caddyfile.cors-beispiel).

### Aktualisieren

```bash
git pull
pnpm install
pnpm build
```

Caddy liefert die neue Version sofort aus. Geöffnete Apps laden sie beim nächsten Start.

---

## 3. Auf Geräten installieren

Ordo ist eine _Progressive Web App_: Einmal installiert, startet sie wie eine normale App,
auch ohne Internet.

| Gerät                      | So geht's                                                                        |
| -------------------------- | -------------------------------------------------------------------------------- |
| **Android (Chrome)**       | Seite öffnen → Menü ⋮ → **„App installieren“**                                   |
| **iPhone / iPad (Safari)** | Seite öffnen → Teilen-Knopf → **„Zum Home-Bildschirm“**                          |
| **PC (Chrome, Edge)**      | Installations-Symbol rechts in der Adressleiste, oder Menü → „Ordo installieren“ |
| **Firefox (PC)**           | keine Installation; Ordo läuft normal im Tab                                     |

Danach auf jedem Gerät: **Einstellungen → Sync → Konto hinzufügen** mit denselben Zugangsdaten,
und die vorhandenen Listen mit **„Als Pool übernehmen“** holen.

> Die Installation braucht HTTPS (oder `localhost`). Über eine einfache IP-Adresse im
> Heimnetz klappt sie nicht – dafür ist der Server mit eigener Domain gedacht.

---

## Probleme lösen

| Problem                                            | Lösung                                                                             |
| -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `pnpm: command not found`                          | pnpm installieren (siehe oben), Terminal neu öffnen                                |
| `pnpm install` meckert über die Node-Version       | Node.js 22 oder neuer installieren                                                 |
| Port 5173 ist belegt                               | `pnpm dev --port 5174`                                                             |
| Sync: „Anmeldung fehlgeschlagen“                   | Benutzer/Passwort prüfen; bei Docker die Datei `docker/radicale/users`             |
| Sync: „Server nicht erreichbar“ bei fremdem Server | CORS-Freigaben fehlen – siehe `Caddyfile.cors-beispiel`                            |
| App zeigt nach Update die alte Version             | App einmal ganz schließen und neu öffnen (der Service Worker tauscht dann)         |
| Alles zurücksetzen                                 | Browser-Daten der Seite löschen. **Achtung:** ohne Sync sind die Aufgaben dann weg |
