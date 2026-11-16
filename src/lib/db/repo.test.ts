import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { childrenOf, flattenTree } from '#lib/domain/tree.ts';
import { TasksDB } from './db';
import { createRepo, INBOX_ID, type Repo } from './repo';

let db: TasksDB;
let repo: Repo;
let clock = new Date(2025, 10, 12, 10, 0);

beforeEach(async () => {
	db = new TasksDB(`test-${crypto.randomUUID()}`);
	repo = createRepo(db, () => clock);
	await repo.ensureDefaults();
});
afterEach(() => db.delete());

const privat = async () => (await db.pools.toArray()).find((p) => p.name === 'Privat')!;
const live = async (poolId: string) =>
	(await db.tasks.where('poolId').equals(poolId).toArray()).filter((t) => !t.deletedAt);
const shape = async (poolId: string) => {
	const tasks = await live(poolId);
	return flattenTree(tasks, childrenOf(tasks, null)).map(
		(r) => '  '.repeat(r.depth) + r.task.title
	);
};

describe('Pools', () => {
	it('legt Inbox und Beispiel-Pools genau einmal an', async () => {
		await repo.ensureDefaults();
		const pools = await db.pools.toArray();
		expect(pools.map((p) => p.name).sort()).toEqual(['Arbeit', 'Inbox', 'Privat']);
		expect(pools.find((p) => p.id === INBOX_ID)?.kind).toBe('inbox');
	});

	it('Inbox kann nicht archiviert werden', async () => {
		await expect(repo.updatePool(INBOX_ID, { archived: true })).rejects.toThrow();
	});

	it('Archivieren behält die Aufgaben', async () => {
		const p = await privat();
		await repo.createTask({ poolId: p.id, title: 'bleibt' });
		await repo.updatePool(p.id, { archived: true });
		expect((await live(p.id)).map((t) => t.title)).toEqual(['bleibt']);
	});

	it('Reihenfolge ändern', async () => {
		const id = await repo.createPool('Projekte');
		await repo.movePool(id, -1);
		const order = (await db.pools.toArray())
			.filter((p) => p.kind === 'pool')
			.sort((a, b) => (a.sortOrder < b.sortOrder ? -1 : 1))
			.map((p) => p.name);
		expect(order).toEqual(['Privat', 'Projekte', 'Arbeit']);
	});
});

describe('Gliederung wie im Outliner', () => {
	it('Enter/Tab/Shift+Tab ergeben den erwarteten Baum', async () => {
		const { id: pid } = await privat();
		const a = await repo.createTask({ poolId: pid, title: 'Urlaub' });
		const b = await repo.createTask({ poolId: pid, title: 'Packen', afterId: a });
		await repo.indent(b);
		const c = await repo.createTask({ poolId: pid, title: 'Kleidung', afterId: b });
		await repo.indent(c);
		const d = await repo.createTask({ poolId: pid, title: 'Buchen', afterId: c });
		await repo.outdent(d);
		expect(await shape(pid)).toEqual(['Urlaub', '  Packen', '    Kleidung', '  Buchen']);
	});

	it('Einfügen vor, nach und als erstes Kind', async () => {
		const { id: pid } = await privat();
		const b = await repo.createTask({ poolId: pid, title: 'B' });
		await repo.createTask({ poolId: pid, title: 'A', beforeId: b });
		await repo.createTask({ poolId: pid, title: 'C', afterId: b });
		await repo.createTask({ poolId: pid, title: 'B2', parentId: b });
		await repo.createTask({ poolId: pid, title: 'B1', parentId: b, first: true });
		expect(await shape(pid)).toEqual(['A', 'B', '  B1', '  B2', 'C']);
	});

	it('Abhaken mit Unteraufgaben', async () => {
		const { id: pid } = await privat();
		const a = await repo.createTask({ poolId: pid, title: 'A' });
		const a1 = await repo.createTask({ poolId: pid, title: 'A1', parentId: a });
		await repo.createTask({ poolId: pid, title: 'A1a', parentId: a1 });
		expect(await repo.openDescendants(a)).toHaveLength(2);
		await repo.setDone(a, true, { withChildren: true });
		expect((await live(pid)).every((t) => t.status === 'completed')).toBe(true);
		await repo.setDone(a, false);
		expect((await db.tasks.get(a))?.status).toBe('needs-action');
		expect((await db.tasks.get(a))?.completedAt).toBeUndefined();
	});

	it('Löschen ohne Kinder: Kinder rücken nach, Rückgängig stellt wieder her', async () => {
		const { id: pid } = await privat();
		const a = await repo.createTask({ poolId: pid, title: 'A' });
		await repo.createTask({ poolId: pid, title: 'A1', parentId: a });
		await repo.createTask({ poolId: pid, title: 'A2', parentId: a });
		await repo.createTask({ poolId: pid, title: 'B' });
		const deleted = await repo.deleteTask(a);
		expect(await shape(pid)).toEqual(['A1', 'A2', 'B']);
		await repo.restoreTasks(deleted);
		expect((await shape(pid))[0]).toBe('A');
	});

	it('Löschen mit Kindern setzt Tombstones', async () => {
		const { id: pid } = await privat();
		const a = await repo.createTask({ poolId: pid, title: 'A' });
		await repo.createTask({ poolId: pid, title: 'A1', parentId: a });
		const deleted = await repo.deleteTask(a, { withChildren: true });
		expect(deleted).toHaveLength(2);
		expect(await shape(pid)).toEqual([]);
		expect(await db.tasks.count()).toBe(2); // noch für den Sync vorhanden
	});
});

