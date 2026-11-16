import { describe, expect, it } from 'vitest';
import { makeTask } from '#lib/domain/test-helpers.ts';
import { normalize, pickSyncFields, type SyncFields } from './fields';
import { parseTodo, priorityFromIcal, sortKeyToNumber, writeTodo } from './vtodo';

const full = (): SyncFields =>
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
			}
		})
	);

/** So ähnlich legt Tasks.org (via DAVx⁵) Aufgaben an. */
const TASKS_ORG = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:+//IDN tasks.org//android-130804//EN
BEGIN:VTIMEZONE
TZID:Europe/Berlin
BEGIN:STANDARD
DTSTART:19701025T030000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
TZNAME:CET
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:19700329T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
TZNAME:CEST
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VTODO
DTSTAMP:20261115T100000Z
UID:7151795196203917322
CREATED:20261115T095900Z
LAST-MODIFIED:20261115T100000Z
SUMMARY:Einkaufen
DESCRIPTION:Milch\\nBrot
PRIORITY:1
STATUS:NEEDS-ACTION
DUE;TZID=Europe/Berlin:20261120T183000
CATEGORIES:Haushalt,Wichtig
X-APPLE-SORT-ORDER:1234
X-TASKS-ORG-SOMETHING:geheim
RELATED-TO:parent-123
RELATED-TO;RELTYPE=SIBLING:geschwister-9
BEGIN:VALARM
TRIGGER;RELATED=END:-PT15M
ACTION:DISPLAY
DESCRIPTION:Default Tasks.org description
END:VALARM
END:VTODO
END:VCALENDAR
`;

describe('VTODO-Mapping', () => {
	it('Hin- und Rückweg ohne Datenverlust (alle Felder)', () => {
		const f = full();
		const ics = writeTodo('uid-1', f);
		const back = parseTodo(ics);
		expect(back.uid).toBe('uid-1');
		expect(back.fields).toEqual(normalize(f));
		expect(back.hasOwnSort).toBe(true);
		// Zweiter Durchgang ist stabil
		expect(parseTodo(writeTodo('uid-1', back.fields, { previous: ics })).fields).toEqual(
			back.fields
		);
	});

	it('schreibt Standard-Eigenschaften, die andere Clients verstehen', () => {
		const ics = writeTodo('uid-1', full());
		expect(ics).toContain('SUMMARY:Steuer\\, Teil 2\\; mit Sonderzeichen');
		expect(ics).toContain('PRIORITY:5');
		expect(ics).toContain('DUE:20261215T093000');
		expect(ics).toContain('DTSTART;VALUE=DATE:20261201');
		expect(ics).toContain('STATUS:COMPLETED');
		expect(ics).toContain('COMPLETED:20261116T080000Z');
		expect(ics).toContain('RELATED-TO:eltern-uid');
		expect(ics).toContain('RELATED-TO;RELTYPE=DEPENDS-ON:a-uid');
		expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,FR');
		expect(ics).toMatch(/X-APPLE-SORT-ORDER:\d+/);
	});

	it('liest Aufgaben von Tasks.org (Zeitzone, Priorität, Elternteil)', () => {
		const p = parseTodo(TASKS_ORG);
		expect(p.uid).toBe('7151795196203917322');
		expect(p.fields).toMatchObject({
			title: 'Einkaufen',
			notes: 'Milch\nBrot',
			priority: 1,
			due: { date: '2026-11-20', time: '18:30' },
			status: 'needs-action',
			parentId: 'parent-123',
			projectId: null,
			someday: false
		});
		expect(p.hasOwnSort).toBe(false);
		expect(p.appleSort).toBe(1234);
	});

	it('verwirft beim Ändern nichts von anderen Clients', () => {
		const before = parseTodo(TASKS_ORG).fields;
		const after = {
			...before,
			title: 'Einkaufen (erledigt)',
			status: 'completed' as const,
			completedAt: 1
		};
		const ics = writeTodo('7151795196203917322', after, { previous: TASKS_ORG, base: before });

		expect(ics).toContain('CATEGORIES:Haushalt,Wichtig');
		expect(ics).toContain('X-TASKS-ORG-SOMETHING:geheim');
		expect(ics).toContain('BEGIN:VALARM');
		expect(ics).toContain('TRIGGER;RELATED=END:-PT15M');
		expect(ics).toContain('RELATED-TO;RELTYPE=SIBLING:geschwister-9');
		expect(ics).toContain('BEGIN:VTIMEZONE');
		// Unverändertes Fälligkeitsdatum behält seine Zeitzone
		expect(ics).toContain('DUE;TZID=Europe/Berlin:20261120T183000');
		// Unveränderte Sortierung anderer Apps bleibt
		expect(ics).toContain('X-APPLE-SORT-ORDER:1234');
		expect(ics).not.toContain('X-MYTASKS-SORT');
		expect(parseTodo(ics).fields.title).toBe('Einkaufen (erledigt)');
	});

	it('Wiederöffnen entfernt COMPLETED und 100 %', () => {
		const done = TASKS_ORG.replace(
			'STATUS:NEEDS-ACTION',
			'STATUS:COMPLETED\nCOMPLETED:20261115T110000Z\nPERCENT-COMPLETE:100'
		);
		const base = parseTodo(done).fields;
		expect(base.status).toBe('completed');
		const ics = writeTodo(
			'x',
			{ ...base, status: 'needs-action', completedAt: undefined },
			{ previous: done, base }
		);
		expect(ics).not.toContain('COMPLETED:');
		expect(ics).not.toContain('PERCENT-COMPLETE');
		expect(ics).toContain('STATUS:NEEDS-ACTION');
	});

	it('Priorität 1–9 nach RFC wird auf 1/2/3 abgebildet', () => {
		expect([0, 1, 4, 5, 6, 9].map(priorityFromIcal)).toEqual([null, 1, 1, 2, 3, 3]);
	});

	it('Sortierschlüssel bleiben als Zahl in der Reihenfolge', () => {
		const keys = ['a0', 'a0V', 'a1', 'a1G', 'aZ', 'b00'];
		const nums = keys.map(sortKeyToNumber);
		expect([...nums].sort((a, b) => a - b)).toEqual(nums);
		expect(new Set(nums).size).toBe(keys.length);
	});
});
