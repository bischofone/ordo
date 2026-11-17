# Änderungen

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