describe('Inbox & Pools wechseln', () => {
	it('verschiebt eine Aufgabe samt Unterbaum', async () => {
		const { id: pid } = await privat();
		const a = await repo.createTask({ poolId: INBOX_ID, title: 'Idee' });
		await repo.createTask({ poolId: INBOX_ID, title: 'Detail', parentId: a });
		await repo.moveToPool(a, pid, { someday: true });
		expect(await live(INBOX_ID)).toHaveLength(0);
		expect(await shape(pid)).toEqual(['Idee', '  Detail']);
		expect((await db.tasks.get(a))?.someday).toBe(true);
	});
});

describe('Projekte', () => {
	it('Unteraufgaben erben das Projekt, Verschieben nimmt den Teilbaum mit', async () => {
		const { id: pid } = await privat();
		const umzug = await repo.createProject(pid, 'Umzug');
		const kisten = await repo.createTask({ poolId: pid, projectId: umzug, title: 'Kisten' });
		const kind = await repo.createTask({ poolId: pid, parentId: kisten, title: 'Kartons kaufen' });
		const danach = await repo.createTask({ poolId: pid, afterId: kisten, title: 'Danach' });
		expect((await db.tasks.get(kind))?.projectId).toBe(umzug);
		expect((await db.tasks.get(danach))?.projectId).toBe(umzug);

		const arbeit = (await db.pools.toArray()).find((p) => p.name === 'Arbeit')!;
		const web = await repo.createProject(arbeit.id, 'Website');
		await repo.moveTo(kisten, { poolId: arbeit.id, projectId: web });
		for (const id of [kisten, kind]) {
			expect(await db.tasks.get(id)).toMatchObject({ poolId: arbeit.id, projectId: web });
		}
		expect((await db.tasks.get(kisten))?.parentId).toBeNull();
	});

	it('Projekt löschen lässt die Aufgaben im Pool', async () => {
		const { id: pid } = await privat();
		const p = await repo.createProject(pid, 'Weg damit');
		const t = await repo.createTask({ poolId: pid, projectId: p, title: 'bleibt' });
		await repo.deleteProject(p);
		expect((await db.projects.get(p))?.deletedAt).toBeTruthy();
		expect((await db.tasks.get(t))?.projectId).toBeNull();
	});

	it('Reihenfolge, Farbe, Icon', async () => {
		const { id: pid } = await privat();
		const a = await repo.createProject(pid, 'A');
		const b = await repo.createProject(pid, 'B');
		await repo.moveProject(b, -1);
		const order = (await db.projects.toArray())
			.sort((x, y) => (x.sortOrder < y.sortOrder ? -1 : 1))
			.map((p) => p.name);
		expect(order).toEqual(['B', 'A']);
		await repo.updateProject(a, { color: '#000000', icon: 'star' });
		expect(await db.projects.get(a)).toMatchObject({ color: '#000000', icon: 'star' });
	});

	it('placeTask verhindert Zyklen', async () => {
		const { id: pid } = await privat();
		const a = await repo.createTask({ poolId: pid, title: 'A' });
		const a1 = await repo.createTask({ poolId: pid, parentId: a, title: 'A1' });
		const place = { poolId: pid, projectId: null, parentId: a1, sortOrder: 'a0' };
		await expect(repo.placeTask(a, place)).rejects.toThrow();
	});
});

describe('Zurückschieben', () => {
	it('zählt mit und verlangt beim 3. Mal eine Entscheidung', async () => {
		const id = await repo.createTask({ poolId: INBOX_ID, title: 'Steuer' });
		expect(await repo.postpone(id, '2025-11-13')).toBe('ok');
		expect(await repo.postpone(id, '2025-11-14')).toBe('ok');
		expect(await repo.postpone(id, '2025-11-15')).toBe('review');
		expect((await db.tasks.get(id))?.postponeCount).toBe(2);
		expect(await repo.postpone(id, '2025-11-15', { force: true })).toBe('ok');
		const t = await db.tasks.get(id);
		expect(t?.postponeCount).toBe(3);
		expect(t?.scheduled).toEqual({ date: '2025-11-15', time: undefined });
	});
});

describe('Einstellungen', () => {
	it('liefert Standardwert und speichert', async () => {
		expect(await repo.getSetting('inboxAgingDays', 7)).toBe(7);
		await repo.setSetting('inboxAgingDays', 3);
		expect(await repo.getSetting('inboxAgingDays', 7)).toBe(3);
	});
});

it('updatedAt folgt der Uhr', async () => {
	const id = await repo.createTask({ poolId: INBOX_ID, title: 'x' });
	clock = new Date(2025, 10, 13);
	await repo.updateTask(id, { title: 'y' });
	expect((await db.tasks.get(id))?.updatedAt).toBe(clock.getTime());
});
