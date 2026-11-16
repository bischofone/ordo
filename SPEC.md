# SPEC – Eigene Tasks-App

Local-first Aufgaben-App mit getrennten Pools, Sync über CalDAV, nativen
Erinnerungen am Handy und optionaler KI pro Pool.

---

## 1. Architektur

Vorbild: Super Productivity – eine Web-Codebasis, verpackt für die Plattformen,
kein eigener App-Server.

- **Eine Codebasis:** TypeScript-Web-App (Stack-Vorschlag mit Begründung von dir,
  z. B. SvelteKit oder React + Vite).
- **Lokale Datenhaltung:** IndexedDB (z. B. Dexie.js). Die App funktioniert
  vollständig offline. Alle Einstellungen, Zugangsdaten und API-Keys bleiben
  lokal auf dem jeweiligen Gerät.
- **Handy:** Verpackt mit **Capacitor** (zuerst Android, iOS später möglich).
  - Erinnerungen werden lokal auf dem Gerät geplant (Local Notifications) –
    kein Push-Server.
  - CalDAV-Requests laufen über native HTTP-Requests, damit es keine CORS-Probleme gibt.
  - Hintergrund-Sync regelmäßig (Background Fetch) und beim Öffnen der App.
  - Teilen-Ziel (spätere Phase): Inhalte aus anderen Apps als Inbox-Eintrag.
- **PC:** Als PWA im Browser nutzbar. Später optional Tauri-Desktop-App mit
  Tray-Icon für Benachrichtigungen bei geschlossenem Fenster.
- **Einziger Server:** Ein CalDAV-Server, selbst gehostet in Docker (Radicale als
  Referenz). Für die Browser-Version eine Beispielkonfiguration mit passenden
  CORS-Headern (z. B. via Reverse Proxy) dokumentieren.
- **Saubere Schichten:** Datenmodell → Sync-Engine → UI. Die Sync-Engine ist
  austauschbar und unabhängig von der UI testbar.

## 2. Pools

- Jede Aufgabe gehört zu genau einem Pool (z. B. Arbeit, Privat, Projekte).
  Pools lassen sich jederzeit anlegen, umbenennen, einfärben, sortieren, archivieren
  und endgültig löschen (mit Rückfrage; die Inbox nicht).
- **Jeder Pool = eine eigene CalDAV-Aufgabenliste.** Server/Konto/Liste pro Pool
  wählbar (Arbeit darf auf einem anderen Server liegen als Privat).
- Pools sind strikt getrennt. Ansichten zeigen einen, mehrere oder alle Pools.
- **Projekte innerhalb eines Pools** (eine Ebene): ordnen Aufgaben im Pool, z. B.
  Privat › Umzug. Projekte lassen sich anlegen, umbenennen, einfärben, mit Icon
  versehen, sortieren, archivieren und löschen (Aufgaben bleiben dann im Pool).
  Sie erscheinen in der Seitenleiste unter ihrem Pool und haben eine eigene Ansicht.
- **Farbe und Icon** für Pools und Projekte: je ein Knopf, der eine Auswahl öffnet
  (Farbpalette + eigene Farbe; Icon-Sammlung).
- **Kontext-Modi** (z. B. „Arbeit“, „Feierabend“, „Urlaub“): legen fest, welche
  Pools sichtbar sind und welche benachrichtigen dürfen. Umschaltbar per Klick
  oder automatisch nach Zeitplan (z. B. Mo–Fr 8–17 Uhr = Arbeit).
- **Einstellungen pro Pool:** Benachrichtigungen an/aus, Ruhezeiten, welche Geräte
  benachrichtigt werden (Einstellung pro Gerät), KI an/aus + KI-Einstellungen.

## 3. Aufgaben

### Felder

Titel, Notizen (Markdown), Priorität (1–3, beim Erstellen setzbar), Fälligkeit,
geplantes Datum, Zeitschätzung (optional), Energie-Level (optional:
niedrig/mittel/hoch), Wiederholung, Status, erfasste Zeit.

