# Tasks

Local-first Aufgaben-App mit getrennten Pools. Spezifikation und Fortschritt: [SPEC.md](SPEC.md).

**Stand:** Phase 2 ist fertig – lokal im Browser (IndexedDB) und per CalDAV synchronisiert (z. B. Radicale).
Server-Einrichtung: [docker/README.md](docker/README.md).

## Voraussetzungen

- Node.js (getestet mit 26)
- pnpm (`sudo pacman -S pnpm` oder `yarn global add pnpm`)

## Befehle

| Befehl           | Was passiert                                                         |
| ---------------- | -------------------------------------------------------------------- |
| `pnpm install`   | Abhängigkeiten installieren (einmalig)                               |
| `pnpm dev`       | Entwicklungsserver auf http://localhost:5173                         |
| `pnpm build`     | Fertige App nach `build/` (statische Dateien, beliebig hostbar)      |
| `pnpm serve`     | `build/` lokal ausliefern auf http://localhost:4173 (wie ein Server) |
| `pnpm test:unit` | Unit-Tests (Logik + Datenbank), im Watch-Modus                       |
| `pnpm test:e2e`  | Browser-Tests mit Playwright gegen den echten Build                  |
| `pnpm test`      | alle Tests einmal                                                    |
| `pnpm check`     | TypeScript-/Svelte-Prüfung                                           |
| `pnpm lint`      | Formatierung + ESLint                                                |

Einmalig für die Browser-Tests: `pnpm exec playwright install chromium`.

## Aufbau

```
src/lib/domain/   reine Logik (Baum, Schnelleingabe, Zurückschieben …) – keine DB, keine UI
src/lib/db/       Dexie-Schema und Repository (alle Schreibzugriffe)
src/lib/state/    App-Zustand, reaktive Abfragen, Aktionen mit Rückfragen
src/lib/ui/       Komponenten
src/lib/sync/     CalDAV: VTODO-Mapping, Client, Zusammenführen, Sync-Engine
src/lib/i18n/     UI-Texte (Deutsch)
src/routes/       Seiten: / (alle Pools), /pool/[id], /inbox, /inbox/aufraeumen, /einstellungen
e2e/              Playwright-Tests
docker/           Server: Radicale + Caddy (docker compose)
scripts/          radicale.sh (lokaler Testserver)
```

Abhängigkeiten zeigen nur in eine Richtung: `domain ← db ← sync ← state ← ui/routes`.

## Sync ausprobieren (lokal)

```bash
pnpm radicale     # Terminal 1
pnpm dev          # Terminal 2
```

In der App: Einstellungen → Synchronisation → Server-Adresse `http://localhost:5173/dav/`,
Benutzer `test`, Passwort `test` → bei einem Pool „Neue Liste in …“ wählen.

## Bedienung (Kurzfassung)

- **Schnelleingabe:** `Rechnung zahlen morgen 9:00 !1 #privat` – erkannte Teile erscheinen als Chips, ✕ macht sie wieder zu normalem Text.
- **Unteraufgaben:** Knopf ↳ an der Zeile, oder Tab.
- **Drag & Drop:** am Griff links der Zeile ziehen – hoch/runter = Position, links/rechts = Ebene; auf Pool oder Projekt in der Seitenleiste ablegen verschiebt dorthin.
- **Projekte:** im Pool unten „Neues Projekt“; Farbe/Icon über den Stift-Knopf.
- **Gliederung:** Enter = neue Zeile, Tab / Shift+Tab = ein-/ausrücken, Backspace in leerer Zeile = löschen, ↑/↓ = Zeile wechseln, Alt+↑/↓ = verschieben, Strg+Enter = erledigt.
- **Handy:** Leiste über der Tastatur zum Ein-/Ausrücken; Zeile nach rechts wischen = erledigt, nach links = zurückschieben.
- **Inbox aufräumen:** Tasten 1–9 = Pool, I = Irgendwann, Entf = löschen, → = überspringen.
