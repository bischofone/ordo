/**
 * KI in der App: Einstellungen (pro Gerät), Kosten pro Tag und der eine Weg, die KI aufzurufen.
 *
 * `runPoolAi` / `runTaskAi` / `runInboxAi` laden aus der Datenbank nur die Daten des einen Pools
 * (bzw. des einen Inbox-Eintrags) und bauen den Kontext über ai/context.ts – dort wird die
 * Pool-Trennung zusätzlich geprüft. Der API-Schlüssel bleibt auf dem Gerät.
 */
import { liveQuery } from 'dexie';
import { format } from 'date-fns';
import {
	buildInboxItemContext,
	buildPoolContext,
	buildTaskContext,
	type PoolContext,
	type PoolData
} from '#lib/ai/context.ts';
import {
	breakdown,
	dayPlan,
	fromText,
	tips,
	weekReview,
	type DayPlan,
	type Feature,
	type SuggestedTask
} from '#lib/ai/features.ts';
import { m } from '#lib/i18n/index.ts';
import { de } from 'date-fns/locale';
import { subDays } from 'date-fns';
import { isDone, type Pool } from '#lib/domain/types.ts';
import { addSuggestedTasks } from './actions';
import { toast } from './ui.svelte';
import { AiError, createOpenRouter, type FetchLike, type OpenRouter } from '#lib/ai/openrouter.ts';
import type { Task } from '#lib/domain/types.ts';
import { db, repo } from './app';

export const AI_SETTINGS_KEY = 'aiSettings';
export const AI_USAGE_KEY = 'aiUsage';

/** Empfohlene Modelle – günstig, gut auf Deutsch, liefern verlässlich JSON (Stand Nov. 2026) */
export const AI_MODELS = [
	{
		id: 'z-ai/glm-5.3-flash',
		label: 'GLM 5.3 Flash',
		note: 'empfohlen · sehr gut, ~0,01 ct je Aufruf'
	},
	{
		id: 'mistralai/mistral-small-3.2-24b-instruct',
		label: 'Mistral Small 3.2',
		note: 'solide Alternative · ~0,01 ct'
	},
	{
		id: 'google/gemini-3.5-flash-lite',
		label: 'Gemini 3.5 Flash Lite',
		note: 'schnell · ~0,02 ct'
	},
	{ id: 'mistralai/mistral-nemo', label: 'Mistral Nemo', note: 'am billigsten · einfacher' }
] as const;

export interface AiSettings {
	apiKey: string;
	model: string;
	/** Ersatz, falls das Hauptmodell gerade nicht verfügbar ist */
	fallbackModel: string;
	/** Höchstens so viel pro Tag (US-Cent) – danach keine Aufrufe mehr bis morgen */
	dailyLimitCents: number;
	/** Nur Anbieter, die Eingaben weder speichern noch zum Training nutzen */
	privateOnly: boolean;
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
	apiKey: '',
	model: 'z-ai/glm-5.3-flash',
	fallbackModel: 'mistralai/mistral-small-3.2-24b-instruct',
	dailyLimitCents: 5,
	privateOnly: true
};

export interface AiUsage {
	/** 'YYYY-MM-DD' */
	date: string;
	/** US-Dollar */
	cost: number;
	calls: number;
}

class AiState {
	settings = $state.raw<AiSettings>(DEFAULT_AI_SETTINGS);
	usage = $state.raw<AiUsage>({ date: '', cost: 0, calls: 0 });
	loaded = $state(false);

	/** Kosten heute in Cent */
	get todayCents() {
		return this.usage.date === today() ? this.usage.cost * 100 : 0;
	}
	get todayCalls() {
		return this.usage.date === today() ? this.usage.calls : 0;
	}
	get ready() {
		return !!this.settings.apiKey.trim();
	}
}
export const ai = new AiState();

const today = () => format(Date.now(), 'yyyy-MM-dd');

/** Für Tests: eigene HTTP-Schicht statt echtem Netz */
export const aiTransport: { fetch?: FetchLike } = {};

export function watchAi() {
	const sub = liveQuery(() => db.settings.bulkGet([AI_SETTINGS_KEY, AI_USAGE_KEY])).subscribe(
		([s, u]) => {
			ai.settings = { ...DEFAULT_AI_SETTINGS, ...(s?.value as Partial<AiSettings> | undefined) };
			ai.usage = (u?.value as AiUsage | undefined) ?? { date: '', cost: 0, calls: 0 };
			ai.loaded = true;
		}
	);
	return () => sub.unsubscribe();
}