### Unteraufgaben

- **Beliebig viele Ebenen** (Sub-Sub-Tasks).
- Gliederungs-Bedienung: **Enter** = neue Aufgabe auf gleicher Ebene,
  **Tab / Shift+Tab** = ein-/ausrücken. Kein Dialog nötig, direkt in der Liste tippen.
- Sichtbarer Knopf „Unteraufgabe hinzufügen“ an jeder Zeile.
- **Drag & Drop** (Maus und Finger, am Griff der Zeile): umsortieren, waagrecht
  ein-/ausrücken, in andere Projekte/Pools ziehen – auch auf Pools und Projekte in
  der Seitenleiste. Unteraufgaben wandern mit.
- Am Handy: Buttons zum Ein-/Ausrücken über der Tastatur, Wischgesten.
- Fortschritt der Unteraufgaben am Elternteil sichtbar (z. B. 3/5).
- Unteraufgaben ein-/ausklappbar.

### Schnelleingabe (bewusst einfach)

Nur wenige, intuitive Kürzel – alles andere über Buttons:

- Datum in normalen Worten (Deutsch): `heute`, `morgen`, `Freitag`, `15.12.`, `9:00`
- Priorität: `!1` `!2` `!3`
- Pool oder Projekt: `#arbeit`, `#umzug`, eindeutig `#privat/umzug`
- Beispiel: `Rechnung zahlen morgen !1 #privat`
- Erkannte Teile werden live als farbige Chips angezeigt und sind per Klick
  entfernbar. Nichts wird „heimlich“ interpretiert.
- Daneben eine sichtbare Leiste für alle, die keine Kürzel nutzen wollen – **jede
  Option mit einem Klick**, ohne Zwischenmenü: Heute · Morgen · Kalender ·
  !1 !2 !3 · Pool/Projekt-Auswahl. Die Leiste zeigt auch an, was per Kürzel erkannt
  wurde.

### Zurückschieben (statt verstecken)

- „Zurückschieben“ mit Schnellauswahl: morgen, nächste Woche, nächster Monat,
  eigenes Datum.
- Zurückgeschobene Aufgaben bleiben **sichtbar** in einem einklappbaren Bereich
  „Später“ (ausgegraut, mit Datum).
- Die App zählt, wie oft eine Aufgabe verschoben wurde. Ab dem 3. Mal fragt sie:
  „Aufteilen, ins ‚Irgendwann‘ verschieben oder löschen?“

### Warten / Abhängigkeiten

- **Blockiert durch Aufgabe(n):** Verknüpfung zu anderen Aufgaben (auch
  poolübergreifend sichtbar als Hinweis, ohne Inhalte des anderen Pools offenzulegen).
- **Wartet auf (externer Grund):** Typ (Mail, Rückmeldung, Rückfrage, Lieferung,
  Person, Sonstiges) + Freitext + optional „Nachhaken am“-Datum → erzeugt eine
  Erinnerung.
- Eigene Ansicht „Wartet“ pro Pool.

### Wiederkehrende Aufgaben & Vorlagen

- Wiederholung: täglich, wöchentlich (Wochentage), monatlich, jährlich, „X Tage
  nach Erledigung“.
- **Checklisten-Vorlagen:** Aufgabe inkl. Unteraufgaben-Baum als Vorlage
  speichern und mit einem Klick neu anlegen (z. B. Packliste, Monatsabschluss).

### Zeiterfassung

- Jede Aufgabe hat einen gut sichtbaren **Play/Stop-Button** direkt in der Zeile.
- Immer nur ein Timer aktiv. Ein Klick auf eine andere Aufgabe wechselt den Timer.
- Laufender Timer ist global sichtbar (Kopfzeile).
- Einträge nachträglich bearbeitbar/manuell hinzufügbar.
- Summe pro Aufgabe inkl. Unteraufgaben. Einfache Auswertung pro Pool/Zeitraum.
- Laufender Timer überlebt App-Neustart (Startzeit speichern, nicht hochzählen).

