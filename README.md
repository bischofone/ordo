# Tasks

Local-first Aufgaben-App mit getrennten Pools. Spezifikation und Fortschritt: [SPEC.md](SPEC.md).

**Stand:** Phase 1 (MVP lokal) ist fertig. Alle Daten liegen nur im Browser (IndexedDB), es gibt noch keinen Sync.

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
src/lib/i18n/     UI-Texte (Deutsch)
src/routes/       Seiten: / (alle Pools), /pool/[id], /inbox, /inbox/aufraeumen, /einstellungen
e2e/              Playwright-Tests
```

Abhängigkeiten zeigen nur in eine Richtung: `domain ← db ← state ← ui/routes`.

## Bedienung (Kurzfassung)

- **Schnelleingabe:** `Rechnung zahlen morgen 9:00 !1 #privat` – erkannte Teile erscheinen als Chips, ✕ macht sie wieder zu normalem Text.
- **Gliederung:** Enter = neue Zeile, Tab / Shift+Tab = ein-/ausrücken, Backspace in leerer Zeile = löschen, ↑/↓ = Zeile wechseln, Alt+↑/↓ = verschieben, Strg+Enter = erledigt.
- **Handy:** Leiste über der Tastatur zum Ein-/Ausrücken; Zeile nach rechts wischen = erledigt, nach links = zurückschieben.
- **Inbox aufräumen:** Tasten 1–9 = Pool, I = Irgendwann, Entf = löschen, → = überspringen.
