/**
 * Erzeugt mit dem Code einer ALTEN Ordo-Version eine typische Datenbank und schreibt
 * den rohen IndexedDB-Inhalt als JSON (für die Migrationstests der aktuellen Version).
 */
import 'fake-indexeddb/auto';
import { writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { TasksDB } from '#lib/db/db.ts';
import { createRepo } from '#lib/db/repo.ts';

it('erzeugt Daten', async () => {
	if (!process.env.OUT) return expect(1).toBe(1);
	const db = new TasksDB('fixture');
	let t = new Date(2026, 9, 1, 9, 0).getTime();
	const repo = createRepo(db, () => new Date((t += 60_000)));
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const r = repo as any;
	await r.ensureDefaults();
	const pools = await db.pools.toArray();
	const arbeit = pools.find((p) => p.name === 'Arbeit')!;
	const privat = pools.find((p) => p.name === 'Privat')!;
	const kunden = await r.createPool('Kunden');
	const kundenId = typeof kunden === 'string' ? kunden : kunden.id;

	let projectId: string | undefined;
	if (r.createProject) {
		const p = await r.createProject(arbeit.id, 'Website');
		projectId = typeof p === 'string' ? p : p.id;
	}
	const mk = async (input: Record<string, unknown>) => {
		const x = await r.createTask(input);
		return typeof x === 'string' ? x : x.id;
	};
	const a = await mk({
		poolId: arbeit.id,
		title: 'Angebot schreiben',
		priority: 1,
		...(projectId ? { projectId } : {})
	});
	const a1 = await mk({ poolId: arbeit.id, title: 'Preise prüfen', parentId: a });
	await mk({ poolId: arbeit.id, title: 'Text formulieren', parentId: a });
	await mk({ poolId: arbeit.id, title: 'Feinschliff', parentId: a1 });
	await r.updateTask(a, {
		notes: 'Für **Firma Weber**\nmit Umlauten: äöü ß €',
		due: { date: '2026-10-20' },
		scheduled: { date: '2026-10-15', time: '14:00' },
		estimateMin: 90,
		energy: 'high'
	});
	const b = await mk({ poolId: privat.id, title: 'Steuererklärung', priority: 2 });
	await r.postpone?.(b, '2026-10-10');
	const c = await mk({ poolId: privat.id, title: 'Fahrrad reparieren' });
	await r.setDone(c, true);
	const d = await mk({ poolId: 'inbox', title: 'Idee: Podcast hören' });
	await mk({ poolId: privat.id, title: 'Irgendwann: Japan', someday: true });
	const e = await mk({ poolId: kundenId, title: 'Gelöschte Aufgabe' });
	await r.deleteTask(e);
	await mk({ poolId: kundenId, title: 'Rückruf Müller', priority: 3 });
	void d;

	// Zeiten (ab v4)
	if (r.addTime) {
		await r.addTime(a, { date: '2026-10-01', minutes: 45 });
		await r.addTime(a1, { date: '2026-10-02', minutes: 30 });
	}
	if (r.setWorkDay) await r.setWorkDay('2026-10-01', 480);
	if (r.setTimeSettings) await r.setTimeSettings({ enabled: true });

	// Sync (ab v3): Konto und Zuordnung so, wie die Sync-Engine sie anlegt
	const names = db.tables.map((x) => x.name);
	if (names.includes('accounts')) {
		await db.table('accounts').add({
			id: 'acc1',
			name: 'Mein Server',
			serverUrl: 'https://dav.example.com/dav/',
			username: 'alex',
			password: 'geheim',
			homeUrl: 'https://dav.example.com/dav/alex/',
			createdAt: t
		});
		await db.pools.update(arbeit.id, {
			caldav: { accountId: 'acc1', collectionUrl: 'https://dav.example.com/dav/alex/arbeit/' }
		});
		await db
			.table('syncState')
			.put({ poolId: arbeit.id, ctag: '"c1"', syncToken: 'tok1', lastSync: t });
		await db.table('syncRecords').put({
			taskId: a,
			poolId: arbeit.id,
			url: 'https://dav.example.com/dav/alex/arbeit/a.ics',
			etag: '"e1"',
			base: { title: 'Angebot schreiben' }
		});
	}
	if (names.includes('eventRecords')) {
		await db.pools.update(arbeit.id, {
			settings: {
				...arbeit.settings,
				calendar: {
					accountId: 'acc1',
					url: 'https://dav.example.com/dav/alex/termine/',
					name: 'Termine'
				}
			}
		});
		await db.table('eventRecords').put({
			taskId: a,
			poolId: arbeit.id,
			url: 'https://dav.example.com/dav/alex/termine/ordo-a.ics',
			etag: '"v1"',
			calendarUrl: 'https://dav.example.com/dav/alex/termine/',
			accountId: 'acc1',
			hash: 'x'
		});
	}
	await r.setSetting('inboxAgingDays', 5);

	const dump: Record<string, unknown> = { verno: db.verno, tables: {} };
	for (const table of db.tables) {
		(dump.tables as Record<string, unknown>)[table.name] = {
			schema: [table.schema.primKey.src, ...table.schema.indexes.map((i) => i.src)].join(', '),
			rows: await table.toArray()
		};
	}
	writeFileSync(process.env.OUT!, JSON.stringify(dump, null, '\t') + '\n');
	expect(db.verno).toBeGreaterThan(0);
});