## 4. Inbox (ohne Chaos)

- Eingang für schnelles Erfassen, ohne Pool.
- **Aufräum-Modus:** Einträge einzeln als Karte; Aktionen per Wisch/Klick:
  Pool zuweisen, „Irgendwann“, Termin setzen, löschen.
- **„Irgendwann“-Ablage pro Pool** für Ideen, die nicht aktiv sind (eigene,
  standardmäßig eingeklappte Liste).
- **Altern:** Einträge, die länger als X Tage (einstellbar, Standard 7) in der
  Inbox liegen, werden markiert und in der Tagesplanung angesprochen.
- Zähler-Badge für die Inbox.

## 5. Tagesplanung & „Was als Nächstes?“

### Tagesplanung

- Morgendlicher Ablauf (kurz, überspringbar): Überfälliges ansehen → Inbox
  aufräumen → Aufgaben für heute auswählen → fertig.
- **Heute-Ansicht** mit geschätzter Gesamtzeit vs. verfügbarer Zeit.
- Kurzer **Wochenrückblick**: erledigt, verschoben, erfasste Zeit pro Pool.

### Vorschlag „Was als Nächstes?“

- Deterministische, testbare Score-Funktion (ohne KI) aus: Priorität, Nähe zur
  Fälligkeit, Alter, Anzahl Verschiebungen, Zeitschätzung, Energie-Level,
  aktivem Kontext-Modus, Blockierungen/Wartet.
- Optional gebe ich an: „Ich habe X Minuten und Energie niedrig/mittel/hoch“.
- **Erklärbar:** Begründung wird angezeigt (z. B. „morgen fällig + Priorität 1“).
- Gewichtungen in den Einstellungen anpassbar.

## 6. KI-Integration (OpenRouter, optional)

- API-Key lokal gespeichert. Pro Pool: KI an/aus, Modellwahl, eigene
  Kontext-Notizen (z. B. „Ich arbeite als …“).
- **Strikte Trennung pro Pool:** Ein KI-Aufruf enthält ausschließlich Daten aus
  genau einem Pool. Kein Chat-Verlauf, kein Kontext und keine Aufgaben werden
  poolübergreifend geteilt. Das ist im Code zentral erzwungen (eine Funktion
  baut den Kontext und bekommt nur eine Pool-ID) und mit Tests abgesichert.
- Inbox-Einträge: KI darf nur den Text des einzelnen Eintrags sehen (z. B. für
  einen Pool-Vorschlag), nie Inhalte von Pools.
- Funktionen:
  - Aufgabe in Unteraufgaben (mehrere Ebenen) zerlegen
  - Lösungsansätze / Tipps zu einer Aufgabe
  - Freitext → strukturierte Aufgaben
  - Tagesplan-Vorschlag, Wochenrückblick-Zusammenfassung (pro Pool)
- **Jede KI-Änderung ist ein Vorschlag** (Vorschau mit Übernehmen/Bearbeiten/Verwerfen).
  Nichts wird automatisch geändert.

## 7. CalDAV-Mapping (VTODO, RFC 5545)

