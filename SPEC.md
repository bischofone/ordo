# SPEC – Ordo

**Ordo** (lateinisch „Ordnung“) ist eine eigene local-first Aufgaben-App mit getrennten Pools, Sync über CalDAV, nativen
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

### Inbox aufräumen

- **Auslöser** gelten nur, wenn etwas in der Inbox liegt. Feste Zeiten: ab der Uhrzeit
  fällig, bis erledigt; maßgeblich ist der späteste heute erreichte Zeitpunkt (verpasste
  Zeiten vom Vortag zählen nicht nach). Regeln: höchstens einmal pro Tag.
- **Erledigt** ist ein Auslöser, wenn die Inbox leer geräumt (ohne übersprungene Karten)
  oder der Hinweis ausgeblendet wurde. „Später“ schiebt um einstellbare Minuten auf
  (Standard 15); beim Erzwingen nur einmal je Auslöser.
- Es zählen nur offene Einträge der obersten Ebene.
- Schneller Doppelklick verschiebt nicht zweimal: Aktionen laufen nacheinander.

### Zeiterfassung

- Jede Aufgabe hat einen gut sichtbaren **Play/Stop-Button** direkt in der Zeile.
- Immer nur ein Timer aktiv. Ein Klick auf eine andere Aufgabe wechselt den Timer.
- Laufender Timer ist global sichtbar (Kopfzeile).
- Einträge nachträglich bearbeitbar/manuell hinzufügbar.
- Summe pro Aufgabe inkl. Unteraufgaben. Einfache Auswertung pro Pool/Zeitraum.
- Laufender Timer überlebt App-Neustart (Startzeit speichern, nicht hochzählen).
- **Zeit von Hand erfassen** in den Aufgaben-Details: Dauer in freiem Format
  (`0:30`, `0,5h`, `45min`, `1h 30m` …) wird automatisch umgerechnet und vor dem
  Speichern angezeigt. Datum wählbar, Standard ist immer der aktuelle Tag.
- **Auswertung „Zeiten“:** Tag, Woche oder Monat, vor- und zurückblättern (auch
  rückblickend); Gesamtzeit, Balken je Tag, Aufteilung nach Pool/Projekt und nach
  Aufgabe, alle Einträge (dort änder- und löschbar); Filter nach Pool.
- **Zeiterfassungs-Modus:** Alles zur Zeiterfassung erscheint nur, wenn der Modus in den
  Einstellungen (eigener Bereich „Zeiterfassung“) eingeschaltet ist. Standard: aus.
- **Soll-Zeit** je Wochentag einstellbar (Standard Mo–Fr 8:00, Sa/So frei).
- **Tatsächliche Arbeitszeit** je Tag von Hand eintragbar (Seite „Zeiten“: in der
  Tagesansicht und in der Tagestabelle von Woche/Monat).
- **Gegenüberstellung** je Tag, Woche und Monat: Soll · Gearbeitet · Getrackt ·
  Nicht zugeordnet (gearbeitet, aber keiner Aufgabe zugeordnet) · Fehlt aufs Soll · Saldo.
- Timer lässt sich beim Stoppen auf 5 oder 15 Minuten runden.

## 4. Inbox (ohne Chaos)

- Eingang für schnelles Erfassen, ohne Pool.
- **Aufräum-Modus:** Einträge einzeln als Karte; Aktionen per Wisch/Klick:
  Pool zuweisen, „Irgendwann“, Termin setzen, löschen.
- **Aufräum-Modus als Kartenstapel:** Auf der Karte direkt Titel, Notiz, Fälligkeit
  (Heute/Morgen/Datum), Priorität und „Irgendwann“ setzen; dann die Karte auf eine
  Pool- oder Projekt-Kachel ziehen (Maus oder Finger) oder die Kachel antippen. Auf
  „Löschen“ ziehen oder nach links wischen = löschen (mit Rückgängig), nach rechts =
  überspringen. Jede Zuordnung lässt sich rückgängig machen.