export async function saveAiSettings(patch: Partial<AiSettings>) {
	const current = await repo.getSetting<Partial<AiSettings>>(AI_SETTINGS_KEY, {});
	await repo.setSetting(AI_SETTINGS_KEY, { ...DEFAULT_AI_SETTINGS, ...current, ...patch });
}

async function settings(): Promise<AiSettings> {
	return {
		...DEFAULT_AI_SETTINGS,
		...(await repo.getSetting<Partial<AiSettings>>(AI_SETTINGS_KEY, {}))
	};
}

function client(apiKey: string): OpenRouter {
	return createOpenRouter({ apiKey, fetch: aiTransport.fetch });
}

async function recordCost(cost: number) {
	const d = today();
	const u = await repo.getSetting<AiUsage>(AI_USAGE_KEY, { date: d, cost: 0, calls: 0 });
	const base = u.date === d ? u : { date: d, cost: 0, calls: 0 };
	await repo.setSetting(AI_USAGE_KEY, { date: d, cost: base.cost + cost, calls: base.calls + 1 });
}

export interface AiOutcome<T> {
	value: T;
	/** US-Cent */
	cents: number;
	model: string;
}

/** Ein Aufruf: Schlüssel, Freigabe des Pools und Tageslimit prüfen, fragen, Kosten verbuchen. */
async function run<T>(poolId: string, feature: Feature<T>): Promise<AiOutcome<T>> {
	const s = await settings();
	if (!s.apiKey.trim()) throw new AiError('Noch kein API-Schlüssel – Einstellungen → KI.', 'key');
	const pool = await db.pools.get(poolId);
	if (!pool?.settings.ai.enabled)
		throw new AiError('Die KI ist für diesen Bereich ausgeschaltet.', 'disabled');
	const u = await repo.getSetting<AiUsage>(AI_USAGE_KEY, { date: '', cost: 0, calls: 0 });
	if (u.date === today() && u.cost * 100 >= s.dailyLimitCents)
		throw new AiError(
			`Das Tageslimit von ${s.dailyLimitCents} Cent ist erreicht. Morgen geht es weiter (oder Limit in den Einstellungen erhöhen).`,
			'limit'
		);

	const models = [...new Set([pool.settings.ai.model || s.model, s.fallbackModel].filter(Boolean))];
	const result = await client(s.apiKey.trim()).chat({
		models,
		messages: feature.messages,
		schema: feature.schema,
		maxTokens: feature.maxTokens,
		temperature: feature.temperature,
		privateOnly: s.privateOnly
	});
	await recordCost(result.cost);
	return { value: feature.parse(result.content), cents: result.cost * 100, model: result.model };
}

/** Lädt ausschließlich die Daten eines Pools (plus Pool-Liste für Namen). */
async function loadPool(poolId: string): Promise<PoolData> {
	const [pools, projects, tasks] = await Promise.all([
		db.pools.toArray(),
		db.projects.where('poolId').equals(poolId).toArray(),
		db.tasks.where('poolId').equals(poolId).toArray()
	]);
	return { pools, projects, tasks };
}

/** KI-Funktion mit dem Kontext eines ganzen Pools */
export async function runPoolAi<T>(
	poolId: string,
	make: (ctx: PoolContext) => Feature<T>,
	opts: Parameters<typeof buildPoolContext>[2] = {}
) {
	const ctx = buildPoolContext(poolId, await loadPool(poolId), opts);
	return run(poolId, make(ctx));
}

/** KI-Funktion für eine einzelne Aufgabe (sieht sie, ihre Unteraufgaben und ihren Pool) */
export async function runTaskAi<T>(
	task: Task,
	make: (ctx: ReturnType<typeof buildTaskContext>) => Feature<T>
) {
	const ctx = buildTaskContext(task.id, await loadPool(task.poolId));
	return run(task.poolId, make(ctx));
}

/** KI-Funktion für einen Inbox-Eintrag (sieht nur diesen Eintrag und die Pool-Namen) */
export async function runInboxAi<T>(
	task: Task,
	make: (ctx: ReturnType<typeof buildInboxItemContext>) => Feature<T>
) {
	const ctx = buildInboxItemContext(task.id, await loadPool(task.poolId));
	return run(task.poolId, make(ctx));
}

/** Schlüssel prüfen (kostenlos) */
export async function checkKey(apiKey: string) {
	return client(apiKey.trim()).keyInfo();
}

// ---------- KI-Fenster ----------