| App-Feld                                                                          | VTODO                                                                   |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Titel / Notizen                                                                   | `SUMMARY` / `DESCRIPTION`                                               |
| Unteraufgabe (beliebig tief)                                                      | `RELATED-TO;RELTYPE=PARENT`                                             |
| Projekt                                                                           | `X-MYTASKS-PROJECT` (ID); Projektliste als Eigenschaft der CalDAV-Liste |
| Priorität 1/2/3                                                                   | `PRIORITY` 1/5/9                                                        |
| Fälligkeit                                                                        | `DUE`                                                                   |
| Geplantes Datum                                                                   | `DTSTART`                                                               |
| Wiederholung                                                                      | `RRULE`                                                                 |
| Status                                                                            | `STATUS` (NEEDS-ACTION, IN-PROCESS, COMPLETED, CANCELLED) + `COMPLETED` |
| Blockiert durch                                                                   | `RELATED-TO;RELTYPE=DEPENDS-ON` (RFC 9253)                              |
| Wartet-auf, Energie, Zeitschätzung, Verschiebe-Zähler, Zeiteinträge, „Irgendwann“ | `X-`-Properties (Präfix z. B. `X-MYTASKS-`)                             |
| Sortierreihenfolge                                                                | `X-APPLE-SORT-ORDER` (kompatibel mit anderen Clients)                   |

- Kompatibel bleiben mit Tasks.org / DAVx⁵ und Thunderbird.
- **Unbekannte Properties anderer Clients beim Speichern niemals verwerfen.**
- Inbox: eigene CalDAV-Liste „Inbox“.
- Vorlagen: lokal + optional als JSON in einer eigenen Liste/Property gesynct.
- Sync: inkrementell (sync-token, sonst ctag/etag), Offline-Änderungen in einer
  Warteschlange, Konflikterkennung über ETag, Zusammenführen pro Feld; echte
  Konflikte dem Nutzer zur Auswahl zeigen.
- Gelöschte Aufgaben mit Unteraufgaben: Nachfrage, ob Kinder mitgelöscht werden.

## 8. Benachrichtigungen

- Lokal geplant pro Gerät (Capacitor Local Notifications bzw. Browser/Tauri).
- Arten: Erinnerung zu Zeitpunkt, Fälligkeit, „Nachhaken“ bei Wartet-auf,
  optional morgendliche Tagesplanung.
- Vor dem Planen jeder Benachrichtigung prüfen: Pool-Einstellung, Ruhezeiten,
  aktueller Kontext-Modus, Geräte-Einstellung. Nachrichten außerhalb des
  Zeitfensters werden ans Ende der Ruhezeit verschoben oder verworfen
  (einstellbar).
- Nach jedem Sync werden die geplanten Benachrichtigungen neu berechnet.

## 9. Sonstiges

- Export/Import als JSON (komplett und pro Pool), automatische lokale Backups.
- Suche über Titel/Notizen (respektiert aktiven Kontext-Modus).
- Dark Mode, schnelle schlichte UI, Mobile-first.
- **Zusammengehöriges ist sichtbar gruppiert:** Aufgaben eines Pools bzw. Projekts stehen
  jeweils in einer Karte mit Kopfzeile; Einstellungen sind in Karten je Bereich gegliedert.
  Keine farbigen Seitenränder an Karten.
- **Darstellung anpassbar (pro Gerät):** Farbschema (System/Hell/Dunkel), Akzentfarbe,
  Dichte (Kompakt/Normal/Luftig), Schriftgröße (Klein/Normal/Groß), farbige Gruppen
  (Kopfzeilen leicht in Pool-/Projektfarbe getönt, abschaltbar), Zurücksetzen.
- UI-Sprache Deutsch, i18n-fähig.
- Tests: Datenmodell, VTODO-Mapping (Hin- und Rückweg ohne Datenverlust),
  Sync-Konflikte, Score-Funktion, KI-Kontexttrennung, Benachrichtigungsregeln.
- `docker-compose.yml` mit Radicale (+ Reverse Proxy mit CORS für die
  Browser-Version) und README mit Setup-Anleitung.

## 10. Phasen

1. ✅ **MVP lokal:** Pools, Aufgaben, mehrstufige Unteraufgaben (Enter/Tab),
   Schnelleingabe, Inbox inkl. Aufräum-Modus, Zurückschieben, PWA.
