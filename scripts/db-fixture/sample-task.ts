/**
 * Beispiel-Aufgabe mit allen synchronisierten Feldern – für die Sync-Format-Testdaten
 * (scripts/db-fixture.sh) und den Wächter-Test in src/lib/sync/formats.test.ts.
 * Nie ändern: Sonst passen die vorhandenen Testdaten nicht mehr dazu.
 */
import type { SyncFields } from '#lib/sync/fields.ts';

export const SAMPLE_UID = 'aufgabe-1';

export const SAMPLE_FIELDS: SyncFields = {
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
