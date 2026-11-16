/**
 * Sync-Tests mit zwei simulierten Geräten (je eine eigene Datenbank) gegen echten Radicale.
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, inject, it } from 'vitest';
import { TasksDB } from '#lib/db/db.ts';
import { createRepo, INBOX_ID } from '#lib/db/repo.ts';
import { childrenOf, flattenTree } from '#lib/domain/tree.ts';
import { createClient, fetchTransport, type Transport } from './caldav';
import { createSyncEngine } from './engine';
import { parseTodo } from './vtodo';

const serverUrl = inject('radicaleUrl');
const creds = () => ({ serverUrl, username: 'test', password: 'test' });
const dbs: TasksDB[] = [];
afterEach(async () => {
	for (const d of dbs.splice(0)) await d.delete();
});

/** Ein Gerät: eigene DB, Repository, Sync-Engine. Optional mit „Netz aus“-Schalter. */
async function device() {
	const db = new TasksDB(`dev-${crypto.randomUUID()}`);
	dbs.push(db);
	const net = { online: true };
	const transport: Transport = (req) => {
		if (!net.online) return Promise.reject(new TypeError('Failed to fetch'));
		return fetchTransport(req);
	};
	const repo = createRepo(db);
	const sync = createSyncEngine(db, { transport });
	await repo.ensureDefaults();
	const pool = async (name: string) => (await db.pools.toArray()).find((p) => p.name === name)!;
	const shape = async (poolId: string) => {
		const tasks = (await db.tasks.where('poolId').equals(poolId).toArray()).filter(
			(t) => !t.deletedAt
		);
		return flattenTree(tasks, childrenOf(tasks, null)).map(
			(r) => '  '.repeat(r.depth) + r.task.title
		);
	};
	const task = async (title: string) => (await db.tasks.toArray()).find((t) => t.title === title)!;
	return { db, repo, sync, net, pool, shape, task };
}

/** Gerät A legt Pool „Privat“ an und verbindet ihn mit einer neuen Liste; Gerät B übernimmt sie. */
async function twoDevices() {
	const a = await device();
	const b = await device();
	const accA = await a.sync.addAccount(creds());
	const privatA = await a.pool('Privat');
	const listUrl = await a.sync.bindPool(privatA.id, accA.id);
	const accB = await b.sync.addAccount(creds());
	const list = (await b.sync.remoteLists(accB.id)).find((l) => l.url === listUrl)!;
	return { a, b, accA, accB, listUrl, list, privatA };
}