2. ✅ **CalDAV-Sync** pro Pool + Radicale-Setup.
3. **Capacitor-Android-App** + lokale Benachrichtigungen + Kontext-Modi.
4. **Planung:** Priorisierung, „Was als Nächstes?“, Heute-Ansicht, Tagesplanung.
5. **Wartet-auf, Abhängigkeiten, Wiederholungen, Vorlagen, Zeiterfassung.**
6. **KI über OpenRouter** mit strikter Pool-Trennung.
7. **Rest:** Wochenrückblick, Teilen-Ziel, Export/Backup, optional Tauri-Desktop.

Jede Phase ist abgeschlossen und getestet, bevor die nächste beginnt.

## 11. Entscheidungen (laufend ergänzt)

Festgelegt beim Start, um ohne Rückfragen loslegen zu können. Alles davon kann
jederzeit geändert werden – dann wird es hier angepasst.

### Technik

- **Stack:** SvelteKit 3 (reine Client-App, `adapter-static`, kein SSR) +
  TypeScript, Dexie 4 (IndexedDB), date-fns, marked + DOMPurify.
- **i18n:** eigene, typisierte Textdatei (`src/lib/i18n/de.ts`) statt Bibliothek.
- **PWA:** eigener Service Worker von SvelteKit (App-Hülle im Cache, startet offline).
- **Tests:** Vitest (Logik + DB mit fake-indexeddb), Playwright (Desktop +
  Pixel-7-Profil) gegen den echten Build.
- **Code-Ort:** `~/code/tasks-app` (außerhalb von Nextcloud wegen `node_modules`);
  Repository: https://github.com/bischofone/tasks-app (privat).
- **Sortierung:** Fractional Indexing (Text-Schlüssel); beim Sync auf
  `X-APPLE-SORT-ORDER` abgebildet.
- **Löschen:** als Tombstone (`deletedAt`), damit der Sync Löschungen übertragen kann.
- **Projekte:** eigene Tabelle; Aufgaben tragen `projectId`, Unteraufgaben immer das
  Projekt ihrer Wurzel. DB-Version 2 (Migration vorhandener Daten automatisch).
- **Drag & Drop:** eigene Pointer-Event-Lösung (keine Bibliothek), Zielberechnung als
  reine, getestete Funktion (`domain/dnd.ts`).

### Verhalten

- **Inbox** ist intern ein Pool mit Sonderrolle (eigene CalDAV-Liste, nicht archivierbar).
- **Zurückschieben** setzt das _geplante Datum_ (`DTSTART`), die Fälligkeit bleibt.
  „Später“ = alle Aufgaben mit geplantem Datum nach heute.
  Schnellauswahl: morgen · nächster Montag · 1. des nächsten Monats · eigenes Datum.
- **Nachfrage ab dem 3. Verschieben:** Aufteilen (legt sofort eine Unteraufgabe an) ·
  Irgendwann · Löschen · Trotzdem verschieben.
- **Schnelleingabe:**
  - Datum/Uhrzeit setzen die _Fälligkeit_.
  - Nur Uhrzeit → heute, falls noch nicht vorbei, sonst morgen.
  - Wochentag → nächster solcher Tag, heute zählt mit.
  - `15.12.` ohne Jahr → nächstes Vorkommen.
  - Jede Kürzel-Art wird nur einmal erkannt (das erste Vorkommen).
  - `#pool`: Groß/Klein egal, Anfang des Namens reicht.
  - Unbekannter Pool → roter Chip mit „anlegen“.
  - Ein über die Leiste gesetzter Wert hat Vorrang; das passende Kürzel wird
    dann wieder normaler Text. Erneuter Klick auf einen aktiven Knopf hebt ihn auf.
  - `#name` sucht zuerst Pools, dann Projekte (exakt vor Wortanfang).
  - Das Eingabefeld wird sofort geleert, damit man direkt die nächste Aufgabe tippen kann.
