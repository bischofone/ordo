/**
 * Bestehende Daten bleiben bei jedem Update nutzbar.
 *
 * In fixtures/ liegt für JEDE frühere Datenbank-Version eine echte Datenbank, erzeugt vom Code
 * der damaligen Ordo-Version (scripts/db-fixture.sh). Jede wird hier mit der aktuellen Version
 * geöffnet: Nichts darf verloren gehen, alles muss gültig sein und richtig angezeigt werden.
 *
 * Neue Schema-Version? Dann schlägt „neueste Version hat Testdaten“ fehl, bis mit
 * `scripts/db-fixture.sh` die Testdaten der neuen Version dazugelegt sind.
 */
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { readdirSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { buildToday } from '#lib/domain/today.ts';
import { childrenOf, flattenTree } from '#lib/domain/tree.ts';
import { entryMinutes } from '#lib/domain/time.ts';
import type { Task } from '#lib/domain/types.ts';
import { sectionRoots } from '#lib/domain/views.ts';
import { pickSyncFields } from '#lib/sync/fields.ts';
import { parseTodo, writeTodo } from '#lib/sync/vtodo.ts';
import { TasksDB } from './db';
import { checkIntegrity } from './integrity';
import { createRepo, INBOX_ID } from './repo';

interface Fixture {
	commit: string;
	verno: number;
	tables: Record<string, { schema: string; rows: Record<string, unknown>[] }>;
}

const DIR = new URL('./fixtures/', import.meta.url);
const fixtures = readdirSync(DIR)
	.filter((f) => /^v\d+\.json$/.test(f))
	.map((f) => JSON.parse(readFileSync(new URL(f, DIR), 'utf8')) as Fixture)
	.sort((a, b) => a.verno - b.verno);

/** Legt die alte Datenbank genau so an, wie die alte Version sie hinterlassen hat. */
async function restore(name: string, fx: Fixture) {
	const old = new Dexie(name);
	old
		.version(fx.verno)
		.stores(Object.fromEntries(Object.entries(fx.tables).map(([k, v]) => [k, v.schema])));
	await old.open();
	for (const [table, { rows }] of Object.entries(fx.tables)) await old.table(table).bulkAdd(rows);
	old.close();
}

const open: TasksDB[] = [];
afterEach(async () => {
	for (const db of open.splice(0)) await db.delete();
});

async function upgraded(fx: Fixture) {
	const name = `migration-${fx.verno}-${crypto.randomUUID()}`;
	await restore(name, fx);
	const db = new TasksDB(name);
	open.push(db);
	await db.open();
	return db;
}

const rows = (fx: Fixture, table: string) => fx.tables[table]?.rows ?? [];
const title = (fx: Fixture, t: string) =>
	rows(fx, 'tasks').find((r) => r.title === t) as unknown as Task;

it('für jede Datenbank-Version gibt es Testdaten (lückenlos ab v1)', () => {
	expect(fixtures.map((f) => f.verno)).toEqual(fixtures.map((_, i) => i + 1));
});

it('neueste Version hat Testdaten – sonst: scripts/db-fixture.sh ausführen', async () => {
	const db = new TasksDB(`schema-${crypto.randomUUID()}`);
	open.push(db);
	await db.open();
	const newest = fixtures.at(-1)!;
	expect(
		db.verno,
		`Datenbank-Version ${db.verno} hat noch keine Testdaten (src/lib/db/fixtures/v${db.verno}.json).`
	).toBe(newest.verno);
	// Gleiche Version, aber anderes Schema = Schema geändert ohne neue Version
	const schema = Object.fromEntries(
		db.tables.map((t) => [
			t.name,
			[t.schema.primKey.src, ...t.schema.indexes.map((i) => i.src)].join(', ')
		])
	);
	const fixtureSchema = Object.fromEntries(
		Object.entries(newest.tables).map(([k, v]) => [k, v.schema])
	);
	expect(schema, 'Schema geändert ohne neue Versionsnummer in db.ts').toEqual(fixtureSchema);
});

describe.each(fixtures.map((f) => [`v${f.verno} (${f.commit})`, f] as const))(
	'Daten aus %s',
	(_, fx) => {
		it('öffnet ohne Fehler und verliert nichts', async () => {
			const db = await upgraded(fx);
			expect(db.verno).toBe(fixtures.at(-1)!.verno);
			for (const [table, { rows: before }] of Object.entries(fx.tables)) {
				if (!db.tables.some((t) => t.name === table)) {
					// Nur Tabellen, die bewusst entfallen sind und leer waren
					expect(before, `Tabelle ${table} entfällt, hatte aber Daten`).toEqual([]);
					continue;
				}
				expect(await db.table(table).count(), `Tabelle ${table}`).toBe(before.length);
			}
			// Jede Aufgabe ist noch da – mit denselben Inhalten
			for (const old of rows(fx, 'tasks')) {
				const now = (await db.tasks.get(old.id as string))!;
				for (const [k, v] of Object.entries(old))
					expect(now[k as keyof Task], `${old.title}: ${k}`).toEqual(v);
			}
		});

		it('alle Daten sind gültig', async () => {
			const db = await upgraded(fx);
			const problems = checkIntegrity({
				pools: await db.pools.toArray(),
				projects: await db.projects.toArray(),
				tasks: await db.tasks.toArray(),
				accounts: await db.accounts.toArray(),
				workDays: await db.workDays.toArray()
			});
			expect(problems).toEqual([]);
		});

		it('wird richtig angezeigt (Pool-Baum, Inbox, Heute, Zeiten)', async () => {
			const db = await upgraded(fx);
			const tasks = (await db.tasks.toArray()).filter((t) => !t.deletedAt);
			const pools = await db.pools.toArray();
			const arbeit = pools.find((p) => p.name === 'Arbeit')!;

			// Baum im Pool Arbeit: Hauptaufgabe mit Unteraufgaben in der richtigen Ordnung
			const inArbeit = tasks.filter((t) => t.poolId === arbeit.id);
			const tree = flattenTree(inArbeit, childrenOf(inArbeit, null)).map(
				(r) => '  '.repeat(r.depth) + r.task.title
			);
			expect(tree).toEqual([
				'Angebot schreiben',
				'  Preise prüfen',
				'    Feinschliff',
				'  Text formulieren'
			]);

			// Inbox und Abschnitte
			const inbox = tasks.filter((t) => t.poolId === INBOX_ID);
			expect(inbox.map((t) => t.title)).toEqual(['Idee: Podcast hören']);
			const privat = tasks.filter((t) => t.poolId === pools.find((p) => p.name === 'Privat')!.id);
			const sections = sectionRoots(privat, new Date(2026, 9, 12));
			expect(Object.values(sections).flat().length).toBeGreaterThan(0);

			// Heute (15.10.): die geplante Aufgabe steht drin
			const today = buildToday(tasks, new Date(2026, 9, 15, 8));
			expect(today.today.map((i) => i.task.title)).toContain('Angebot schreiben');

			// Felder der Hauptaufgabe
			const a = tasks.find((t) => t.title === 'Angebot schreiben')!;
			expect(a.notes).toContain('äöü ß €');
			expect(a.priority).toBe(1);
			expect(a.scheduled).toEqual({ date: '2026-10-15', time: '14:00' });
			expect(a.projectId === null || typeof a.projectId === 'string').toBe(true);
			if (fx.verno >= 4) expect(entryMinutes(a.timeEntries)).toBe(45);
			else expect(entryMinutes(a.timeEntries)).toBe(0);

			// Gelöschte Aufgabe bleibt gelöscht, erledigte bleibt erledigt
			expect(tasks.some((t) => t.title === 'Gelöschte Aufgabe')).toBe(false);
			expect(tasks.find((t) => t.title === 'Fahrrad reparieren')!.status).toBe('completed');
		});

		it('lässt sich weiter bearbeiten und synchronisieren', async () => {
			const db = await upgraded(fx);
			const repo = createRepo(db);
			const a = title(fx, 'Angebot schreiben');
			await repo.updateTask(a.id, { title: 'Angebot schreiben (neu)' });
			const childId = await repo.createTask({
				poolId: a.poolId,
				title: 'Neu dazu',
				parentId: a.id
			});
			await repo.setTimeTotal(a.id, 60);
			const now = (await db.tasks.get(a.id))!;
			expect(now.title).toBe('Angebot schreiben (neu)');
			expect(entryMinutes(now.timeEntries)).toBe(60);
			expect((await db.tasks.get(childId))!.parentId).toBe(a.id);
			// Als VTODO schreiben und wieder lesen ergibt dieselben Felder
			const back = parseTodo(writeTodo(now.id, pickSyncFields(now)));
			expect(back.fields.title).toBe('Angebot schreiben (neu)');
			expect(back.fields.scheduled).toEqual(now.scheduled);
			expect(entryMinutes(back.fields.timeEntries)).toBe(60);
		});

		if (fx.tables.accounts) {
			it('Sync-Konto und Zuordnungen bleiben erhalten', async () => {
				const db = await upgraded(fx);
				const acc = (await db.accounts.get('acc1'))!;
				expect(acc.password).toBe('geheim');
				const arbeit = (await db.pools.toArray()).find((p) => p.name === 'Arbeit')!;
				expect(arbeit.caldav?.accountId).toBe('acc1');
				expect(await db.syncRecords.count()).toBe(1);
			});
		}
	}
);