- **Aufräumen nach Zeitplan** (Einstellungen → „Inbox aufräumen“, pro Gerät):
  Modus Aus / Vorschlagen / Erzwingen. Auslöser frei wählbar: feste Uhrzeiten mit
  Wochentagen und/oder Regeln (ab N Einträgen; Eintrag älter als X Tage).
  Vorschlagen: Hinweis oben mit „Aufräumen“, „später“ und „ausblenden“. Erzwingen: die App
  öffnet das Aufräumen, Wegnavigieren und Überspringen gehen nicht, bis die Inbox leer
  ist; einmal aufschieben ist erlaubt.
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
- Inbox: Pool-Vorschlag beim Aufräumen (auf Knopfdruck, je Karte).
- Kosten: Tageslimit pro Gerät (Standard 5 Cent), Verbrauch sichtbar in den Einstellungen.

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
- **Zusammengehöriges ist sichtbar gruppiert:** Aufgaben direkt im Pool stehen in einer
  schlichten Karte ohne Kopfzeile (wie in der Projektansicht), jedes Projekt darunter in
  einer Karte mit Kopfzeile; Einstellungen sind in Karten je Bereich gegliedert.
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
4. ✅ **Planung:** Priorisierung, „Was als Nächstes?“, Heute-Ansicht, Tagesplanung
   (vor Phase 3 umgesetzt, weil dafür kein Android-Werkzeug nötig ist).
5. **Wartet-auf, Abhängigkeiten, Wiederholungen, Vorlagen, Zeiterfassung.**
   (✅ Zeiterfassung auf Wunsch vorgezogen und fertig.)
6. ✅ **KI über OpenRouter** mit strikter Pool-Trennung (auf Wunsch vor Phase 3–5 umgesetzt).
7. **Rest:** Wochenrückblick, Teilen-Ziel, Export/Backup, optional Tauri-Desktop.

Jede Phase ist abgeschlossen und getestet, bevor die nächste beginnt.

## 11. Entscheidungen (laufend ergänzt)

Festgelegt beim Start, um ohne Rückfragen loslegen zu können. Alles davon kann
jederzeit geändert werden – dann wird es hier angepasst.

### Marke

- **Name:** Ordo (lateinisch „Ordnung“), kurz und international aussprechbar.
- **Logo:** offenes O mit einem Punkt in der Lücke: das zuletzt Einsortierte
  schließt den Kreis. In der App folgt es der gewählten Akzentfarbe
  (`src/lib/ui/Logo.svelte`); App-Icons in `static/` (Blau `#0b6bcb`).
- Interne Kennungen (`X-MYTASKS-*` im CalDAV, Datenbankname) bleiben
  unverändert, damit bestehende Daten und Sync weiter funktionieren.

### Technik

- **Stack:** SvelteKit 3 (reine Client-App, `adapter-static`, kein SSR) +
  TypeScript, Dexie 4 (IndexedDB), date-fns, marked + DOMPurify.
- **i18n:** eigene, typisierte Textdatei (`src/lib/i18n/de.ts`) statt Bibliothek.
- **PWA:** eigener Service Worker von SvelteKit (App-Hülle im Cache, startet offline).
- **Tests:** Vitest (Logik + DB mit fake-indexeddb), Playwright (Desktop +
  Pixel-7-Profil) gegen den echten Build.