- **Drag & Drop:**
  - Senkrecht = Position, waagrecht = Ebene (ca. 22 px pro Ebene), begrenzt auf das
    an der Stelle Mögliche; nicht in eingeklappte Aufgaben hinein.
  - Nur zwischen Listen desselben Bereichs (aktiv ↔ aktiv, Irgendwann ↔ Irgendwann);
    „Später“ (nach Datum sortiert) und „Erledigt“ sind nicht ziehbar.
  - Auf Pool/Projekt in der Seitenleiste ablegen = als oberste Aufgabe ans Ende.
  - Escape bricht ab.
- **Gliederung:**
  - Enter mitten im Text teilt die Zeile.
  - Enter am Zeilenanfang fügt eine leere Zeile darüber ein.
  - Enter in leerer, eingerückter Zeile rückt aus.
  - Backspace in leerer Zeile löscht sie.
  - Alt+↑/↓ verschiebt, Strg+Enter hakt ab.
  - Leere Zeilen verschwinden beim Verlassen.
  - Tastendrücke zwischen Enter und dem Erscheinen der neuen Zeile werden gepuffert.
- **Abhaken mit offenen Unteraufgaben:** Nachfrage „Alle erledigen / Nur diese“.
- **Erledigte** Aufgaben: eingeklappter Bereich „Erledigt“ pro Pool.
- **Status „In Arbeit“** ist (noch) nicht direkt setzbar – vorgesehen für den Timer (Phase 5).
- **Kategorien/Tags** gibt es nicht; `CATEGORIES` anderer Clients bleibt beim Sync erhalten.
- **Inbox-Altern:** markiert nach mehr als 7 Tagen (einstellbar), Badge wird orange.
- **Aufräum-Modus:** Wischen links = löschen (mit Rückgängig), rechts = überspringen;
  Tasten 1–9 / I / Entf / →.
- **Darstellung** gilt pro Gerät (localStorage, wird vor dem ersten Rendern angewendet).
  Schriftgrößen sind in `rem`, damit die Einstellung überall wirkt; die Zeilenhöhe folgt
  der Dichte. Bei eigener Akzentfarbe wird die Schriftfarbe darauf (hell/dunkel)
  automatisch nach Kontrast gewählt.

### Sync (Phase 2)

- **Mapping:** ical.js. Beim Schreiben wird das zuletzt geladene VTODO des Servers gezielt
  verändert (nur geänderte Felder). Unbekannte Eigenschaften, VALARM, VTIMEZONE,
  CATEGORIES, andere RELATED-TO-Typen bleiben erhalten; unveränderte Datumsangaben behalten
  ihre Zeitzone. Neu geschriebene Zeiten sind „floating“ (lokale Zeit), ganztägig als DATE.
- **Eigene Felder:** `X-MYTASKS-SORT` (exakter Sortierschlüssel; zusätzlich
  `X-APPLE-SORT-ORDER` als Zahl für andere Apps), `-PROJECT`, `-SOMEDAY`, `-POSTPONED`,
  `-ESTIMATE`, `-ENERGY`, `-WAITING` (JSON).
- **Projekte, Name, Farbe** eines Pools: als Eigenschaften der CalDAV-Liste
  (`displayname`, `calendar-color`, eigene Eigenschaft `projects` mit JSON). Andere Apps
  sehen keine Projekt-Aufgaben. Projekte: wer zuletzt geändert hat, gewinnt;
  Löschen als Tombstone.
- **Warteschlange:** Eine Aufgabe gilt als „noch zu senden“, solange sie sich von ihrem
  letzten synchronisierten Stand unterscheidet (pro Aufgabe gespeichert). Das ersetzt eine
  separate Liste von Vorgängen und fasst mehrere Offline-Änderungen automatisch zusammen.
- **Ablauf:** Holen (sync-token, sonst Vergleich aller ETags) → Liste abgleichen → Senden
  (mit `If-Match`/`If-None-Match`). Bei 412 wird neu geladen, zusammengeführt und
  nochmal versucht.
