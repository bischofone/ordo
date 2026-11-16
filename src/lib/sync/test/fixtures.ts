import { makeTask } from '#lib/domain/test-helpers.ts';
import { pickSyncFields, type SyncFields } from '../fields';

/** Aufgabe, bei der jedes synchronisierte Feld gesetzt ist. */
export const full = (): SyncFields =>
	pickSyncFields(
		makeTask({
			title: 'Steuer, Teil 2; mit Sonderzeichen ä ö ü – „ok“',
			notes: 'Zeile 1\nZeile 2, mit Komma',
			priority: 2,
			due: { date: '2026-12-15', time: '09:30' },
			scheduled: { date: '2026-12-01' },
			rrule: 'FREQ=WEEKLY;BYDAY=MO,FR',
			status: 'completed',
			completedAt: Date.UTC(2026, 10, 16, 8, 0),
			parentId: 'eltern-uid',
			blockedBy: ['b-uid', 'a-uid'],
			sortOrder: 'a0V',
			projectId: 'proj-1',
			someday: true,
			postponeCount: 3,
			estimateMin: 45,
			energy: 'low',
			waitingFor: {
				type: 'mail',
				text: 'Antwort von Bank, bitte',
				followUp: { date: '2026-12-03' }
			},
			timeEntries: [
				{
					id: 'z2',
					date: '2026-11-16',
					minutes: 45,
					note: 'Telefonat; mit Komma, und "Anführung"'
				},
				{ id: 'z1', date: '2026-11-15', minutes: 30 }
			]
		})
	);
