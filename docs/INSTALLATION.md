# Installation

Ordo ist eine Web-App, die komplett im Browser läuft. Es gibt drei Wege, sie zu nutzen:

1. **[Lokal ausprobieren](#1-lokal-ausprobieren)** – auf dem eigenen Rechner, in ein paar Minuten.
2. **[Auf einem eigenen Server](#2-eigener-server)** – erreichbar von allen Geräten, mit Sync:
   [mit einem Befehl auf Proxmox](#proxmox-ein-befehl) oder [mit Docker](#docker).
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
git clone https://github.com/bischofone/ordo.git ordo
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

Für den Alltag läuft Ordo zusammen mit einem CalDAV-Server auf einem eigenen Server.
Zwei fertige Wege:

### Proxmox: ein Befehl

Auf dem **Proxmox-VE-Host** als root in der Shell (Weboberfläche → Knoten → „Shell“):

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/bischofone/ordo/main/install/proxmox.sh)"
```

Das Skript fragt ein paar Dinge ab (alles vorbelegt, Enter genügt) und legt dann einen
kleinen **Alpine-Linux-Container** an:

| Was        | Vorgabe                                         |
| ---------- | ----------------------------------------------- |
| Container  | unprivilegiert, startet mit dem Host            |
| Ressourcen | 1 Kern, 256 MB RAM, 2 GB Festplatte             |
| Netzwerk   | `vmbr0`, DHCP (oder feste IP)                   |
| Darin      | Caddy (App, optional HTTPS) + Radicale (CalDAV) |
| Belegt     | etwa 180 MB                                     |

Die App kommt als fertiges, von GitHub getestetes Paket in den Container (Prüfsumme wird
kontrolliert); nur wenn das nicht geht, wird sie dort aus dem Quellcode gebaut. Am Ende stehen Adresse, Benutzer und Passwort auf dem Bildschirm.

**Ohne Rückfragen** (z. B. für Skripte) – Werte voranstellen:

```bash
ORDO_YES=1 ORDO_CTID=120 ORDO_DOMAIN=ordo.example.de ORDO_USER=alex \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/bischofone/ordo/main/install/proxmox.sh)"
```

Alle Variablen stehen oben in [`install/proxmox.sh`](../install/proxmox.sh).

**Pflege** – vom Proxmox-Host aus (`120` = deine Container-ID) oder im Container direkt `ordo …`:

| Befehl                               | Wirkung                                           |
| ------------------------------------ | ------------------------------------------------- |
| `pct exec 120 -- update`             | neueste Version holen (siehe „Aktualisieren“)     |
| `pct exec 120 -- ordo user-add NAME` | Benutzer anlegen / Passwort ändern (wird erzeugt) |
| `pct exec 120 -- ordo user-del NAME` | Benutzer entfernen (Daten bleiben)                |
| `pct exec 120 -- ordo domain DOMAIN` | Domain setzen → Caddy holt automatisch HTTPS      |
| `pct exec 120 -- ordo status`        | Version, Dienste, Benutzer, Adressen              |

**HTTPS:** Ohne Domain läuft Ordo per HTTP auf Port 80 – gut fürs Heimnetz oder hinter einem
vorhandenen Reverse-Proxy (z. B. Nginx Proxy Manager, Traefik): dort einfach auf
`http://IP-DES-CONTAINERS` weiterleiten. Mit `ordo domain …` holt Caddy selbst ein Zertifikat;
dafür müssen Port 80 und 443 aus dem Internet beim Container ankommen.
Für die Installation als App (PWA) ist HTTPS nötig.

**Datensicherung:** Die Aufgaben liegen im Container unter `/var/lib/radicale/collections`.
Am einfachsten den Container in die normale Proxmox-Sicherung aufnehmen.

### Docker

Für einen VPS oder jeden Rechner mit Docker ist alles in [`docker/`](../docker/README.md) vorbereitet:

- **Caddy** liefert die App aus und holt automatisch ein HTTPS-Zertifikat.
- **Radicale** speichert die Aufgaben (als einzelne `.ics`-Dateien).
- App und CalDAV laufen unter derselben Adresse – es sind keine CORS-Einstellungen nötig.

Kurzfassung (Details und Datensicherung in der [Server-Anleitung](../docker/README.md)):

```bash
cd docker
cp .env.example .env && nano .env          # DOMAIN=ordo.deine-domain.de
docker run --rm httpd:2-alpine htpasswd -nbB DEIN-NAME 'DEIN-PASSWORT' >> radicale/users
docker compose up -d
```

Danach ist Ordo unter `https://DEINE-DOMAIN/` erreichbar, der CalDAV-Server unter
`https://DEINE-DOMAIN/dav/`. Das Image `ghcr.io/bischofone/ordo` (Caddy + fertige App) baut
GitHub nach jedem getesteten Stand; ist es nicht erreichbar, baut Docker es selbst.

### Nextcloud verbinden

Nextcloud (und manch anderer CalDAV-Server) erlaubt keine Anfragen direkt aus einer Web-App
(CORS). Ordo leitet sie deshalb über den eigenen Server weiter: `…/ext/cloud.example.com/…`
→ `https://cloud.example.com/…`. Aus Sicherheitsgründen nur zu Servern, die du erlaubst:

| Wie Ordo läuft     | Nextcloud erlauben                                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Proxmox-Container  | bei der Installation nach der Nextcloud-Adresse gefragt – oder später: `pct exec <ID> -- ordo nextcloud cloud.example.com` |
| Docker             | in `docker/.env`: `ORDO_PROXY_HOSTS=cloud.example.com`, dann `docker compose up -d`                                        |
| Lokal (`pnpm dev`) | nichts zu tun (optional einschränken: `ORDO_PROXY_HOSTS=cloud.example.com pnpm dev`)                                       |

Danach in Ordo: **Einstellungen → Sync → Nextcloud verbinden**. Ordo probiert erst den
direkten Weg und nimmt die Weiterleitung nur, wenn der Browser blockiert.

**Andere CalDAV-Server** (Radicale, Baïkal …) gehen über „Anderer CalDAV-Server“. Erlaubt
der Server Anfragen aus dem Browser nicht, gilt dasselbe wie für Nextcloud – oder man gibt
ihm CORS-Freigaben, Beispiel in [`docker/Caddyfile.cors-beispiel`](../docker/Caddyfile.cors-beispiel).

### Aktualisieren

Nach jeder Änderung prüft GitHub alles automatisch (Typen, Lint, Unit- und Browser-Tests).
**Nur wenn alles grün ist**, entstehen daraus neue fertige Pakete – das dauert nach einem
Push etwa 10 Minuten. Deine Aufgaben bleiben bei jedem Update erhalten und werden vorher
gesichert.

| Wie Ordo läuft     | Aktualisieren                                                                     |
| ------------------ | --------------------------------------------------------------------------------- |
| Proxmox-Container  | im Container `update` – oder vom Host: `pct exec <ID> -- update`                  |
| Docker             | im Ordner `docker/`: `./update.sh`                                                |
| Lokal (`pnpm dev`) | `git pull && pnpm install` – der Dev-Server lädt neu                              |
| Selbst gebaut      | `git pull && pnpm install && pnpm build`, dann den Ordner `build/` neu ausliefern |

**Proxmox im Detail** – `update` macht der Reihe nach:

1. holt den neuesten Befehl `ordo` selbst (neue Unterbefehle und Korrekturen gelten sofort),
2. vergleicht die installierte Version mit dem neuesten geprüften Paket – ist sie aktuell,
   passiert nichts weiter,
3. sichert Aufgaben, Benutzer und Einstellungen nach `/var/backups/ordo` (die letzten 5 bleiben),
4. lädt das Paket, prüft die Prüfsumme und tauscht die App in einem Rutsch aus,
5. passt die erzeugten Einstellungen (Caddy, Radicale) an und startet nur bei Änderungen neu.

| Befehl                    | Wirkung                                                            |
| ------------------------- | ------------------------------------------------------------------ |
| `update`                  | wie oben                                                           |
| `update --neu`            | Paket neu einspielen, auch wenn die Version schon stimmt           |
| `update --quelle`         | selbst aus dem Quellcode bauen (braucht ~1 GB RAM, dauert Minuten) |
| `ordo auto-update an/aus` | jede Nacht automatisch (Protokoll: `/var/log/ordo-update.log`)     |
| `ordo sicherung`          | nur sichern                                                        |
| `ordo status`             | installierte Version, Auto-Update, Anzahl Sicherungen, Dienste     |

Zurückholen einer Sicherung im Container:
`rc-service radicale stop && tar xzf /var/backups/ordo/ordo-DATUM.tar.gz -C / && rc-service radicale start`

**Docker im Detail** – `./update.sh` holt die neuesten Dateien (`git pull`), sichert das
Volume `radicale-data` nach `docker/sicherungen/`, zieht das neue Image und startet neu.
Wer lieber selbst baut: `./update.sh --bauen`.

**In der App** – Geöffnete Ordo-Fenster bemerken eine neue Version von selbst (beim
Zurückkehren in die App und alle 15 Minuten) und zeigen oben „Neue Version von Ordo ist da“
mit **Neu laden**. Die laufende Version steht unter Einstellungen → Sync ganz unten, dort
kann man auch von Hand suchen.

> **Ältere Container** (vor Version 0.7.0) kennen `update` noch nicht. Einmalig:
> `pct exec <ID> -- sh -c 'wget -qO /usr/local/sbin/ordo https://raw.githubusercontent.com/bischofone/ordo/main/install/ordo-lxc.sh && ordo update'`
> – danach reicht immer `update`.

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
| App zeigt nach Update die alte Version             | Auf „Neu laden“ im Hinweis tippen – oder die App einmal ganz schließen und öffnen  |
| Alles zurücksetzen                                 | Browser-Daten der Seite löschen. **Achtung:** ohne Sync sind die Aufgaben dann weg |