- **Zusammenführen pro Feld** (Dreiwege). Ohne Rückfrage: Reihenfolge (Server gewinnt),
  Verschiebe-Zähler (Maximum), Erledigt-Zeitpunkt (folgt dem Status). Echte Konflikte:
  lokaler Wert bleibt sichtbar, Aufgabe wird erst nach der Entscheidung hochgeladen
  (Seite „Konflikte“).
- **Löschen vs. Ändern:** Wurde auf einer Seite gelöscht und auf der anderen geändert,
  bleibt die geänderte Aufgabe erhalten.
- **Pool-Wechsel:** Aufgabe wird in der alten Liste gelöscht und in der neuen angelegt.
- **Fremde Aufgaben** ohne Elternteil in der Liste erscheinen als oberste Aufgaben.
- **Automatisch:** beim Start, alle 5 Minuten (wenn sichtbar), wenn das Netz zurückkommt
  und 3 Sekunden nach lokalen Änderungen. Nie zwei Läufe gleichzeitig (auch nicht aus
  mehreren Tabs: Web Locks).
- **Bedienung:** Das Sync-Ziel wird **im jeweiligen Pool** gewählt (Stift neben dem
  Namen → „Synchronisation“; auch in der Inbox): nicht synchronisieren, neue Liste oder
  vorhandene Liste eines Kontos. Neben dem Pool-Namen zeigt ein kleines Schild das Konto
  (rot bei Fehler). Die Einstellungen enthalten nur die Konten – je Konto die Listen auf
  dem Server mit dem verknüpften Pool bzw. „Als Pool übernehmen“.
- **Projekt löschen:** über den Stift am Projekt (im Pool, auf der Projektseite) oder in
  den Einstellungen. Enthält es Aufgaben, wählt man „Aufgaben behalten“ (sie bleiben im
  Pool, ohne Projekt) oder „Mit Aufgaben löschen“.
- **Pool löschen:** Rückfrage nennt die Zahl der Aufgaben und Projekte; alles wird auf dem
  Gerät endgültig entfernt (kein Rückgängig). Bei synchronisierten Pools wählt man:
  „Nur auf diesem Gerät“ (Liste bleibt auf dem Server und lässt sich wieder übernehmen)
  oder „Auch auf dem Server“ (Liste verschwindet für alle Geräte). Andere Geräte melden
  dann am Pool „Liste gibt es nicht mehr“ und behalten ihre Aufgaben, bis man dort
  entscheidet.
- **Mehrere Konten** (verschiedene Server oder Benutzer) sind möglich; jeder Pool wählt
  sein Konto selbst. Eine Liste gehört zu genau einem Pool.
- **Konten** und Passwörter liegen lokal; im Browser unverschlüsselt in IndexedDB
  (Android: Secure Storage in Phase 3).
- **Server:** `docker/` mit Radicale + Caddy; App und CalDAV unter einer Adresse
  (`/dav/`) → kein CORS nötig. Alternative mit CORS als Beispiel. Lokal ohne Docker:
  `pnpm radicale`, im Dev-Server unter `/dav/` erreichbar.
- **Tests:** Integrationstests mit zwei simulierten Geräten gegen echten Radicale
  (startet automatisch), Browser-Test mit zwei Profilen inkl. Offline-Konflikt.

### Offen (spätere Phasen)

- Projekte nur eine Ebene tief – reicht das, oder werden verschachtelte Projekte gebraucht?
- Docker-Setup ist geschrieben, aber noch nicht auf einem echten Server ausprobiert.
- App-Name und Android-App-ID (vor Phase 2/3 festlegen, bestimmt auch das `X-`-Präfix).
- Hosting der PWA und CORS-Setup (Phase 2).
- Speicherung von CalDAV-Passwörtern im Browser (Phase 2).
- „X Tage nach Erledigung“ kompatibel zu Tasks.org abbilden (Phase 5).
