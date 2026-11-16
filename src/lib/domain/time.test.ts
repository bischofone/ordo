import { describe, expect, it } from 'vitest';
import { makeTask } from './test-helpers';
import {
	buildReport,
	formatDuration,
	formatElapsed,
	parseDuration,
	periodOf,
	shiftPeriod,
	timerMinutes,
	totalsWithChildren
} from './time';

describe('Zeitangaben verstehen', () => {
	it.each([
		['0:30', 30],
		['1:15', 75],
		['2:5', 125],
		['0,5h', 30],
		['0.5 h', 30],
		['1,25h', 75],
		['2 Std', 120],
		['1 stunde', 60],
		['30m', 30],
		['45 min', 45],
		['90 Minuten', 90],
		['1h 30m', 90],
		['1h30', 90],
		['1 h 5 min', 65],
		['0,5', 30],
		['1.5', 90],
		['30', 30],
		['90', 90],
		['  0:45  ', 45]
	])('„%s“ → %i Minuten', (input, minutes) => {
		expect(parseDuration(input)).toBe(minutes);
	});

	it.each(['', 'abc', '0', '0:00', '1:75', '-1h', '25h', '1h 30x', '1:2:3'])(
		'„%s“ wird nicht angenommen',
		(input) => {
			expect(parseDuration(input)).toBeNull();
		}
	);

	it('zeigt Dauern als Stunden:Minuten', () => {
		expect([5, 30, 60, 90, 605].map(formatDuration)).toEqual([
			'0:05',
			'0:30',
			'1:00',
			'1:30',
			'10:05'
		]);
		expect(formatElapsed(3_725_000)).toBe('1:02:05');
	});

	it('Timer: unter 30 Sekunden verworfen, sonst auf Minuten gerundet (mindestens 1)', () => {
		expect(timerMinutes(0, 29_000)).toBeNull();
		expect(timerMinutes(0, 31_000)).toBe(1);
		expect(timerMinutes(0, 89_000)).toBe(1);
		expect(timerMinutes(0, 91_000)).toBe(2);
		expect(timerMinutes(0, 3_600_000)).toBe(60);
	});
});

describe('Summen und Auswertung', () => {
	const e = (date: string, minutes: number) => ({ id: `${date}-${minutes}`, date, minutes });
	const tasks = [
		makeTask({ id: 'a', poolId: 'privat', timeEntries: [e('2026-11-16', 30)] }),
		makeTask({
			id: 'a1',
			poolId: 'privat',
			parentId: 'a',
			timeEntries: [e('2026-11-16', 15), e('2026-11-18', 45)]
		}),
		makeTask({ id: 'a1x', poolId: 'privat', parentId: 'a1', timeEntries: [e('2026-11-10', 60)] }),
		makeTask({
			id: 'b',
			poolId: 'arbeit',
			projectId: 'web',
			timeEntries: [e('2026-11-17', 120), e('2026-12-01', 10)]
		}),
		makeTask({ id: 'weg', poolId: 'arbeit', deletedAt: 1, timeEntries: [e('2026-11-17', 999)] }),
		makeTask({ id: 'leer', poolId: 'arbeit' })
	];

	it('Summe je Aufgabe schließt Unteraufgaben ein', () => {
		const t = totalsWithChildren(tasks);
		expect(t.get('a')).toBe(30 + 15 + 45 + 60);
		expect(t.get('a1')).toBe(15 + 45 + 60);
		expect(t.get('a1x')).toBe(60);
		expect(t.get('leer')).toBe(0);
	});

	it('Woche: Montag bis Sonntag mit Kalenderwoche', () => {
		const p = periodOf('week', '2026-11-18');
		expect(p).toMatchObject({ from: '2026-11-16', to: '2026-11-22' });
		expect(p.label).toBe('KW 47 · 16.11.–22.11.2026');
		expect(p.days).toHaveLength(7);
		expect(periodOf('month', '2026-02-10')).toMatchObject({ from: '2026-02-01', to: '2026-02-28' });
		expect(periodOf('day', '2026-11-18')).toMatchObject({ from: '2026-11-18', to: '2026-11-18' });
	});

	it('vor und zurück blättern', () => {
		expect(shiftPeriod('day', '2026-11-01', -1)).toBe('2026-10-31');
		expect(shiftPeriod('week', '2026-12-30', 1)).toBe('2027-01-06');
		expect(shiftPeriod('month', '2026-01-31', 1)).toBe('2026-02-28');
	});

	it('Auswertung einer Woche: gesamt, je Tag, je Pool/Projekt, je Aufgabe', () => {
		const r = buildReport(tasks, periodOf('week', '2026-11-18'));
		expect(r.total).toBe(30 + 15 + 45 + 120);
		expect(r.byDay.map((d) => d.minutes)).toEqual([45, 120, 45, 0, 0, 0, 0]);
		expect(r.byGroup).toEqual([
			{ poolId: 'arbeit', projectId: 'web', minutes: 120 },
			{ poolId: 'privat', projectId: null, minutes: 90 }
		]);
		expect(r.byTask.map((t) => [t.task.id, t.minutes])).toEqual([
			['b', 120],
			['a1', 60],
			['a', 30]
		]);
		expect(r.entries[0].date).toBe('2026-11-18');
		// gelöschte Aufgaben zählen nicht
		expect(r.entries.some((x) => x.task.id === 'weg')).toBe(false);
	});

	it('Filter nach Pool', () => {
		const r = buildReport(tasks, periodOf('week', '2026-11-18'), ['privat']);
		expect(r.total).toBe(90);
		expect(r.byGroup).toHaveLength(1);
	});
});
