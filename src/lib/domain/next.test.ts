import { describe, expect, it } from 'vitest';
import { exclusion, explain, scoreTask, suggestNext } from './next';
import { buildToday, buildWeek } from './today';
import type { Task } from './types';

// Dienstag, 17.11.2026, 10:00
const now = new Date(2026, 10, 17, 10, 0);
const day = (offset: number) => {
	const d = new Date(2026, 10, 17 + offset);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
let n = 0;
function task(patch: Partial<Task> = {}): Task {
	n++;
	return {
		id: `t${n}`,
		poolId: 'p',
		projectId: null,
		parentId: null,
		sortOrder: `a${n}`,
		title: `Aufgabe ${n}`,
		notes: '',
		priority: null,
		status: 'needs-action',
		someday: false,
		postponeCount: 0,
		blockedBy: [],
		collapsed: false,
		createdAt: now.getTime(),
		updatedAt: now.getTime(),
		...patch
	};
}

describe('Was als Nächstes?', () => {
	it('Fälligkeit und Priorität zählen, mit Begründung', () => {
		const a = task({ title: 'Morgen fällig, !1', priority: 1, due: { date: day(1) } });
		const b = task({ title: 'Nächste Woche', due: { date: day(6) } });
		const c = task({ title: 'Ohne alles' });
		const out = suggestNext([c, b, a], { now });
		expect(out.map((s) => s.task.title)).toEqual([
			'Morgen fällig, !1',
			'Nächste Woche',
			'Ohne alles'
		]);
		expect(explain(out[0])).toBe('Priorität 1 · morgen fällig');
	});

	it('überfällig schlägt alles andere, je länger desto mehr', () => {
		const old = task({ due: { date: day(-5) } });
		const fresh = task({ due: { date: day(-1) } });
		const p1 = task({ priority: 1 });
		expect(suggestNext([p1, fresh, old], { now }).map((s) => s.task.id)).toEqual([
			old.id,
			fresh.id,
			p1.id
		]);
		expect(explain(scoreTask(old, { now }))).toBe('seit 5 Tagen überfällig');
	});

	it('nicht vorgeschlagen: erledigt, irgendwann, später, blockiert, wartet, hat offene Unteraufgaben', () => {
		const parent = task();
		const child = task({ parentId: parent.id });
		const blocker = task();
		const all = [
			task({ status: 'completed' }),
			task({ someday: true }),
			task({ scheduled: { date: day(2) } }),
			task({ blockedBy: [blocker.id] }),
			task({ waitingFor: { type: 'mail', text: 'Antwort' } }),
			parent,
			child,
			blocker
		];
		const reasons = all.map((t) => exclusion(t, all, { now }));
		expect(reasons).toEqual([
			'done',
			'someday',
			'later',
			'blocked',
			'waiting',
			'parent',
			null,
			null
		]);
		// Unteraufgabe einer „Irgendwann“-Aufgabe ebenfalls nicht
		const sd = task({ someday: true });
		const sdChild = task({ parentId: sd.id });
		expect(exclusion(sdChild, [sd, sdChild], { now })).toBe('someday');
	});

	it('verfügbare Zeit: zu Langes fällt raus, Schnelles wird bevorzugt', () => {
		const long = task({ estimateMin: 120 });
		const quick = task({ estimateMin: 10 });
		const medium = task({ estimateMin: 25 });
		expect(exclusion(long, [long], { now, minutes: 30 })).toBe('too-long');
		const out = suggestNext([long, medium, quick], { now, minutes: 30 });
		expect(out.map((s) => s.task.id)).toEqual([quick.id, medium.id]);
		expect(explain(out[0])).toBe('schnell erledigt');
	});

	it('Energie: Passendes nach oben, Anstrengendes bei wenig Energie nach unten', () => {
		const hard = task({ energy: 'high', priority: 3 });
		const easy = task({ energy: 'low' });
		const out = suggestNext([hard, easy], { now, energy: 'low' });
		expect(out[0].task.id).toBe(easy.id);
		expect(scoreTask(hard, { now, energy: 'low' }).reasons.map((r) => r.text)).toContain(
			'braucht mehr Energie'
		);
	});

	it('Gewichtungen: 0 schaltet einen Grund ab, 2 verdoppelt ihn', () => {
		const t = task({ priority: 1, due: { date: day(1) } });
		expect(scoreTask(t, { now }).score).toBe(55);
		expect(scoreTask(t, { now, weights: { priority: 0 } }).score).toBe(25);
		expect(scoreTask(t, { now, weights: { due: 2 } }).score).toBe(80);
		expect(explain(scoreTask(t, { now, weights: { priority: 0 } }))).toBe('morgen fällig');
	});

	it('geplant, alt und oft verschoben', () => {
		const t = task({
			scheduled: { date: day(0) },
			postponeCount: 3,
			createdAt: new Date(2026, 10, 1).getTime()
		});
		expect(explain(t && scoreTask(t, { now }), 5)).toBe(
			'für heute geplant · 3× verschoben · seit 16 Tagen offen'
		);
	});
});

describe('Heute', () => {
	it('geplant, heute fällig, liegen geblieben, überfällig, heute erledigt', () => {
		const tasks = [
			task({ title: 'Heute geplant', scheduled: { date: day(0) }, estimateMin: 30 }),
			task({ title: 'Heute fällig', due: { date: day(0), time: '09:00' }, estimateMin: 15 }),
			task({ title: 'Von gestern', scheduled: { date: day(-1) } }),
			task({ title: 'Überfällig', due: { date: day(-2) } }),
			task({ title: 'Morgen', scheduled: { date: day(1) } }),
			task({ title: 'Irgendwann', scheduled: { date: day(0) }, someday: true }),
			task({ title: 'Erledigt', status: 'completed', completedAt: now.getTime() - 3600_000 })
		];
		const v = buildToday(tasks, now);
		expect(v.today.map((i) => i.task.title)).toEqual([
			'Heute fällig',
			'Heute geplant',
			'Von gestern'
		]);
		expect(v.today[2].carriedOver).toBe(1);
		expect(v.overdue.map((i) => i.task.title)).toEqual(['Überfällig']);
		expect(v.done.map((t) => t.title)).toEqual(['Erledigt']);
		expect(v.estimate).toBe(45);
		expect(v.unestimated).toBe(1);
		expect(v.count).toBe(3);
	});

	it('überfällig und für heute eingeplant: zählt in Summe und Anzahl mit', () => {
		const t = task({ due: { date: day(-2) }, scheduled: { date: day(0) }, estimateMin: 20 });
		const v = buildToday([t], now);
		expect(v.overdue).toHaveLength(1);
		expect(v.count).toBe(1);
		expect(v.estimate).toBe(20);
	});

	it('Unteraufgaben zeigen ihren Pfad', () => {
		const parent = task({ title: 'Umzug' });
		const child = task({ title: 'Kartons', parentId: parent.id, scheduled: { date: day(0) } });
		expect(buildToday([parent, child], now).today[0].path).toEqual(['Umzug']);
	});
});

describe('Wochenrückblick', () => {
	it('erledigt, verschoben, Zeit und Neues je Pool in den letzten 7 Tagen', () => {
		const tasks = [
			task({ poolId: 'a', status: 'completed', completedAt: new Date(2026, 10, 12).getTime() }),
			task({ poolId: 'a', status: 'completed', completedAt: new Date(2026, 10, 1).getTime() }),
			task({ poolId: 'a', postponeCount: 2, createdAt: new Date(2026, 9, 1).getTime() }),
			task({
				poolId: 'b',
				timeEntries: [
					{ id: 'e1', date: day(-1), minutes: 30 },
					{ id: 'e2', date: day(-10), minutes: 60 }
				]
			})
		];
		const w = buildWeek(tasks, now);
		expect(w.from).toBe('2026-11-11');
		const a = w.pools.find((p) => p.poolId === 'a')!;
		const b = w.pools.find((p) => p.poolId === 'b')!;
		expect(a.done).toHaveLength(1);
		expect(a.postponed).toHaveLength(1);
		expect(a.created).toBe(2);
		expect(b.minutes).toBe(30);
	});
});
