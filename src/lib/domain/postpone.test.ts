import { describe, expect, it } from 'vitest';
import { isLater, needsPostponeReview, postponeOptions, postponePatch } from './postpone';
import { makeTask } from './test-helpers';
import { isAged, sectionRoots } from './views';

const now = new Date(2025, 10, 12, 14, 30); // Mi, 12.11.2025

describe('Zurückschieben', () => {
	it('Schnellauswahl: morgen, nächster Montag, Monatserster', () => {
		expect(postponeOptions(now).map((o) => o.date)).toEqual([
			'2025-11-13',
			'2025-11-17',
			'2025-12-01'
		]);
	});

	it('über Jahresgrenzen', () => {
		const silvester = new Date(2025, 11, 31);
		expect(postponeOptions(silvester).map((o) => o.date)).toEqual([
			'2026-01-01',
			'2026-01-05',
			'2026-01-01'
		]);
	});

	it('setzt das geplante Datum, behält die Uhrzeit und zählt hoch', () => {
		const t = makeTask({ scheduled: { date: '2025-11-12', time: '09:00' }, postponeCount: 1 });
		expect(postponePatch(t, '2025-11-20')).toEqual({
			scheduled: { date: '2025-11-20', time: '09:00' },
			postponeCount: 2
		});
	});

	it('fragt beim 3. Mal nach', () => {
		expect(needsPostponeReview({ postponeCount: 0 })).toBe(false);
		expect(needsPostponeReview({ postponeCount: 1 })).toBe(false);
		expect(needsPostponeReview({ postponeCount: 2 })).toBe(true);
		expect(needsPostponeReview({ postponeCount: 5 })).toBe(true);
	});

	it('„Später“ = geplantes Datum nach heute', () => {
		expect(isLater({ scheduled: { date: '2025-11-13' } }, now)).toBe(true);
		expect(isLater({ scheduled: { date: '2025-11-12' } }, now)).toBe(false);
		expect(isLater({}, now)).toBe(false);
	});
});

describe('Bereiche eines Pools', () => {
	it('teilt Wurzeln ein, Unteraufgaben bleiben beim Elternteil', () => {
		const tasks = [
			makeTask({ id: 'aktiv', sortOrder: 'a1' }),
			makeTask({ id: 'kind', parentId: 'aktiv', scheduled: { date: '2026-01-01' } }),
			makeTask({ id: 'spaeter2', scheduled: { date: '2025-12-01' } }),
			makeTask({ id: 'spaeter1', scheduled: { date: '2025-11-20' } }),
			makeTask({ id: 'idee', someday: true }),
			makeTask({ id: 'erledigt', status: 'completed', completedAt: 5 }),
			makeTask({ id: 'weg', deletedAt: 1 })
		];
		const s = sectionRoots(tasks, now);
		expect(s.active.map((t) => t.id)).toEqual(['aktiv']);
		expect(s.later.map((t) => t.id)).toEqual(['spaeter1', 'spaeter2']);
		expect(s.someday.map((t) => t.id)).toEqual(['idee']);
		expect(s.done.map((t) => t.id)).toEqual(['erledigt']);
	});
});

describe('Inbox altert', () => {
	it('markiert Einträge, die länger als 7 Tage liegen', () => {
		const day = 24 * 3600 * 1000;
		expect(isAged({ createdAt: now.getTime() - 7 * day }, now)).toBe(false);
		expect(isAged({ createdAt: now.getTime() - 8 * day }, now)).toBe(true);
		expect(isAged({ createdAt: now.getTime() - 3 * day }, now, 2)).toBe(true);
	});
});