- **Code-Ort:** lokal außerhalb von Nextcloud (wegen `node_modules`);
  Repository: https://github.com/bischofone/ordo (öffentlich, MIT-Lizenz).
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
- **Details öffnen per Klick auf die Aufgabe** (abschaltbar unter Darstellung):
  - Breites Fenster (ab 1100 px): Klick irgendwo in die Zeile – auch in den Titel – zeigt
    die Details als Spalte rechts neben der Liste, ohne Abdunkeln. Der Cursor bleibt im
    Titel, direktes Tippen geht weiter. Die Spalte folgt der Zeile, in der man gerade ist
    (auch mit Pfeiltasten/Enter), bis man sie mit ✕ oder Escape schließt.
  - Handy/schmales Fenster: Tipp auf den Titel bearbeitet ihn (wie bisher); Tipp auf die
    freie Fläche der Zeile daneben öffnet die Details als Blatt von unten. Dafür ist das
    Titelfeld nur so breit wie sein Text. Bei sehr langen Titeln bleiben die drei Punkte.
  - Knöpfe der Zeile (Abhaken, Unteraufgabe, Zurückschieben, Griff) öffnen nichts.
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

### Zeiterfassung

- **Ein Zeiteintrag = Dauer an einem Tag** (Minuten + Datum), kein Von–Bis. Einträge liegen
  an der Aufgabe und werden mit ihr synchronisiert (`X-MYTASKS-TIME`).
- **Eingabe:** `h:mm`, Stunden mit Komma/Punkt und Einheit (`0,5h`, `2 Std`), Minuten
  (`45min`), Kombination (`1h 30m`). Ohne Einheit: Kommazahl = Stunden, ganze Zahl =
  Minuten. Höchstens 24 h je Eintrag. Unverständliches wird nicht gespeichert.
- **Timer:** läuft pro Gerät (nicht synchronisiert), immer nur einer; ein Wechsel stoppt
  und erfasst den vorherigen. Beim Stoppen wird auf Minuten gerundet (mindestens 1) und
  dem Tag des Starts zugeordnet. Unter 30 Sekunden wird nichts erfasst.
- **Zeitfeld in der Zeile** (links neben dem Play-Knopf): zeigt die erfasste Zeit der
  Aufgabe (leer = „0:00“ blass) und lässt sich direkt überschreiben. Ein Wert setzt die
  Gesamtzeit, `+0:15` zählt dazu, `-10` zieht ab, leer oder `0` löscht. Enter oder
  Verlassen übernimmt, Escape verwirft; Unverständliches ändert nichts.
  Die Differenz zählt für **heute**: Mehr Zeit erhöht den Eintrag von heute (oder legt
  einen an); weniger wird zuerst bei heute, dann bei den jüngsten Tagen abgezogen. Für
  andere Tage gibt es die Einträge in den Details.
- Haben Unteraufgaben eigene Zeit, steht am Elternteil zusätzlich „Σ“ mit der Summe.
- **Schmale Bildschirme:** Zeitfeld erscheint erst, wenn Zeit erfasst ist; die Knöpfe für
  Unteraufgabe und Zurückschieben entfallen dort (Leiste über der Tastatur bzw. Wisch
  nach links), damit der Titel lesbar bleibt.
- **Sync:** Einträge zweier Geräte werden je Eintrag zusammengeführt (neu von beiden
  Seiten bleibt, Löschen gilt, bei Änderung auf beiden Seiten gewinnt der Server) – kein
  Konflikt-Dialog.
- **Modus, Soll-Zeiten, Runden und die eingetragene Arbeitszeit je Tag** liegen nur auf dem
  jeweiligen Gerät (lokale Datenbank) und werden noch nicht synchronisiert. Die an
  Aufgaben getrackte Zeit wird synchronisiert.
- **Rechenregeln:** Ist für einen Tag keine Arbeitszeit eingetragen, zählt die getrackte
  Zeit als gearbeitet. „Nicht zugeordnet“ = gearbeitet − getrackt (nie negativ, nur bei
  eingetragener Arbeitszeit). „Fehlt aufs Soll“ und Saldo zählen nur Tage bis
  einschließlich heute; künftige Tage lassen sich nicht eintragen.
- In der Seitenleiste steht neben „Zeiten“: heute getrackt / Soll.
- **Eigene JSON-Felder im VTODO** (`-TIME`, `-WAITING`) werden URL-kodiert gespeichert:
  Radicale schneidet unbekannte Eigenschaften sonst am ersten Komma ab.

