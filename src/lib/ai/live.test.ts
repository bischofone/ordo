/**
 * Echter Test gegen OpenRouter – läuft NUR mit gesetztem Schlüssel, sonst übersprungen
 * (also nie in GitHub Actions und nie aus Versehen). Kostet pro Lauf etwa 0,1 Cent.
 *
 *   OPENROUTER_API_KEY=sk-or-… pnpm exec vitest run src/lib/ai/live.test.ts
 */
import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TasksDB } from '#lib/db/db.ts';
import { createRepo, INBOX_ID } from '#lib/db/repo.ts';
import {
	buildInboxItemContext,
	buildPoolContext,
	buildTaskContext,
	type PoolData
} from './context';
import {
	breakdown,
	dayPlan,
	fromText,
	suggestPool,
	tips,
	weekReview,
	type Feature
} from './features';
import { createOpenRouter } from './openrouter';

const key = process.env.OPENROUTER_API_KEY ?? '';
const MODELS = [
	process.env.ORDO_AI_MODEL ?? 'z-ai/glm-5.3-flash',
	'mistralai/mistral-small-3.2-24b-instruct'
];

describe.skipIf(!key)('KI live (OpenRouter)', () => {
	const db = new TasksDB(`live-${crypto.randomUUID()}`);
	const repo = createRepo(db, () => new Date(2026, 10, 17, 9, 0));
	const or = createOpenRouter({ apiKey: key, title: 'Ordo (Tests)' });
	let data: PoolData;
	let arbeit = '';
	let angebot = '';
	let eintrag = '';
	let total = 0;

	async function ask<T>(f: Feature<T>) {
		const r = await or.chat({
			models: MODELS,
			messages: f.messages,
			schema: f.schema,
			maxTokens: f.maxTokens,
			temperature: f.temperature
		});
		total += r.cost;
		if (process.env.DEBUG_AI) console.log('ROH', r.model, r.content, JSON.stringify(f.messages));
		return f.parse(r.content);
	}

	beforeAll(async () => {
		await repo.ensureDefaults();
		arbeit = (await db.pools.toArray()).find((p) => p.name === 'Arbeit')!.id;
		await repo.updatePoolAi(arbeit, {
			enabled: true,
			contextNotes: 'Ich bin selbstständiger Schreiner.'
		});
		angebot = await repo.createTask({
			poolId: arbeit,
			title: 'Angebot für Einbauküche Familie Weber',
			priority: 1
		});
		await repo.createTask({ poolId: arbeit, title: 'Holz bestellen', due: { date: '2026-11-18' } });
		await repo.createTask({ poolId: arbeit, title: 'Werkstatt aufräumen' });
		const done = await repo.createTask({ poolId: arbeit, title: 'Rechnung Müller geschrieben' });
		await repo.updateTask(done, { status: 'completed', completedAt: Date.now() });
		eintrag = await repo.createTask({
			poolId: INBOX_ID,
			title: 'Kostenvoranschlag für Kunden Schmidt nachfassen'
		});
		data = {
			pools: await db.pools.toArray(),
			projects: await db.projects.toArray(),
			tasks: await db.tasks.toArray()
		};
	});
	afterAll(async () => {
		console.log(`KI live: Kosten zusammen ${(total * 100).toFixed(4)} Cent`);
		await db.delete();
	});

	it('zerlegt eine Aufgabe', { timeout: 60_000 }, async () => {
		const tree = await ask(breakdown(buildTaskContext(angebot, data)));
		console.log('Zerlegen:', JSON.stringify(tree));
		expect(tree.length).toBeGreaterThanOrEqual(2);
	});

	it('gibt Tipps', { timeout: 60_000 }, async () => {
		const text = await ask(tips(buildTaskContext(angebot, data)));
		console.log('Tipps:', text);
		expect(text.length).toBeGreaterThan(40);
	});

	it('macht aus Freitext Aufgaben', { timeout: 60_000 }, async () => {
		const tree = await ask(
			fromText(
				buildPoolContext(arbeit, data),
				'Herr Weber hat angerufen: Er will bis Freitag wissen, ob Eiche oder Buche günstiger ist. Außerdem muss ich nächste Woche den TÜV für den Transporter machen und Schleifpapier nachkaufen.',
				'2026-11-17'
			)
		);
		console.log('Freitext:', JSON.stringify(tree));
		expect(tree.length).toBeGreaterThanOrEqual(2);
	});

	it('schlägt einen Tagesplan vor (nur mit echten Aufgaben)', { timeout: 60_000 }, async () => {
		const ctx = buildPoolContext(arbeit, data);
		const plan = await ask(dayPlan(ctx, '2026-11-17', 'Dienstag'));
		console.log('Tagesplan:', JSON.stringify(plan));
		expect(plan.items.length).toBeGreaterThan(0);
		for (const i of plan.items) expect([...ctx.refs.values()]).toContain(i.taskId);
		// Zum Einplanen: Dauer und Priorität je Punkt
		expect(plan.items.some((i) => i.estimateMin !== null)).toBe(true);
		for (const i of plan.items) expect([1, 2, 3, null]).toContain(i.priority);
	});

	it('schreibt einen Wochenrückblick', { timeout: 60_000 }, async () => {
		const ctx = buildPoolContext(arbeit, data, { include: () => true });
		const text = await ask(weekReview(ctx, '2026-11-10', '2026-11-17'));
		console.log('Rückblick:', text);
		expect(text.length).toBeGreaterThan(40);
	});

	it('schlägt für einen Inbox-Eintrag einen Pool vor', { timeout: 60_000 }, async () => {
		const s = await ask(suggestPool(buildInboxItemContext(eintrag, data)));
		console.log('Pool-Vorschlag:', JSON.stringify(s));
		expect(s.pool).toBe('Arbeit');
	});
});
