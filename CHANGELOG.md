# Änderungen

## 0.8.0 – 19.11.2026

### Neu

- **Sicherung** (Einstellungen → Sicherung): alle Daten als Datei – mit Passwort verschlüsselt
  (AES-256) und dann auch mit Zugangsdaten, ohne Passwort lesbar und ohne Zugangsdaten.
  Wiederherstellen mit Prüfung und Zusammenfassung vorab, ältere Sicherungen werden
  umgewandelt, der vorherige Stand lässt sich zurückholen.
- **Konto-Passwort ändern oder nachtragen** unter Einstellungen → Sync.
- **Datenintegrität bei Updates:** echte Datenbanken aller früheren Versionen (v1–v6) und
  Sync-Dateien früherer Versionen als Testdaten; Tests prüfen bei jedem Push, dass nichts
  verloren geht und alles richtig angezeigt wird. Wächter-Tests schlagen an, wenn sich
  Datenbank oder Sync-Format ändern, ohne dass Testdaten dazukommen.

### Behoben

- Einstellungen: Wechsel des Bereichs über die Adresse (`#sync`) auf derselben Seite.

## 0.7.0 – 19.11.2026

### Neu

- **Updates für alle Installationswege:** Nach jedem Stand, der auf GitHub alle Tests besteht,
  entstehen fertige Pakete – ein Release „main-build“ (App, Befehl `ordo`, Prüfsummen) und das
  Docker-Image `ghcr.io/bischofone/ordo`.
- **Proxmox:** im Container einfach `update` – aktualisiert zuerst den Befehl `ordo` selbst,
  sichert die Daten (`/var/backups/ordo`, letzte 5), lädt das geprüfte Paket in Sekunden statt
  selbst zu bauen und passt die Einstellungen an. Dazu `update --neu`, `update --quelle`,
  `ordo auto-update an|aus` (nächtlich), `ordo sicherung`. Auch die Erstinstallation nutzt
  jetzt das fertige Paket.
- **Docker:** fertiges Image (amd64/arm64) statt selbst bauen; `docker/update.sh` sichert,
  holt das neue Image und startet neu.
- **In der App:** Hinweis „Neue Version von Ordo ist da“ mit „Neu laden“; Version und
  „Nach neuer Version suchen“ unter Einstellungen → Sync.

## 0.6.0 – 19.11.2026

### Neu

- **Nextcloud verbinden:** eigener Dialog (Adresse, Benutzername, App-Passwort, Link zur
  Seite „Sicherheit“); Ordo findet Aufgabenlisten und Kalender selbst.
- **CORS gelöst:** Blockiert der Browser die Anfragen, leitet Ordo sie über den eigenen Server
  weiter (`/ext/<host>/`) – lokal automatisch, im Proxmox-Container per `ordo nextcloud HOST`
  (oder bei der Installation gefragt), mit Docker per `ORDO_PROXY_HOSTS`.
- **Termine im Kalender:** pro Pool ein Kalender; geplante Aufgaben werden als Termine
  eingetragen, angepasst und gelöscht. Dauer aus der Zeitschätzung, sonst Standarddauer
  (Einstellungen → Sync). Aufgaben ohne Uhrzeit ganztägig (abschaltbar).

### Behoben

- Proxmox-Skript: brach nach den Fragen ab; nahm die ARM-Vorlage auf x86; `/usr/local/sbin`
  fehlte im Container; `pnpm` wurde nicht gefunden.
- Fehlermeldungen beim Verbinden: falsche Adresse, falsches Passwort und fehlende
  Weiterleitung werden unterschieden.

## 0.5.0 – 18.11.2026

### Neu

- **Heute** (Phase 4): Überfälliges und für heute Geplantes über alle Pools, Liegengebliebenes
  rutscht nach, geschätzte gegen verfügbare Zeit, „Nicht heute“, Zähler in der Seitenleiste.
- **Was als Nächstes?** – erklärbare Vorschläge ohne KI aus Priorität, Fälligkeit, Alter,
  Verschiebungen, verfügbarer Zeit und Energie; Gewichtungen unter Einstellungen → Planung.
- **Tag planen** – Morgen-Ablauf in vier Schritten (Überfällig, Inbox, Auswählen, Fertig).
- **Wochenrückblick** je Pool: erledigt, neu, erfasste Zeit, oft verschoben (+ KI-Rückblick).

## 0.4.0 – 18.11.2026

### Neu

- **KI-Assistent über OpenRouter** (Phase 6): Aufgabe zerlegen, Tipps, Aufgaben aus Freitext,
  Tagesplan, Wochenrückblick, Pool-Vorschlag beim Aufräumen der Inbox.
