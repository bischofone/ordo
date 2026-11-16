import { describe, expect, it } from 'vitest';
import { makeTask } from './test-helpers';
import {
	buildReport,
	formatDuration,
	formatElapsed,
	parseDuration,
	parseTotalInput,
	periodOf,
	shiftPeriod,
	timerMinutes,
	totalsWithChildren,
	withTotal
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

describe('Gesamtzeit direkt setzen', () => {
	const e = (id: string, date: string, minutes: number) => ({ id, date, minutes });
	const today = '2026-11-18';
	const id = () => 'neu';
	const brief = (list: { date: string; minutes: number }[]) =>
		list.map((x) => `${x.date.slice(8)}:${x.minutes}`);

	it.each([
		['1:30', 20, 90],
		['0,5h', 20, 30],
		['+0:15', 20, 35],
		['+1h', 20, 80],
		['-10', 20, 10],
		['-1h', 20, 0],
		['', 20, 0],
		['0', 20, 0],
		['0:00', 20, 0]
	])('Eingabe „%s“ bei %i Minuten → %i', (input, current, total) => {
		expect(parseTotalInput(input, current)).toBe(total);
	});

	it('Unverständliches wird abgelehnt', () => {
		expect(parseTotalInput('abc', 20)).toBeNull();
		expect(parseTotalInput('+', 20)).toBeNull();
	});

	it('mehr Zeit zählt für heute', () => {
		expect(brief(withTotal([], 30, today, id))).toEqual(['18:30']);
		expect(brief(withTotal([e('a', '2026-11-16', 60)], 90, today, id))).toEqual(['16:60', '18:30']);
		// vorhandener Eintrag von heute wird erhöht statt ein zweiter angelegt
		const grown = withTotal([e('a', '2026-11-16', 60), e('b', today, 15)], 120, today, id);
		expect(grown).toEqual([e('a', '2026-11-16', 60), e('b', today, 60)]);
	});

	it('weniger Zeit wird bei heute, dann bei den jüngsten Tagen abgezogen', () => {
		const list = [e('a', '2026-11-10', 60), e('b', '2026-11-16', 45), e('c', today, 30)];
		expect(brief(withTotal(list, 120, today, id))).toEqual(['10:60', '16:45', '18:15']);
		expect(brief(withTotal(list, 90, today, id))).toEqual(['10:60', '16:30']);
		expect(brief(withTotal(list, 20, today, id))).toEqual(['10:20']);
		expect(withTotal(list, 0, today, id)).toEqual([]);
	});

	it('gleicher Wert ändert nichts; Eingangsliste bleibt unverändert', () => {
		const list = [e('a', today, 30)];
		expect(withTotal(list, 30, today, id)).toEqual(list);
		withTotal(list, 5, today, id);
		expect(list[0].minutes).toBe(30);
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
