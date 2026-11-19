/**
 * Für scripts/db-fixture.sh: schreibt die Beispiel-Aufgabe im VTODO-Format dieser Version.
 * Feldsatz inline (nicht aus sample-task.ts), damit es auch mit alten Versionen läuft.
 */
import { writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { writeTodo } from '#lib/sync/vtodo.ts';

it('schreibt die Beispiel-Aufgabe', () => {
	if (!process.env.OUT_ICS) return expect(1).toBe(1);
	const fields = {
		title: 'Angebot schreiben',
		notes: 'Für **Firma Weber**\nmit Umlauten: äöü ß €, Komma; Semikolon',
		priority: 1,
		due: { date: '2026-10-20' },
		scheduled: { date: '2026-10-15', time: '14:00' },
		rrule: undefined,
		status: 'in-process',
		completedAt: undefined,
		parentId: 'eltern-1',
		blockedBy: ['andere-2'],
		sortOrder: 'a3',
		projectId: 'projekt-1',
		someday: false,
		postponeCount: 2,
		estimateMin: 90,
		energy: 'high',
		waitingFor: { type: 'mail', text: 'Antwort von Weber', followUp: { date: '2026-10-18' } },
		timeEntries: [{ id: 'z1', date: '2026-10-01', minutes: 45, note: 'Entwurf' }]
	};
	writeFileSync(process.env.OUT_ICS, writeTodo('aufgabe-1', fields as never));
	expect(1).toBe(1);
});
