# Entwicklung

Arbeitsweise, Befehle und Konventionen. Den Aufbau des Codes erklärt
[ARCHITEKTUR.md](ARCHITEKTUR.md), die Einrichtung [INSTALLATION.md](INSTALLATION.md).

## Befehle

| Befehl             | Was passiert                                                           |
| ------------------ | ---------------------------------------------------------------------- |
| `pnpm install`     | Abhängigkeiten installieren                                            |
| `pnpm dev`         | Entwicklungsserver auf <http://localhost:5173> (mit `/dav` → Radicale) |
| `pnpm radicale`    | lokaler CalDAV-Testserver auf Port 5232 (Benutzer/Passwort `test`)     |
| `pnpm build`       | fertige App nach `build/`                                              |
| `pnpm serve`       | `build/` auf <http://localhost:4173> ausliefern                        |
| `pnpm check`       | TypeScript- und Svelte-Prüfung                                         |
| `pnpm lint`        | Prettier-Formatierung prüfen + ESLint                                  |
| `pnpm format`      | alles formatieren                                                      |
| `pnpm test:unit`   | Unit-Tests im Watch-Modus                                              |
| `pnpm test:e2e`    | Browser-Tests (baut die App, startet einen frischen Radicale)          |
| `pnpm test`        | alle Tests einmal                                                      |
| `pnpm screenshots` | Screenshots für die Doku neu erzeugen (`docs/screenshots/`)            |

Einmalig für die Browser-Tests: `pnpm exec playwright install chromium`.

## Arbeitsablauf

1. Änderung klein halten und zuerst die **Logik** in `src/lib/domain/` bauen – mit Unit-Test.
2. Schreibzugriffe ins **Repository** (`db/repo.ts`), nicht direkt aus Komponenten.
3. Oberfläche in `ui/` bzw. `routes/`; alle Texte nach `i18n/de.ts`.
4. Bedienung mit einem **Playwright-Test** in `e2e/` absichern.
5. Vor dem Commit: `pnpm check && pnpm lint && pnpm test`.
6. Ändern sich Anforderungen oder Entscheidungen: **SPEC.md** mitpflegen.

Auf GitHub prüft der Workflow [`ci.yml`](../.github/workflows/ci.yml) bei jedem Push dasselbe.

## Konventionen

- **Sprache:** Oberfläche, Kommentare, Commit-Nachrichten und Doku auf Deutsch;
  Bezeichner im Code auf Englisch.
- **Kommentare** erklären das _Warum_. Jede Datei beginnt mit einem kurzen Kommentar, wofür sie da ist.
- **Importe** über `#lib/…` mit Dateiendung, z. B. `#lib/domain/tree.ts`, `#lib/state/ui.svelte.ts`.
- **Svelte 5 Runes** statt Stores; geteilter Zustand in `*.svelte.ts`.
- **Keine Bibliothek ohne Not.** Ziehen, Icons, Übersetzungen sind bewusst selbst gebaut und klein.
- **Formatierung** macht Prettier (Tabs, einfache Anführungszeichen, Breite 100).
- **Datenbank-Schema** nur über eine neue `version(n)` in `db/db.ts` ändern, nie eine alte Version anpassen.
- **Sync-Felder:** Neues Feld an der Aufgabe, das synchronisiert werden soll? In
  `sync/fields.ts` (`SYNC_FIELDS`) und `sync/vtodo.ts` (lesen + schreiben) eintragen und
  einen Rundlauf-Test in `vtodo.test.ts` ergänzen.
- **Gestaltung:** Farben und Größen nur über die Variablen aus `app.css`, damit helles und
  dunkles Schema sowie die Akzentfarbe automatisch passen.

## Tests

- **Unit-Tests** liegen neben dem Code (`tree.ts` → `tree.test.ts`). Die Datenbank läuft dabei
  mit `fake-indexeddb`, die Sync-Engine gegen einen simulierten Server – kein Netz nötig.
- **Browser-Tests** laufen gegen den **gebauten** Stand (`pnpm build && pnpm serve`) in zwei
  Profilen: Desktop-Chrome und Pixel 7 (Dateien mit `mobile` im Namen). Für die Sync-Tests startet
  Playwright einen frischen Radicale auf Port 5390 mit leerem Datenordner.
- Hilfsfunktionen für Browser-Tests: [`e2e/helpers.ts`](../e2e/helpers.ts)
  (`openPool`, `quickAdd`, `rowByTitle`, `outline`).
- Bei einem Fehlschlag liegt unter `test-results/` ein Trace:
  `pnpm exec playwright show-trace test-results/…/trace.zip`.

