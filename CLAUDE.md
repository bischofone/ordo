# Ordo – Hinweise für KI-Assistenten

- Sprache im Projekt: Deutsch (Oberfläche, Kommentare, Doku, Commits).
- Vor jeder Änderung an gespeicherten Daten die Regeln in `docs/ENTWICKLUNG.md`,
  Abschnitt „Bestehende Daten: Regeln für jede Änderung“, befolgen: Felder nie umbenennen,
  Schemaänderung = neue Version in `src/lib/db/db.ts` + `scripts/db-fixture.sh`,
  vorhandene Testdaten in `src/lib/db/fixtures` und `src/lib/sync/fixtures` nie ändern.
- Prüfen: `pnpm check`, `pnpm lint`, `pnpm test:unit --run`, `pnpm test:e2e`.
- `SPEC.md` und `CHANGELOG.md` mitpflegen.