### Nextcloud und Termine im Kalender

- **CORS:** Nextcloud erlaubt keine Anfragen aus Web-Apps. Lösung ohne Änderung an Nextcloud:
  Weiterleitung über den eigenen Ordo-Server unter `/ext/<host>/…` → `https://<host>/…`
  (Vite-Plugin `scripts/dav-proxy.ts` im Entwicklungsmodus, Caddy im Betrieb). Nur https, nur
  erlaubte Server (Allowlist: `ordo nextcloud HOST` bzw. `ORDO_PROXY_HOSTS`) – sonst wäre der
  Server ein offener Proxy. `WWW-Authenticate` wird entfernt (kein Browser-Anmeldefenster).
- Die App probiert erst direkt; nur bei einem Netzwerk-/CORS-Fehler die Weiterleitung und
  merkt sich das am Konto (`proxy: true`). Gespeichert werden immer die echten Adressen; nur
  die Anfrage wird umgeschrieben (`proxyTransport`). Die Android-App braucht das später nicht.
- **Nextcloud-Dialog:** Adresse (auch ohne https:// oder mit /remote.php/… eingefügt),
  Benutzername, App-Passwort; Link direkt zur Seite „Sicherheit“ der eigenen Nextcloud.
- **Termine:** pro Pool ein Kalender (VEVENT, pro Gerät). Geplante offene Aufgaben → Termin
  mit UID `ordo-<taskId>`; mit Uhrzeit: Dauer = Zeitschätzung, sonst Standarddauer (30 min,
  einstellbar); ohne Uhrzeit: ganztägig (abschaltbar). Zeiten in UTC. Nur in eine Richtung
  (Ordo ist Quelle; bei 412 wird der aktuelle ETag geholt und überschrieben). Datum weg /
  gelöscht → Termin löschen; erledigt → Termin bleibt. Kalender gewechselt → Termine ziehen um.
  Neue Tabelle `eventRecords` (DB v6) mit URL, ETag, Fingerabdruck.

### Planung (Phase 4)

- **„Für heute geplant“ = geplantes Datum (DTSTART) ist heute.** Kein neues Feld – das
  synchronisiert schon und passt zum Zurückschieben (auf morgen geschoben → morgen in „Heute“).
- **Liegen gebliebenes** (geplant an einem früheren Tag, nicht erledigt) erscheint automatisch
  in „Heute“ mit Hinweis „seit gestern“ / „seit N Tagen“.
- **Überfällig** = Fälligkeit vorbei; eigener Bereich oben. Wird Überfälliges für heute
  eingeplant, zählt es in Zeitsumme und Anzahl mit.
- **Verfügbare Zeit:** für den Tag gesetzt > Soll-Zeit des Wochentags (bei Zeiterfassung) >
  Vorgabe in den Einstellungen (6:00).
- **„Was als Nächstes?“** (`domain/next.ts`): Punkte je Grund × Gewichtung (aus/wenig/normal/
  stark = 0/0,5/1/2). Gründe: Priorität (30/20/10), Fälligkeit (überfällig 40 + 2/Tag bis +20,
  heute 35, morgen 25, ≤ 3 Tage 15, ≤ 7 Tage 8), für heute geplant 20 (liegen geblieben 22),
  Alter (ab 7 Tagen, bis 15), verschoben (5 je Mal, bis 20), passt in die Zeit (+10, schnell +15,
  zu lang −20; mehr als 1,5× zu lang → ausgeblendet), Energie (passt +10, weniger nötig +5,
  mehr nötig −15 je Stufe). Ausgeschlossen: erledigt, Irgendwann, später, blockiert, wartet,
  mit offenen Unteraufgaben (dann die Unteraufgaben). Inbox-Einträge zählen nicht mit.
  Kontext-Modi kommen mit Phase 3 dazu.
- **Morgen-Ablauf** (`/heute/planen`): Überfällig → Inbox (Aufräumen führt per
  `?zurueck=` wieder zurück) → Auswählen (15 Vorschläge, Liste bleibt beim Abhaken stehen) →
  Fertig. Danach verschwindet der Hinweis „Tag planen“ für heute.
- **Wochenrückblick** (`/rueckblick`): letzte 7 Tage je Pool – erledigt, neu, erfasste Zeit,
  oft verschoben; bei eingeschalteter KI zusätzlich der KI-Rückblick.
- Planungs-Einstellungen gelten pro Gerät.

### KI (Phase 6)

- **Modellwahl (Stand 18.11.2026, per Test mit echten Ordo-Aufgaben):** Standard
  `z-ai/glm-5.3-flash` – beste Vorschläge der getesteten günstigen Modelle, ~3–4 s,
  ~0,01 Cent je Aufruf. Ersatz bei Ausfall: `mistralai/mistral-small-3.2-24b-instruct`.
  Verworfen: Gratis-Modelle (ständig überlastet, Anbieter dürfen Eingaben oft speichern),
  Denk-Modelle wie DeepSeek V4 Flash/Qwen 3.7 Flash (bis 25 s), gpt-oss-20b (schwache Vorschläge).
  Kosten im Alltag: 100 Aufrufe ≈ 1 Cent.
- **Datenschutz:** Standardmäßig nur Anbieter ohne Datenspeicherung (`data_collection: deny`)
  und mit Unterstützung für strukturierte Antworten (`require_parameters`). Abschaltbar.
- **Antworten als JSON-Schema** (strict), danach in der App geprüft und gesäubert
  (Titel, Tiefe ≤ 3, Anzahl, gültige Daten; Tagesplan nur mit Referenzen auf echte Aufgaben).
- **Referenzen statt IDs:** Die KI sieht Aufgaben als `a1`, `a2` …; die Zuordnung zu echten
  IDs bleibt in der App.
- **Pool-Trennung** zentral in `src/lib/ai/context.ts`: Kontext nur über `buildPoolContext`,
  `buildTaskContext`, `buildInboxItemContext`; zusätzlich `assertSinglePool`. Die App lädt
  für einen Aufruf ohnehin nur die Daten des einen Pools. Tests mit „GEHEIM“-Markierungen in
  fremden Pools (Unit und Browser).
- **Inbox-Vorschlag** sieht nur den einen Eintrag und die Pool-Namen – keine Aufgaben,
  Projekte oder Kontext-Notizen aus Pools. Das Modell darf nur einen der Namen antworten.
- **Einstellungen pro Gerät** (Schlüssel, Modell, Ersatzmodell, Tageslimit, Datenschutz) –
  der Schlüssel wird nie synchronisiert. **Pro Pool:** an/aus, eigenes Modell, Kontext-Notizen.
- **Tagesplan und Wochenrückblick** sind reine Anzeige (Tagesplan: Klick öffnet die Aufgabe);
  Zerlegen und Freitext legen nach Bestätigung Aufgaben an (mit „Rückgängig“), Tipps lassen
  sich an die Notizen anhängen.
- Live-Test gegen OpenRouter nur mit gesetztem `OPENROUTER_API_KEY` (nie in CI).

### Offen (spätere Phasen)

- Projekte nur eine Ebene tief – reicht das, oder werden verschachtelte Projekte gebraucht?
- Docker-Setup ist geschrieben, aber noch nicht auf einem echten Server ausprobiert.
- App-Name und Android-App-ID (vor Phase 2/3 festlegen, bestimmt auch das `X-`-Präfix).
- Hosting der PWA und CORS-Setup (Phase 2).
- Speicherung von CalDAV-Passwörtern im Browser (Phase 2).
- „X Tage nach Erledigung“ kompatibel zu Tasks.org abbilden (Phase 5).