## Bestehende Daten: Regeln für jede Änderung

Updates dürfen vorhandene Daten nie kaputt machen oder falsch anzeigen. Das prüfen Tests mit
**echten Daten aller früheren Versionen** – sie laufen bei jedem Push auf GitHub mit, und nur
wenn sie grün sind, entsteht ein Update.

| Was geprüft wird                                                                  | Wo                                                                   |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Jede frühere Datenbank öffnet, verliert nichts, ist gültig, lässt sich bearbeiten | `src/lib/db/migrations.test.ts` mit `src/lib/db/fixtures/v1…vN.json` |
| … und erscheint im Browser richtig (Pools, Baum, Inbox, Heute, Einstellungen)     | `e2e/upgrade.e2e.ts`                                                 |
| Aufgaben, die frühere Versionen auf den Server schrieben, werden richtig gelesen  | `src/lib/sync/formats.test.ts` mit `src/lib/sync/fixtures/*.ics`     |
| Sicherungen älterer Versionen lassen sich einspielen                              | `src/lib/backup/backup.test.ts`                                      |

Die Testdaten erzeugt `scripts/db-fixture.sh` mit dem Code der jeweiligen Version (auch für
frühere Stände: `scripts/db-fixture.sh COMMIT`). Vorhandene Testdaten werden **nie geändert**.

**Regeln:**

1. **Felder nie umbenennen oder umdeuten.** Neue Felder sind optional (`feld?:`) oder bekommen
   in einer Migration einen Wert. Beim Lesen von Einstellungen immer mit Standardwerten
   ergänzen (`{ ...DEFAULT, ...gespeichert }`).
2. **Schema ändern = neue Version** in `src/lib/db/db.ts` (alte Versionen bleiben stehen),
   Daten bei Bedarf in `.upgrade()` anpassen. Danach `scripts/db-fixture.sh` – sonst schlägt
   „neueste Version hat Testdaten“ fehl. Gleiches Schema ohne neue Nummer fällt ebenfalls auf.
3. **Sync-Format ändern** (was in `vtodo.ts` geschrieben wird): ältere Dateien müssen weiter
   gelesen werden; `scripts/db-fixture.sh` legt die neue Form als Testdatei ab, sonst schlägt
   „das aktuelle Format hat Testdaten“ fehl. Unbekannte Felder anderer Apps bleiben erhalten.
4. **Neue Pflichtfelder** in `src/lib/db/integrity.ts` mitprüfen.
5. **Sicherungsdatei** (`src/lib/backup/`): neue Tabellen landen automatisch darin. Ändert sich
   das Dateiformat selbst, `BACKUP_VERSION` erhöhen und ältere weiter lesen.

## Neue Funktion: ein Beispiel

„Aufgaben sollen ein Feld _Ort_ bekommen“:

1. `domain/types.ts`: `location?: string` an `Task`.
2. Kein neuer Index nötig → keine neue DB-Version (Dexie speichert beliebige Felder).
3. `db/repo.ts`: Feld in `updateTask` erlaubt? (Patch-Typ prüfen.)
4. Sync gewünscht: `sync/fields.ts` + `sync/vtodo.ts` (passt zur Standard-Eigenschaft `LOCATION`), Test.
5. `ui/TaskDetail.svelte`: Eingabefeld mit `use:syncValue`, Text in `i18n/de.ts`.
6. `e2e/detail.e2e.ts`: Ort eintragen, neu laden, ist noch da.
7. SPEC.md und [BEDIENUNG.md](BEDIENUNG.md) ergänzen.

## Installationsskripte

| Datei                 | Läuft auf                | Aufgabe                                                                |
| --------------------- | ------------------------ | ---------------------------------------------------------------------- |
| `install/proxmox.sh`  | Proxmox-Host (bash)      | Container anlegen, `ordo-lxc.sh` hineinlegen, starten                  |
| `install/ordo-lxc.sh` | Alpine im Container (sh) | Pakete, App bauen, Radicale/Caddy einrichten; danach als Befehl `ordo` |
| `docker/`             | Docker Compose           | dieselbe Kombination als Container-Paar                                |

`ordo-lxc.sh` lässt sich ohne Proxmox in einem Alpine-Rootfs testen; als Quelle dient dann
das lokale Repository: `ORDO_REPO=file:///pfad/zum/repo ordo install NAME PASSWORT`.

## Versionen und Änderungen

Änderungen stehen in [CHANGELOG.md](../CHANGELOG.md). Die Version in `package.json` folgt
grob den Phasen (0.1 = Phase 1, 0.2 = Phase 2, 0.3 = Zeiterfassung und Aufräumen).
