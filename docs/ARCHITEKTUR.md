# Architektur

Wie Ordo aufgebaut ist – zum Verstehen, Ändern und Erweitern.

- [Überblick](#überblick)
- [Ordner und Schichten](#ordner-und-schichten)
- [Datenmodell](#datenmodell)
- [Daten lesen und schreiben](#daten-lesen-und-schreiben)
- [Oberfläche](#oberfläche)
- [Synchronisation](#synchronisation)
- [KI](#ki)
- [Einstellungen und Gerätezustand](#einstellungen-und-gerätezustand)
- [PWA und Offline](#pwa-und-offline)
- [Tests](#tests)

---

## Überblick

```
┌──────────────────────── Browser (ein Gerät) ─────────────────────────┐
│                                                                      │
│  Oberfläche (Svelte 5)  ──liest──▶  live()-Abfragen  ◀──meldet──┐    │
│         │                                                       │    │
│         └──schreibt──▶  repo (alle Änderungen)  ──▶  IndexedDB (Dexie)
│                                                         ▲            │
│                          Sync-Engine  ──────────────────┘            │
└──────────────────────────────│───────────────────────────────────────┘
                               │ CalDAV (HTTP, VTODO)
                               ▼
                      Radicale / Nextcloud / …
```

- **Local-first:** Die Datenbank im Browser ist die Wahrheit. Die Oberfläche wartet nie
  auf das Netz. Der Sync gleicht im Hintergrund ab.
- **Reine Client-App:** SvelteKit mit `adapter-static`, `ssr = false`. Es gibt keinen eigenen
  Backend-Code – nur statische Dateien plus einen beliebigen CalDAV-Server.
- **Eine Richtung:** Die Oberfläche schreibt nur über `repo`, liest nur über reaktive Abfragen.
  Jede Änderung – lokal, aus einem anderen Tab oder vom Sync – erscheint automatisch überall.

## Ordner und Schichten

```
src/
├── lib/
│   ├── domain/   reine Logik und Typen – kein Svelte, keine Datenbank
│   ├── db/       Dexie-Schema (db.ts) und Repository (repo.ts) – alle Schreibzugriffe
│   ├── sync/     CalDAV-Client, VTODO-Abbildung, Zusammenführen, Sync-Engine
│   ├── ai/       KI: OpenRouter-Client, Kontext (Pool-Trennung), Funktionen und Prompts
│   ├── state/    App-Zustand (Svelte-Runes), reaktive Abfragen, Aktionen mit Rückfragen
│   ├── ui/       Komponenten
│   └── i18n/     alle Texte der Oberfläche (de.ts)
├── routes/       Seiten (SvelteKit-Dateirouting)
├── app.css       globale Gestaltung, Farb- und Größen-Variablen
├── app.html      HTML-Hülle; setzt Farbschema vor dem ersten Zeichnen
└── service-worker.ts
```

Abhängigkeiten zeigen nur in eine Richtung:

```
domain  ◀──  db  ◀──  sync  ◀──  state  ◀──  ui / routes
```

`domain` kennt nichts anderes und ist deshalb vollständig mit Unit-Tests abgedeckt.
Importe nutzen den Alias `#lib/…` mit Dateiendung (`#lib/domain/tree.ts`).

### Die wichtigsten Module

| Modul                 | Aufgabe                                                                           |
| --------------------- | --------------------------------------------------------------------------------- |
| `domain/types.ts`     | Datenmodell (Pool, Projekt, Aufgabe, Zeiteintrag …)                               |
| `domain/tree.ts`      | Aufgabenbaum: flache Zeilen, Kinder, Sortierschlüssel                             |
| `domain/quick-add.ts` | Parser der Schnelleingabe (Datum, Uhrzeit, `!1`, `#pool`)                         |
| `domain/dnd.ts`       | Ziehen: wohin und auf welche Ebene darf eine Zeile                                |
| `domain/postpone.ts`  | Zurückschieben und „Später“                                                       |
| `domain/views.ts`     | Bereiche eines Pools (offen, später, irgendwann, erledigt), alte Inbox-Einträge   |
| `domain/time.ts`      | Zeitformate, Dauer setzen, Auswertungen, Soll/Ist                                 |
| `domain/triage.ts`    | Wann ist Aufräumen fällig (feste Zeiten, Regeln, Aufschieben)                     |
| `domain/next.ts`      | „Was als Nächstes?“: Punkte je Grund × Gewichtung, Ausschlüsse, Begründung        |
| `domain/today.ts`     | Heute-Ansicht (überfällig, geplant, liegen geblieben, Zeitsumme), Wochenrückblick |
| `db/repo.ts`          | Anlegen, ändern, verschieben, löschen (mit Tombstones für den Sync)               |
| `sync/engine.ts`      | Abgleich pro Pool                                                                 |
| `state/queries.ts`    | wiederverwendbare Datenbank-Abfragen                                              |
| `state/actions.ts`    | Aktionen mit Rückfrage und „Rückgängig“ (z. B. Pool löschen)                      |
| `ui/TaskList.svelte`  | Outliner: Tastatur, Einrücken, Ziehen                                             |
| `ui/drag.svelte.ts`   | Ziehen mit Pointer-Events (ohne Bibliothek), Ablageziele                          |

## Datenmodell

Definiert in [`domain/types.ts`](../src/lib/domain/types.ts), gespeichert in IndexedDB:

| Tabelle       | Inhalt                                                                       |
| ------------- | ---------------------------------------------------------------------------- |
| `pools`       | Pools und die Inbox (`kind: 'inbox'`, feste ID `inbox`)                      |
| `projects`    | Projekte, je mit `poolId`                                                    |
| `tasks`       | Aufgaben mit `poolId`, `projectId`, `parentId`, `sortOrder`, Zeiteinträgen … |
| `settings`    | Schlüssel/Wert: Inbox-Tage, Zeit-Einstellungen, Timer, Aufräum-Zeitplan      |
| `workDays`    | tatsächlich gearbeitete Zeit je Tag                                          |
| `accounts`    | CalDAV-Konten (Zugangsdaten nur lokal)                                       |
| `syncState`   | pro Pool: sync-token, CTag, zuletzt gesehene Listen-Eigenschaften            |
| `syncRecords` | pro Aufgabe: URL, ETag und der **Basisstand** fürs Zusammenführen            |
| `conflicts`   | offene Konflikte (Feld, lokaler und entfernter Wert)                         |

Wichtige Grundsätze:

- **IDs** sind UUIDs und entsprechen der VTODO-`UID`.
- **Reihenfolge** über Text-Schlüssel (_fractional indexing_, Paket `fractional-indexing`):
  Einfügen zwischen zwei Zeilen ändert nur die eine verschobene Zeile.
- **Daten** als `{ date: 'YYYY-MM-DD', time?: 'HH:mm' }` – ohne Zeitzonen-Fallen,
  ganztägig ohne `time`.
- **Löschen** setzt `deletedAt` (Tombstone), damit der Sync die Löschung weitergeben kann.
- **Schema-Änderungen** bekommen in [`db/db.ts`](../src/lib/db/db.ts) eine neue Version
  (derzeit v5). Alte Versionen bleiben stehen; Dexie migriert vorhandene Daten.

## Daten lesen und schreiben

**Schreiben** geht ausschließlich über `repo` ([`db/repo.ts`](../src/lib/db/repo.ts)):

```ts
import { repo } from '#lib/state/app.ts';
const id = await repo.createTask({ poolId, projectId: null, title: 'Neu' });
await repo.updateTask(id, { priority: 1 });
```

Das Repository kümmert sich um Zeitstempel, Sortierschlüssel, Unteraufgaben beim
Verschieben, Tombstones und Transaktionen.

**Lesen** über `live()` ([`state/live.svelte.ts`](../src/lib/state/live.svelte.ts)),
eine Hülle um Dexies `liveQuery`. Das Ergebnis aktualisiert sich bei jeder Änderung
an den gelesenen Tabellen:

```ts
const tasks = live(() => {
	const id = page.params.id; // reaktive Werte hier lesen …
	return q.poolTasks(id); // … die Abfrage selbst läuft in liveQuery
}, []);
// im Markup: tasks.current, tasks.loaded
```

Aktionen mit Rückfrage oder „Rückgängig“ (Löschen, Pool entfernen) liegen in
[`state/actions.ts`](../src/lib/state/actions.ts) und nutzen `ask()` / `toast()` aus
`state/ui.svelte.ts`.

## Oberfläche

- **Svelte 5 mit Runes** (`$state`, `$derived`, `$effect`). Gemeinsamer Zustand liegt in
  `*.svelte.ts`-Modulen unter `state/` (z. B. `ui`, `appearance`, `timeSettings`, `triage`).
- **Gestaltung** über CSS-Variablen in `app.css` (`--accent`, `--row-h`, `--gap` …).
  Darstellungs-Einstellungen setzen nur Attribute/Variablen am `<html>`-Element;
  `app.html` wendet sie schon vor dem ersten Zeichnen an (kein Aufblitzen).
- **Texte** stehen alle in [`i18n/de.ts`](../src/lib/i18n/de.ts) und werden typisiert über `m.…` genutzt.
- **Icons** sind eigene Pfade in `ui/Icon.svelte` – keine Icon-Bibliothek.

### Outliner-Details

- **Tastenpuffer** (`beginKeyBuffer` / `replayKeys` in `state/ui.svelte.ts`): Zwischen Enter
  und dem Erscheinen der neuen Zeile vergehen Millisekunden. Tastendrücke in dieser Zeit
  werden gesammelt und in der neuen Zeile abgespielt – schnelles Tippen verliert nichts.
- **Fokus-Anfragen** (`requestFocus(id)`): Die Zeile mit dieser ID nimmt den Fokus, sobald sie existiert.
- **`syncValue`-Aktion** (`ui/sync-value.ts`): Ein Eingabefeld übernimmt neue Werte aus der
  Datenbank nur, solange es nicht fokussiert ist – Tippen wird nie überschrieben.
- **Ziehen** (`ui/drag.svelte.ts` + `domain/dnd.ts`): Pointer-Events statt HTML-Drag-and-Drop,
  damit es mit Maus und Finger gleich funktioniert. Die Rechnung „wohin, welche Ebene“ ist reine
  Logik in `domain/dnd.ts`; Ablageziele melden sich per `registerDropList` / `data-drop-*`-Attributen an.

## Synchronisation

Code in [`src/lib/sync/`](../src/lib/sync/):

| Datei       | Aufgabe                                                                                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `caldav.ts` | schlanker CalDAV-Client (PROPFIND, REPORT, sync-collection, PUT/DELETE mit ETag). Die HTTP-Schicht (`Transport`) ist austauschbar – später native Requests in der Android-App. |
| `vtodo.ts`  | Aufgabe ⇄ VTODO mit ical.js                                                                                                                                                    |
| `fields.ts` | welche Felder synchronisiert werden, wie sie verglichen werden                                                                                                                 |
| `merge.ts`  | Dreiwege-Zusammenführung pro Feld                                                                                                                                              |
| `engine.ts` | der Ablauf pro Pool                                                                                                                                                            |
| `model.ts`  | Typen für Sync-Zustand, Datensätze, Konflikte                                                                                                                                  |

**Ablauf pro Pool:**

1. **Holen:** Änderungen seit dem letzten `sync-token` (sonst Vergleich aller ETags).
   Geänderte VTODOs laden und mit dem lokalen Stand zusammenführen.
2. **Projekte und Listen-Eigenschaften** (Name, Farbe) abgleichen. Projekte stehen als JSON
   in einer eigenen Eigenschaft der Liste.
3. **Senden:** neue, geänderte und gelöschte Aufgaben hochladen – immer mit ETag-Prüfung
   (`If-Match`). Hat sich die Aufgabe inzwischen auf dem Server geändert, wird erst
   zusammengeführt und dann erneut gesendet.

**Zusammenführen** ([`merge.ts`](../src/lib/sync/merge.ts)): Für jede Aufgabe ist der zuletzt
synchronisierte Stand gespeichert (`syncRecords.base`). Pro Feld gilt:

| lokal geändert | Server geändert | Ergebnis                                         |
| -------------- | --------------- | ------------------------------------------------ |
| ja             | nein            | lokal gewinnt                                    |
| nein           | ja              | Server gewinnt                                   |
| ja, gleich     | ja, gleich      | egal                                             |
| ja             | ja, anders      | **Konflikt** – lokaler Wert bleibt, Nutzer wählt |

Einige Felder werden ohne Rückfrage gelöst (Reihenfolge, Verschiebe-Zähler = Maximum,
Zeiteinträge eintragsweise zusammengeführt).

**Verträglichkeit mit anderen Programmen** ([`vtodo.ts`](../src/lib/sync/vtodo.ts)):
Beim Schreiben wird immer das zuletzt geladene VTODO verändert – nur die geänderten
Eigenschaften. Fremde Eigenschaften, Erinnerungen, Kategorien usw. bleiben erhalten.
Ordo-eigene Felder stehen in `X-MYTASKS-*`-Eigenschaften (`SORT`, `PROJECT`, `SOMEDAY`,
`POSTPONED`, `ESTIMATE`, `ENERGY`, `WAITING`, `TIME`). JSON-Werte darin sind URL-kodiert,
weil manche Server Werte an Kommas abschneiden. Der Präfix bleibt aus Verträglichkeitsgründen
`MYTASKS`, obwohl die App jetzt Ordo heißt.

**Gleichzeitigkeit:** Pro Pool läuft immer nur ein Sync – auch über mehrere Tabs hinweg
(Web Locks API, `navigator.locks`). Der automatische Sync wird in `state/sync.svelte.ts`
angestoßen (Start, Änderungen, Rückkehr ins Fenster, Intervall).

## KI

Code in [`src/lib/ai/`](../src/lib/ai/) (reine Logik) und [`state/ai.svelte.ts`](../src/lib/state/ai.svelte.ts):

| Datei                | Aufgabe                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `ai/openrouter.ts`   | schlanker Client: Chat mit JSON-Schema, Ersatzmodell, Datenschutz-Vorgabe, Kosten, Schlüsselprüfung; `fetch` austauschbar |
| `ai/context.ts`      | **die einzige Stelle, die KI-Kontext baut** – immer genau ein Pool                                                        |
| `ai/features.ts`     | die Funktionen: Prompt, Schema, Antwort prüfen (zerlegen, Tipps, Freitext, Tagesplan, Rückblick, Pool-Vorschlag)          |
| `state/ai.svelte.ts` | Einstellungen, Tageslimit/Verbrauch, `runPoolAi`/`runTaskAi`/`runInboxAi`, KI-Fenster                                     |
| `ui/AiPanel.svelte`  | Vorschau mit Abhaken/Bearbeiten, Übernehmen, Neu erzeugen                                                                 |

**Ablauf eines Aufrufs:**

```
Knopf → runTaskAi(task, breakdown)
        ├─ lädt NUR die Tabellenzeilen dieses Pools aus IndexedDB
        ├─ buildTaskContext()  → filtert nochmals + assertSinglePool()
        ├─ breakdown(ctx)      → Prompt + JSON-Schema
        ├─ prüft: Schlüssel, Pool-Freigabe, Tageslimit
        ├─ OpenRouter (Modell → Ersatzmodell, nur Anbieter ohne Datenspeicherung)
        ├─ Kosten verbuchen (settings.aiUsage)
        └─ parse() → Vorschlag → AiPanel → erst „Übernehmen“ ändert Daten
```

**Pool-Trennung prüfen die Tests** `ai/context.test.ts` (alle Funktionen, mit „GEHEIM“-Markierungen
in fremden Pools) und `e2e/ai.e2e.ts` (liest im Browser jede abgeschickte Anfrage mit).
`ai/live.test.ts` fragt echt bei OpenRouter an – nur mit gesetztem `OPENROUTER_API_KEY`.

## Einstellungen und Gerätezustand

| Was                                 | Wo gespeichert                               | Synchronisiert |
| ----------------------------------- | -------------------------------------------- | -------------- |
| Darstellung                         | `localStorage` (`appearance`)                | nein           |
| Zeiterfassung (Modus, Soll, Runden) | `settings` (`timeSettings`)                  | nein           |
| Laufender Timer                     | `settings` (`timer`)                         | nein           |
| Aufräum-Zeitplan und -Zustand       | `settings` (`triageSettings`, `triageState`) | nein           |
| Arbeitszeit je Tag                  | `workDays`                                   | nein           |
| Zeiteinträge an Aufgaben            | `tasks.timeEntries`                          | ja             |
| Ein-/Ausgeklappt                    | `tasks.collapsed`                            | nein           |

## PWA und Offline

- `static/manifest.webmanifest` und die Icons in `static/` machen Ordo installierbar.
- `src/service-worker.ts` legt die App-Hülle in den Cache – Ordo startet ohne Netz.
- Daten liegen ohnehin lokal; ohne Netz wird einfach nicht synchronisiert.

## Tests

| Art         | Werkzeug                      | Wo                           | Was                                                                      |
| ----------- | ----------------------------- | ---------------------------- | ------------------------------------------------------------------------ |
| Unit        | Vitest (+ fake-indexeddb)     | `src/**/*.test.ts`           | Logik, Repository, VTODO, Merge, Sync-Engine (mit simuliertem Server)    |
| Browser     | Playwright (Chrome + Pixel 7) | `e2e/*.e2e.ts`               | echte Bedienung gegen den gebauten Stand, inkl. Sync mit echtem Radicale |
| Screenshots | Playwright                    | `scripts/screenshots.e2e.ts` | Bilder für die Doku (`pnpm screenshots`)                                 |

Mehr dazu in [ENTWICKLUNG.md](ENTWICKLUNG.md).