- Jede KI-Antwort ist ein Vorschlag: abhaken, umbenennen, übernehmen, neu erzeugen, rückgängig.
- Strikte Trennung pro Pool, zentral erzwungen und mit Tests abgesichert.
- Einstellungen → KI: Schlüssel (bleibt auf dem Gerät), Modell, Ersatzmodell, Tageslimit,
  nur Anbieter ohne Datenspeicherung, Verbrauch heute. Pro Pool: an/aus, Modell, Kontext-Notizen.
- Standardmodell GLM 5.3 Flash (≈ 0,01 Cent je Aufruf), Ersatz Mistral Small 3.2.

### Sonstiges

- Repository öffentlich unter MIT-Lizenz, neuer Name `ordo`.

## 0.3.0 – 18.11.2026

### Neu

- **Ordo:** neuer Name und neues Logo (offenes O mit Punkt); neue App-Icons.
- **Inbox aufräumen als Kartenstapel:** Karte bearbeiten und auf einen Pool oder ein Projekt
  ziehen; wischen zum Löschen oder Überspringen; „Rückgängig“ nach jeder Aktion.
- **Aufräumen nach Zeitplan:** vorschlagen oder erzwingen, zu festen Zeiten je Wochentag
  oder nach Regeln (Anzahl Einträge, Alter); einmal aufschieben erlaubt.
- **Zeiterfassungs-Modus** (zuschaltbar): Play-Knopf, Zeitfeld in der Zeile, Eingaben wie
  `0,5h` oder `+0:15`, Soll-Zeit je Wochentag, tatsächliche Arbeitszeit, Seite **Zeiten**
  mit Tag/Woche/Monat. Zeiteinträge werden synchronisiert.
- **Einstellungen in Bereiche gegliedert** (Darstellung, Zeiterfassung, Inbox, Pools, Sync).
- **Anpassbare Darstellung:** Farbschema, Akzentfarbe, Dichte, Schriftgröße, farbige Gruppen.
- Klick auf eine Aufgabe öffnet die Details.
- **Proxmox-Installation mit einem Befehl:** kleiner Alpine-Container mit Caddy und Radicale,
  Pflege über den Befehl `ordo` (update, user-add, domain, status).
- **Dokumentation:** Installation, Bedienung, Architektur, Entwicklung; Screenshots;
  automatische Prüfung auf GitHub.

### Verbessert

- „Alle Pools“: jeder Pool als eigener, abgesetzter Bereich.
- Aufgaben-Zeilen mit dezenten Trennlinien und weniger Abstand links.
- Zeiten-Seite: ruhigere Listen ohne unterstrichene Links.

### Behoben

- Schnelles Doppeltippen beim Aufräumen verschob dieselbe Karte zweimal.
- Zeiteingabe: Weitertippen direkt nach Enter ging verloren.
- Der Schalter für die Zeiterfassung blitzte kurz falsch auf, bevor die Einstellung geladen war.

## 0.2.0 – 16.11.2026

### Neu

- **CalDAV-Sync pro Pool** (Phase 2): Dreiwege-Zusammenführung pro Feld, Konflikte zum
  Auswählen, mehrere Konten, Sync-Ziel direkt im Pool wählen, vorhandene Listen als Pool übernehmen.
- **Server-Einrichtung** mit Docker: Radicale + Caddy mit automatischem HTTPS.
- Pools und Projekte endgültig löschen (wahlweise mit Aufgaben, wahlweise auch auf dem Server).
- Projekte innerhalb von Pools, Farb- und Icon-Auswahl.
- Drag & Drop mit Maus und Finger, Unteraufgaben-Knopf, Ein-Klick-Leiste in der Schnelleingabe.

### Behoben

- Lange Ordo-eigene Werte wurden von Radicale an Kommas abgeschnitten (jetzt URL-kodiert).
- Mehrere gleichzeitige Sync-Läufe (jetzt gesperrt, auch über Tabs hinweg).
- IDs ließen sich ohne HTTPS (Test im WLAN) nicht erzeugen.

## 0.1.0 – 16.11.2026

### Neu

- **Lokale App** (Phase 1): Pools, Aufgaben mit beliebig tiefen Unteraufgaben, Outliner mit
  Tastatur, Schnelleingabe mit Datum/Uhrzeit/Priorität/Pool, Inbox mit Aufräum-Modus,
  Zurückschieben mit Zähler, „Irgendwann“, installierbare PWA mit Offline-Start.
