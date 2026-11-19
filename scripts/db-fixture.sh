#!/bin/sh
# Testdaten für die Kompatibilitätstests erzeugen, mit dem Code einer Ordo-Version:
#  - eine echte Datenbank als src/lib/db/fixtures/vN.json (N = Datenbank-Version)
#  - eine Aufgabe im Sync-Format als src/lib/sync/fixtures/ordo-COMMIT.ics (nur wenn sich
#    das Format gegenüber allen vorhandenen geändert hat)
#
#   scripts/db-fixture.sh            aktueller Stand (nach einer neuen Version in db.ts)
#   scripts/db-fixture.sh COMMIT     eine frühere Version aus der Git-Geschichte
#
# Vorhandene Dateien werden nie überschrieben – sie halten fest, wie Daten früher aussahen.
set -eu
cd "$(dirname "$0")/.."
root="$PWD"
out="$(mktemp)"
ics="$(mktemp)"
trap 'rm -f "$out" "$ics"' EXIT

if [ -n "${1:-}" ]; then
	wt="$(mktemp -d)"
	git worktree add -q --detach "$wt" "$1"
	trap 'rm -f "$out" "$ics"; git worktree remove --force "$wt"' EXIT
	ln -s "$root/node_modules" "$wt/node_modules"
	mkdir -p "$wt/scripts/db-fixture"
	cp scripts/db-fixture/generate.test.ts scripts/db-fixture/vitest.config.ts "$wt/scripts/db-fixture/"
	dir="$wt"
	commit="$(git rev-parse --short=7 "$1")"
else
	dir="$root"
	commit="$(git rev-parse --short=7 HEAD)"
	[ -z "$(git status --porcelain src/lib/db src/lib/domain)" ] || commit="$commit+lokal"
fi

(cd "$dir" && OUT="$out" OUT_ICS="$ics" pnpm exec vitest run --config scripts/db-fixture/vitest.config.ts >/dev/null)

node - "$out" "$commit" "$ics" <<'JS'
const fs = require('node:fs');
const [file, commit, icsFile] = process.argv.slice(2);

// Sync-Format: neue Datei nur, wenn es so noch keine gibt (Zeitstempel zählen nicht)
const stable = (s) =>
	s.replace(/\r?\n[ \t]/g, '').split(/\r?\n/).filter((l) => !/^(CREATED|DTSTAMP|LAST-MODIFIED):/.test(l)).join('\n');
const icsDir = 'src/lib/sync/fixtures';
const ics = fs.readFileSync(icsFile, 'utf8');
const known = fs.readdirSync(icsDir).filter((f) => f.endsWith('.ics'));
if (known.some((f) => stable(fs.readFileSync(`${icsDir}/${f}`, 'utf8')) === stable(ics))) {
	console.log('Sync-Format unverändert – keine neue .ics-Datei nötig.');
} else {
	fs.writeFileSync(`${icsDir}/ordo-${commit}.ics`, ics);
	console.log(`${icsDir}/ordo-${commit}.ics angelegt.`);
}

const d = JSON.parse(fs.readFileSync(file, 'utf8'));
const target = `src/lib/db/fixtures/v${d.verno}.json`;
if (fs.existsSync(target)) {
	console.log(`${target} gibt es schon – bleibt unverändert.`);
	process.exit(0);
}
const fixture = {
	_hinweis: `Echte Datenbank, erzeugt vom Code der Ordo-Version ${commit} (Schema v${d.verno}). Nie ändern – nur neue Dateien hinzufügen.`,
	commit,
	verno: d.verno,
	tables: d.tables
};
fs.writeFileSync(target, JSON.stringify(fixture, null, '\t') + '\n');
console.log(`${target} angelegt.`);
JS
