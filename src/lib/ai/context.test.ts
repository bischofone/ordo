/**
 * Strikte Pool-Trennung: In jedem KI-Aufruf darf nichts aus einem anderen Pool stehen.
 * Fremde Pools enthalten „GEHEIM“-Markierungen; keine Anfrage darf sie enthalten –
 * auch dann nicht, wenn die Kontext-Funktionen ALLE Daten der Datenbank bekommen.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TasksDB } from '#lib/db/db.ts';
import { createRepo, INBOX_ID, type Repo } from '#lib/db/repo.ts';
import {
	assertSinglePool,
	buildInboxItemContext,
	buildPoolContext,
	buildTaskContext,
	IsolationError,
	type PoolData
} from './context';
import { breakdown, dayPlan, fromText, suggestPool, tips, weekReview } from './features';

let db: TasksDB;
let repo: Repo;
let data: PoolData;
let ids: Record<string, string>;

beforeEach(async () => {
	db = new TasksDB(`test-${crypto.randomUUID()}`);
	repo = createRepo(db, () => new Date(2026, 10, 17, 10, 0));
	await repo.ensureDefaults();
	const pools = await db.pools.toArray();
	const privat = pools.find((p) => p.name === 'Privat')!.id;
	const arbeit = pools.find((p) => p.name === 'Arbeit')!.id;

	// Arbeit: der Pool, um den es geht
	const project = await repo.createProject(arbeit, 'Website');
	const angebot = await repo.createTask({
		poolId: arbeit,
		title: 'Angebot schreiben',
		priority: 1
	});
	await repo.createTask({ poolId: arbeit, title: 'Preise prüfen', parentId: angebot });
	await repo.createTask({ poolId: arbeit, title: 'Texte schreiben', projectId: project });
	await repo.updatePoolAi(arbeit, { enabled: true, contextNotes: 'Ich bin Schreiner.' });

	// Privat: darf NIE auftauchen
	await repo.createProject(privat, 'GEHEIM-Projekt');
	const geheim = await repo.createTask({ poolId: privat, title: 'GEHEIM Arzttermin' });
	await repo.updateTask(geheim, { notes: 'GEHEIM Befund' });
	await repo.createTask({ poolId: privat, title: 'GEHEIM Kind', parentId: geheim });
	await repo.updatePoolAi(privat, { enabled: true, contextNotes: 'GEHEIM Notiz' });

	// Inbox
	const eintrag = await repo.createTask({
		poolId: INBOX_ID,
		title: 'Rechnung Schreinerei bezahlen'
	});
	await repo.createTask({ poolId: INBOX_ID, title: 'GEHEIM anderer Inbox-Eintrag' });

	data = {
		pools: await db.pools.toArray(),
		projects: await db.projects.toArray(),
		tasks: await db.tasks.toArray()
	};
	ids = { arbeit, privat, angebot, geheim, eintrag };
});
afterEach(() => db.delete());

const text = (messages: { content: string }[]) => messages.map((m) => m.content).join('\n');

describe('KI-Kontext: strikte Trennung pro Pool', () => {
	it('Pool-Kontext enthält nur den eigenen Pool', () => {
		const ctx = buildPoolContext(ids.arbeit, data);
		const all = JSON.stringify({ ...ctx, refs: [...ctx.refs] });
		expect(all).not.toContain('GEHEIM');
		expect(ctx.tasks.map((t) => t.title)).toEqual([
			'Angebot schreiben',
			'Preise prüfen',
			'Texte schreiben'
		]);
		expect(ctx.notes).toBe('Ich bin Schreiner.');
		expect(ctx.projects).toEqual(['Website']);
		// Referenzen statt IDs
		expect(ctx.refs.get('a1')).toBe(ids.angebot);
	});

	it('jede KI-Funktion: keine Daten aus anderen Pools in der Anfrage', () => {
		const pool = buildPoolContext(ids.arbeit, data, { withNotes: true });
		const task = buildTaskContext(ids.angebot, data);
		const inbox = buildInboxItemContext(ids.eintrag, data);
		const requests = [
			breakdown(task),
			tips(task),
			fromText(pool, 'Morgen Kunde anrufen', '2026-11-17'),
			dayPlan(pool, '2026-11-17', 'Dienstag'),
			weekReview(pool, '2026-11-10', '2026-11-17'),
			suggestPool(inbox)
		];
		for (const r of requests) expect(text(r.messages)).not.toContain('GEHEIM');
		expect(text(requests[0].messages)).toContain('Angebot schreiben');
		expect(text(requests[0].messages)).toContain('Preise prüfen');
	});

	it('Inbox-Eintrag: nur sein eigener Text und die Pool-Namen', () => {
		const ctx = buildInboxItemContext(ids.eintrag, data);
		expect(ctx.item.title).toBe('Rechnung Schreinerei bezahlen');
		expect(ctx.pools.sort()).toEqual(['Arbeit', 'Privat']);
		const sent = text(suggestPool(ctx).messages);
		expect(sent).not.toContain('Angebot schreiben'); // keine Aufgaben aus Pools
		expect(sent).not.toContain('Website'); // keine Projekte
		expect(sent).not.toContain('Schreiner.'); // keine Kontext-Notizen
		expect(sent).not.toContain('GEHEIM');
	});

	it('Inbox-Funktion lehnt Aufgaben aus Pools ab', () => {
		expect(() => buildInboxItemContext(ids.angebot, data)).toThrow(IsolationError);
	});

	it('Aufgaben-Kontext bleibt im Pool der Aufgabe', () => {
		const ctx = buildTaskContext(ids.geheim, data);
		expect(ctx.poolId).toBe(ids.privat);
		expect(JSON.stringify(ctx.task)).not.toContain('Angebot schreiben');
		expect(ctx.task.existingSubtasks).toEqual(['GEHEIM Kind']);
	});

	it('Prüfung schlägt an, sobald etwas Fremdes dabei ist', () => {
		expect(() =>
			assertSinglePool(ids.arbeit, [{ poolId: ids.arbeit }, { poolId: ids.privat }])
		).toThrow(IsolationError);
	});

	it('unbekannter Pool → Fehler statt leerem Kontext', () => {
		expect(() => buildPoolContext('gibt-es-nicht', data)).toThrow(IsolationError);
	});
});