/** Was das KI-Fenster anzeigt */
export type AiView =
	| { kind: 'tree'; value: SuggestedTask[] }
	| { kind: 'text'; value: string }
	| { kind: 'plan'; value: DayPlan };

export interface AiPanelRequest {
	title: string;
	/** Worum es geht (z. B. Aufgabentitel oder Pool) */
	subtitle?: string;
	/** Erst eine Eingabe abfragen (z. B. Freitext) */
	input?: { label: string; placeholder: string };
	run: (input: string) => Promise<AiOutcome<AiView>>;
	/** Übernehmen: bekommt den (ggf. bearbeiteten) Vorschlag */
	apply?: (view: AiView) => Promise<void> | void;
	/** Beschriftung für Text-Vorschläge (z. B. „In Notizen übernehmen“) */
	applyLabel?: string;
}

export const aiPanel = $state<{ req: AiPanelRequest | null }>({ req: null });

export function openAiPanel(req: AiPanelRequest) {
	aiPanel.req = req;
}

/** Name eines Modells für die Anzeige */
export function modelLabel(id: string) {
	return AI_MODELS.find((m) => id.startsWith(m.id))?.label ?? id.split('/').pop() ?? id;
}

// ---------- Die Knöpfe ----------

const wrap = <T, K extends AiView['kind']>(kind: K, p: Promise<AiOutcome<T>>) =>
	p.then((o) => ({ ...o, value: { kind, value: o.value } as AiView }));

/** Aufgabe in Unteraufgaben zerlegen → Vorschläge darunter anlegen */
export function aiBreakdown(task: Task) {
	openAiPanel({
		title: m.ai.breakdownTitle,
		subtitle: task.title,
		run: () => wrap('tree', runTaskAi(task, breakdown)),
		apply: async (v) => {
			if (v.kind === 'tree')
				await addSuggestedTasks(
					{ poolId: task.poolId, projectId: task.projectId, parentId: task.id },
					v.value
				);
		}
	});
}

/** Tipps zu einer Aufgabe → auf Wunsch an die Notizen anhängen */
export function aiTips(task: Task) {
	openAiPanel({
		title: m.ai.tipsTitle,
		subtitle: task.title,
		run: () => wrap('text', runTaskAi(task, tips)),
		applyLabel: m.ai.toNotes,
		apply: async (v) => {
			if (v.kind !== 'text') return;
			const current = (await db.tasks.get(task.id))?.notes.trim() ?? '';
			await repo.updateTask(task.id, {
				notes: current ? `${current}\n\n${v.value}` : v.value
			});
			toast(m.ai.notesAdded);
		}
	});
}

/** Freitext → Aufgaben im Pool (oder Projekt) */
export function aiFromText(pool: Pool, projectId: string | null = null) {
	openAiPanel({
		title: m.ai.fromTextTitle,
		subtitle: pool.name,
		input: { label: m.ai.fromTextLabel, placeholder: m.ai.fromTextPlaceholder },
		run: (text) =>
			wrap(
				'tree',
				runPoolAi(pool.id, (ctx) => fromText(ctx, text, format(Date.now(), 'yyyy-MM-dd')), {
					include: () => false
				})
			),
		apply: async (v) => {
			if (v.kind === 'tree') await addSuggestedTasks({ poolId: pool.id, projectId }, v.value);
		}
	});
}

/** Tagesplan für einen Pool (nur Anzeige – ein Klick öffnet die Aufgabe) */
export function aiDayPlan(pool: Pool) {
	const now = Date.now();
	openAiPanel({
		title: m.ai.dayPlanTitle,
		subtitle: pool.name,
		run: () =>
			wrap(
				'plan',
				runPoolAi(
					pool.id,
					(ctx) => dayPlan(ctx, format(now, 'yyyy-MM-dd'), format(now, 'EEEE', { locale: de })),
					{ include: (t) => !isDone(t) && !t.someday }
				)
			)
	});
}

/** Wochenrückblick für einen Pool: erledigt in den letzten 7 Tagen + offen */
export function aiWeekReview(pool: Pool) {
	const now = Date.now();
	const from = subDays(now, 7);
	openAiPanel({
		title: m.ai.weekReviewTitle,
		subtitle: pool.name,
		run: () =>
			wrap(
				'text',
				runPoolAi(
					pool.id,
					(ctx) => weekReview(ctx, format(from, 'yyyy-MM-dd'), format(now, 'yyyy-MM-dd')),
					{
						include: (t) => (isDone(t) ? (t.completedAt ?? 0) >= from.getTime() : !t.someday)
					}
				)
			)
	});
}
