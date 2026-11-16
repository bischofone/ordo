import { describe, expect, it } from 'vitest';
import { makeTask } from '#lib/domain/test-helpers.ts';
import { pickSyncFields, type SyncFields } from './fields';
import { merge3 } from './merge';

const base = pickSyncFields(makeTask({ title: 'Basis', notes: 'n', priority: 2, sortOrder: 'a1' }));
const w = (patch: Partial<SyncFields>) => ({ ...base, ...patch });

describe('Zusammenführen pro Feld', () => {
	it('unterschiedliche Felder auf beiden Seiten → beides übernommen', () => {
		const r = merge3(base, w({ title: 'Lokal' }), w({ priority: 1 }));
		expect(r.conflicts).toEqual([]);
		expect(r.merged).toMatchObject({ title: 'Lokal', priority: 1, notes: 'n' });
	});

	it('gleiche Änderung auf beiden Seiten ist kein Konflikt', () => {
		const r = merge3(base, w({ title: 'Gleich' }), w({ title: 'Gleich' }));
		expect(r.conflicts).toEqual([]);
		expect(r.merged.title).toBe('Gleich');
	});

	it('echter Konflikt: lokaler Wert bleibt, Konflikt wird gemeldet', () => {
		const r = merge3(base, w({ title: 'Handy' }), w({ title: 'PC' }));
		expect(r.merged.title).toBe('Handy');
		expect(r.conflicts).toEqual([{ field: 'title', local: 'Handy', remote: 'PC' }]);
	});

	it('Reihenfolge und Verschiebe-Zähler lösen sich selbst', () => {
		const r = merge3(
			base,
			w({ sortOrder: 'a0', postponeCount: 2 }),
			w({ sortOrder: 'a2', postponeCount: 1 })
		);
		expect(r.conflicts).toEqual([]);
		expect(r.merged).toMatchObject({ sortOrder: 'a2', postponeCount: 2 });
	});

	it('Erledigt-Zeitpunkt folgt dem Status', () => {
		const done = w({ status: 'completed', completedAt: 1000 });
		expect(merge3(base, base, done).merged).toMatchObject({
			status: 'completed',
			completedAt: 1000
		});
		expect(merge3(done, w({}), done).merged.completedAt).toBeUndefined();
	});

	it('Zeiteinträge von zwei Geräten werden zusammengeführt statt zu kollidieren', () => {
		const e = (id: string, minutes: number) => ({ id, date: '2026-11-16', minutes });
		const b = w({ timeEntries: [e('alt', 10), e('weg', 5), e('geändert', 20)] });
		const l = w({ timeEntries: [e('alt', 10), e('geändert', 20), e('handy', 30)] }); // „weg“ gelöscht
		const r = w({ timeEntries: [e('alt', 10), e('weg', 5), e('geändert', 25), e('pc', 60)] });
		const m = merge3(b, l, r);
		expect(m.conflicts).toEqual([]);
		expect(m.merged.timeEntries?.map((x) => [x.id, x.minutes])).toEqual([
			['alt', 10],
			['geändert', 25],
			['handy', 30],
			['pc', 60]
		]);
	});

	it('Datum und Listen werden inhaltlich verglichen', () => {
		const l = w({ due: { date: '2026-01-01' }, blockedBy: ['b', 'a'] });
		const r = w({ due: { date: '2026-01-01', time: undefined }, blockedBy: ['a', 'b'] });
		expect(merge3(base, l, r).conflicts).toEqual([]);
	});
});