describe.skipIf(!serverUrl)('Sync zwischen zwei Geräten über Radicale', () => {
	it('Aufgaben, Unteraufgaben und Projekte kommen auf dem zweiten Gerät an', async () => {
		const { a, b, accB, list, privatA } = await twoDevices();
		const umzug = await a.repo.createProject(privatA.id, 'Umzug');
		const k = await a.repo.createTask({
			poolId: privatA.id,
			projectId: umzug,
			title: 'Kisten',
			priority: 1
		});
		await a.repo.createTask({ poolId: privatA.id, parentId: k, title: 'Kartons kaufen' });
		await a.repo.createTask({
			poolId: privatA.id,
			title: 'Steuer',
			due: { date: '2026-12-01', time: '09:00' }
		});
		expect(await a.sync.syncPool(privatA.id)).toMatchObject({ pushed: 3 });

		const poolB = await b.sync.adoptList(accB.id, list);
		expect(await b.sync.syncPool(poolB)).toMatchObject({ pulled: 3, conflicts: 0 });
		expect(await b.shape(poolB)).toEqual(['Kisten', '  Kartons kaufen', 'Steuer']);
		expect(await b.task('Kisten')).toMatchObject({ priority: 1, projectId: umzug });
		expect(await b.task('Steuer')).toMatchObject({ due: { date: '2026-12-01', time: '09:00' } });
		expect((await b.db.projects.get(umzug))?.name).toBe('Umzug');
		expect((await b.db.pools.get(poolB))?.name).toBe('Privat');

		// Nochmal syncen ändert nichts (keine Echo-Schleife)
		expect(await b.sync.syncPool(poolB)).toEqual({
			pulled: 0,
			pushed: 0,
			deleted: 0,
			conflicts: 0
		});
		expect(await a.sync.syncPool(privatA.id)).toEqual({
			pulled: 0,
			pushed: 0,
			deleted: 0,
			conflicts: 0
		});
	});

	it('Änderungen an verschiedenen Feldern werden zusammengeführt', async () => {
		const { a, b, accB, list, privatA } = await twoDevices();
		const id = await a.repo.createTask({ poolId: privatA.id, title: 'Bericht' });
		await a.sync.syncPool(privatA.id);
		const poolB = await b.sync.adoptList(accB.id, list);
		await b.sync.syncPool(poolB);

		await a.repo.updateTask(id, { title: 'Bericht final' });
		await b.repo.updateTask(id, { priority: 2, notes: 'vom Handy' });
		await a.sync.syncPool(privatA.id);
		expect(await b.sync.syncPool(poolB)).toMatchObject({ conflicts: 0, pushed: 1 });
		await a.sync.syncPool(privatA.id);

		for (const d of [a, b]) {
			expect(await d.db.tasks.get(id)).toMatchObject({
				title: 'Bericht final',
				priority: 2,
				notes: 'vom Handy'
			});
		}
	});

	it('echter Konflikt wird angezeigt und nach der Entscheidung hochgeladen', async () => {
		const { a, b, accB, list, privatA } = await twoDevices();
		const id = await a.repo.createTask({ poolId: privatA.id, title: 'Original' });
		await a.sync.syncPool(privatA.id);
		const poolB = await b.sync.adoptList(accB.id, list);
		await b.sync.syncPool(poolB);

		await a.repo.updateTask(id, { title: 'Vom PC' });
		await b.repo.updateTask(id, { title: 'Vom Handy' });
		await a.sync.syncPool(privatA.id);
		expect(await b.sync.syncPool(poolB)).toMatchObject({ conflicts: 1, pushed: 0 });

		const [c] = await b.db.conflicts.toArray();
		expect(c).toMatchObject({ field: 'title', local: 'Vom Handy', remote: 'Vom PC' });
		// Solange der Konflikt offen ist, bleibt der Server unverändert
		await b.sync.syncPool(poolB);
		await a.sync.syncPool(privatA.id);
		expect((await a.db.tasks.get(id))?.title).toBe('Vom PC');

		await b.sync.resolveConflict(c.id, 'local');
		expect(await b.db.conflicts.count()).toBe(0);
		expect(await b.sync.syncPool(poolB)).toMatchObject({ pushed: 1 });
		await a.sync.syncPool(privatA.id);
		expect((await a.db.tasks.get(id))?.title).toBe('Vom Handy');
	});

	it('Löschen wird übertragen – außer die andere Seite hat inzwischen geändert', async () => {
		const { a, b, accB, list, privatA } = await twoDevices();
		const weg = await a.repo.createTask({ poolId: privatA.id, title: 'Weg' });
		const bleibt = await a.repo.createTask({ poolId: privatA.id, title: 'Bleibt' });
		await a.sync.syncPool(privatA.id);
		const poolB = await b.sync.adoptList(accB.id, list);
		await b.sync.syncPool(poolB);

		await a.repo.deleteTask(weg);
		await a.repo.deleteTask(bleibt);
		await b.repo.updateTask(bleibt, { title: 'Bleibt (geändert)' });
		expect(await a.sync.syncPool(privatA.id)).toMatchObject({ deleted: 2 });
		expect(await a.db.tasks.count()).toBe(0); // Tombstones aufgeräumt

		await b.sync.syncPool(poolB);
		expect(await b.shape(poolB)).toEqual(['Bleibt (geändert)']);
		await a.sync.syncPool(privatA.id);
		expect(await a.shape(privatA.id)).toEqual(['Bleibt (geändert)']);
	});

	it('offline: Änderungen warten und gehen später raus', async () => {
		const { a, privatA } = await twoDevices();
		await a.sync.syncPool(privatA.id);
		a.net.online = false;
		await a.repo.createTask({ poolId: privatA.id, title: 'Im Zug notiert' });
		await expect(a.sync.syncPool(privatA.id)).rejects.toThrow();
		expect((await a.db.syncState.get(privatA.id))?.lastError).toContain('nicht erreichbar');

		a.net.online = true;
		expect(await a.sync.syncPool(privatA.id)).toMatchObject({ pushed: 1 });
		expect((await a.db.syncState.get(privatA.id))?.lastError).toBeUndefined();
	});

	it('Aufgaben anderer Programme (z. B. Tasks.org) behalten ihre Zusatzdaten', async () => {
		const { a, listUrl, privatA } = await twoDevices();
		const client = createClient(creds());
		const url = `${listUrl}fremd.ics`;
		await client.putItem(
			url,
			`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:fremd\r\nBEGIN:VTODO\r\nUID:fremd-1\r\nSUMMARY:Von Tasks.org\r\nCATEGORIES:Haushalt\r\nX-FREMD:bleibt\r\nX-APPLE-SORT-ORDER:5\r\nBEGIN:VALARM\r\nTRIGGER:-PT10M\r\nACTION:DISPLAY\r\nEND:VALARM\r\nEND:VTODO\r\nEND:VCALENDAR\r\n`,
			{ create: true }
		);
		await a.sync.syncPool(privatA.id);
		const t = await a.task('Von Tasks.org');
		expect(t.sortOrder).toBeTruthy();

		await a.repo.updateTask(t.id, { title: 'Von Tasks.org (bearbeitet)' });
		await a.sync.syncPool(privatA.id);
		const [item] = await client.fetchItems(listUrl, [url]);
		expect(item.ics).toContain('CATEGORIES:Haushalt');
		expect(item.ics).toContain('X-FREMD:bleibt');
		expect(item.ics).toContain('BEGIN:VALARM');
		expect(parseTodo(item.ics).fields.title).toBe('Von Tasks.org (bearbeitet)');
	});

	it('Verschieben in einen anderen verbundenen Pool', async () => {
		const { a, accA, listUrl, privatA } = await twoDevices();
		const arbeit = await a.pool('Arbeit');
		const arbeitUrl = await a.sync.bindPool(arbeit.id, accA.id);
		const id = await a.repo.createTask({ poolId: privatA.id, title: 'Wandert' });
		await a.repo.createTask({ poolId: privatA.id, parentId: id, title: 'Kind' });
		await a.sync.syncAll();

		await a.repo.moveToPool(id, arbeit.id);
		await a.sync.syncAll();
		const client = createClient(creds());
		expect(await client.listItems(listUrl)).toHaveLength(0);
		expect(await client.listItems(arbeitUrl)).toHaveLength(2);
		expect(await a.shape(arbeit.id)).toEqual(['Wandert', '  Kind']);
	});

	it('kaputter sync-token → vollständiger Abgleich; Name und Farbe der Liste', async () => {
		const { a, b, accB, list, privatA } = await twoDevices();
		await a.repo.createTask({ poolId: privatA.id, title: 'Eins' });
		await a.sync.syncPool(privatA.id);
		const poolB = await b.sync.adoptList(accB.id, list);
		await b.sync.syncPool(poolB);

		await b.db.syncState.update(poolB, { syncToken: 'http://radicale.org/ns/sync/kaputt' });
		await a.repo.createTask({ poolId: privatA.id, title: 'Zwei' });
		await a.repo.updatePool(privatA.id, { name: 'Zuhause', color: '#e5484d' });
		await a.sync.syncPool(privatA.id);

		expect(await b.sync.syncPool(poolB)).toMatchObject({ pulled: 1 });
		expect(await b.shape(poolB)).toEqual(['Eins', 'Zwei']);
		expect(await b.db.pools.get(poolB)).toMatchObject({ name: 'Zuhause', color: '#e5484d' });
	});

	it('Inbox lässt sich ebenfalls verbinden', async () => {
		const a = await device();
		const acc = await a.sync.addAccount(creds());
		await a.sync.bindPool(INBOX_ID, acc.id);
		await a.repo.createTask({ poolId: INBOX_ID, title: 'Idee' });
		expect(await a.sync.syncPool(INBOX_ID)).toMatchObject({ pushed: 1 });
	});
});
