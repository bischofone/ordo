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
  Pools lassen sich jederzeit anlegen, umbenennen, einfärben, sortieren und archivieren.
- **Jeder Pool = eine eigene CalDAV-Aufgabenliste.** Server/Konto/Liste pro Pool
  wählbar (Arbeit darf auf einem anderen Server liegen als Privat).
- Pools sind strikt getrennt. Ansichten zeigen einen, mehrere oder alle Pools.
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
- Am Handy: Buttons zum Ein-/Ausrücken über der Tastatur, Wischgesten.
- Fortschritt der Unteraufgaben am Elternteil sichtbar (z. B. 3/5).
- Unteraufgaben ein-/ausklappbar.

### Schnelleingabe (bewusst einfach)

Nur wenige, intuitive Kürzel – alles andere über Buttons:

- Datum in normalen Worten (Deutsch): `heute`, `morgen`, `Freitag`, `15.12.`, `9:00`
- Priorität: `!1` `!2` `!3`
- Pool: `#arbeit`
- Beispiel: `Rechnung zahlen morgen !1 #privat`
- Erkannte Teile werden live als farbige Chips angezeigt und sind per Klick
  entfernbar. Nichts wird „heimlich“ interpretiert.
- Daneben eine sichtbare Button-Leiste (Datum, Priorität, Pool) für alle, die
  keine Kürzel nutzen wollen.

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
- UI-Sprache Deutsch, i18n-fähig.
- Tests: Datenmodell, VTODO-Mapping (Hin- und Rückweg ohne Datenverlust),
  Sync-Konflikte, Score-Funktion, KI-Kontexttrennung, Benachrichtigungsregeln.
- `docker-compose.yml` mit Radicale (+ Reverse Proxy mit CORS für die
  Browser-Version) und README mit Setup-Anleitung.

## 10. Phasen

1. **MVP lokal:** Pools, Aufgaben, mehrstufige Unteraufgaben (Enter/Tab),
   Schnelleingabe, Inbox inkl. Aufräum-Modus, Zurückschieben, PWA.
2. **CalDAV-Sync** pro Pool + Radicale-Setup.
3. **Capacitor-Android-App** + lokale Benachrichtigungen + Kontext-Modi.
4. **Planung:** Priorisierung, „Was als Nächstes?“, Heute-Ansicht, Tagesplanung.
5. **Wartet-auf, Abhängigkeiten, Wiederholungen, Vorlagen, Zeiterfassung.**
6. **KI über OpenRouter** mit strikter Pool-Trennung.
7. **Rest:** Wochenrückblick, Teilen-Ziel, Export/Backup, optional Tauri-Desktop.

Jede Phase ist abgeschlossen und getestet, bevor die nächste beginnt.
