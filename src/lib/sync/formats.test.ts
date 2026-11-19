/**
 * Aufgaben, die frühere Ordo-Versionen auf den CalDAV-Server geschrieben haben, liest die
 * aktuelle Version vollständig und richtig. In fixtures/ liegt je Format-Stand eine echte
 * Datei, erzeugt vom Code der damaligen Version. Nie ändern – nur neue hinzufügen.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { entryMinutes } from '#lib/domain/time.ts';
import { parseTodo, writeTodo } from './vtodo';

const DIR = new URL('./fixtures/', import.meta.url);
const files = readdirSync(DIR).filter((f) => f.endsWith('.ics'));

it('es gibt Format-Testdaten', () => {
	expect(files.length).toBeGreaterThanOrEqual(3);
});

describe.each(files)('%s', (file) => {
	const ics = readFileSync(new URL(file, DIR), 'utf8');
	const { uid, fields } = parseTodo(ics);
	const hasTime = /X-MYTASKS-TIME/.test(ics);

	it('liest alle Felder richtig', () => {
		expect(uid).toBe('aufgabe-1');
		expect(fields.title).toBe('Angebot schreiben');
		expect(fields.notes).toBe('Für **Firma Weber**\nmit Umlauten: äöü ß €, Komma; Semikolon');
		expect(fields.priority).toBe(1);
		expect(fields.due).toEqual({ date: '2026-10-20' });
		expect(fields.scheduled).toEqual({ date: '2026-10-15', time: '14:00' });
		expect(fields.status).toBe('in-process');
		expect(fields.parentId).toBe('eltern-1');
		expect(fields.blockedBy).toEqual(['andere-2']);
		expect(fields.sortOrder).toBe('a3');
		expect(fields.projectId).toBe('projekt-1');
		expect(fields.postponeCount).toBe(2);
		expect(fields.estimateMin).toBe(90);
		expect(fields.energy).toBe('high');
		expect(fields.waitingFor).toEqual({
			type: 'mail',
			text: 'Antwort von Weber',
			followUp: { date: '2026-10-18' }
		});
		expect(entryMinutes(fields.timeEntries)).toBe(hasTime ? 45 : 0);
	});

	it('erneut geschrieben bleibt alles erhalten (auch Unbekanntes)', () => {
		const again = writeTodo(uid, fields, { previous: ics });
		expect(parseTodo(again).fields).toEqual(fields);
	});
});

it('das aktuelle Format hat Testdaten – sonst: scripts/db-fixture.sh ausführen', async () => {
	// Ändert sich, was Ordo auf den Server schreibt, braucht es Testdaten im neuen Format –
	// damit künftige Versionen beweisen, dass sie auch diese Aufgaben noch richtig lesen.
	const { SAMPLE_FIELDS, SAMPLE_UID } = await import('../../../scripts/db-fixture/sample-task.ts');
	const stable = (s: string) =>
		s
			.replace(/\r?\n[ \t]/g, '')
			.split(/\r?\n/)
			.filter((l) => !/^(CREATED|DTSTAMP|LAST-MODIFIED):/.test(l))
			.join('\n');
	const now = stable(writeTodo(SAMPLE_UID, SAMPLE_FIELDS));
	const known = files.map((f) => stable(readFileSync(new URL(f, DIR), 'utf8')));
	expect(known, 'Sync-Format hat sich geändert: scripts/db-fixture.sh legt Testdaten an').toContain(
		now
	);
});
