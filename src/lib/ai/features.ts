/**
 * Die KI-Funktionen von Ordo: Anweisungen (Prompts), Antwortformate (JSON-Schema) und
 * das Prüfen der Antworten. Reine Logik – bekommt fertige Kontexte aus context.ts,
 * spricht nicht selbst mit der Datenbank oder dem Netz.
 *
 * Alles, was die KI liefert, ist ein Vorschlag. Die Oberfläche zeigt ihn zur Prüfung an;
 * übernommen wird erst auf Knopfdruck.
 */
import type { ChatMessage, ResponseSchema } from './openrouter';
import { AiError, parseJson } from './openrouter';
import type { buildInboxItemContext, buildTaskContext, PoolContext } from './context';

/** Vorgeschlagene Aufgabe (mit Unteraufgaben) */
export interface SuggestedTask {
	title: string;
	notes?: string;
	priority?: 1 | 2 | 3;
	/** 'YYYY-MM-DD' */
	due?: string;
	children: SuggestedTask[];
}

export interface DayPlanItem {
	taskId: string;
	title: string;
	reason: string;
	/** Geschätzte Dauer (vorhandene Schätzung der Aufgabe, sonst Vorschlag der KI) */
	estimateMin: number | null;
	/** Priorität der Aufgabe, sonst Vorschlag der KI */
	priority: 1 | 2 | 3 | null;
	/** Uhrzeit beim Einplanen ('HH:mm'); fehlt = ganztägig */
	time?: string;
}

export interface DayPlan {
	summary: string;
	items: DayPlanItem[];
}

export interface PoolSuggestion {
	pool: string | null;
	reason: string;
}

type TaskContext = ReturnType<typeof buildTaskContext>;
type InboxContext = ReturnType<typeof buildInboxItemContext>;

const SYSTEM = [
	'Du bist der Assistent in der Aufgaben-App „Ordo“.',
	'Antworte immer auf Deutsch, knapp, konkret und praktisch.',
	'Aufgabentitel sind kurze Handlungen (z. B. „Angebote vergleichen“), keine ganzen Sätze, ohne Nummerierung.',
	'Erfinde keine Fakten über die Person. Nutze nur, was im Kontext steht.'
].join(' ');

const poolHeader = (ctx: Pick<PoolContext, 'pool' | 'notes' | 'projects'>) =>
	[
		`Bereich: ${ctx.pool}`,
		ctx.notes ? `Über mich (für diesen Bereich): ${ctx.notes}` : '',
		ctx.projects.length ? `Projekte: ${ctx.projects.join(', ')}` : ''
	]
		.filter(Boolean)
		.join('\n');

const taskLine = (t: PoolContext['tasks'][number]) =>
	[
		`${'  '.repeat(t.depth)}- [${t.ref}] ${t.title}`,
		t.project ? `(Projekt: ${t.project})` : '',
		t.priority ? `!${t.priority}` : '',
		t.due ? `fällig ${t.due}` : '',
		t.scheduled ? `geplant ${t.scheduled}` : '',
		t.done ? `erledigt${t.completed ? ` ${t.completed}` : ''}` : '',
		t.postponed ? `${t.postponed}× verschoben` : '',
		t.minutes ? `${t.minutes} min erfasst` : '',
		t.estimate ? `geschätzt ${t.estimate} min` : ''
	]
		.filter(Boolean)
		.join(' ');

// ---------- Schemas ----------

const taskNode = (depth: number): Record<string, unknown> => ({
	type: 'object',
	additionalProperties: false,
	required: depth > 0 ? ['title', 'children'] : ['title'],
	properties: {
		title: { type: 'string' },
		...(depth > 0 ? { children: { type: 'array', items: taskNode(depth - 1) } } : {})
	}
});

const TREE_SCHEMA: ResponseSchema = {
	name: 'aufgaben',
	schema: {
		type: 'object',
		additionalProperties: false,
		required: ['tasks'],
		properties: { tasks: { type: 'array', items: taskNode(2) } }
	}
};

const FREETEXT_SCHEMA: ResponseSchema = {
	name: 'aufgaben',
	schema: {
		type: 'object',
		additionalProperties: false,
		required: ['tasks'],
		properties: {
			tasks: {
				type: 'array',
				items: {
					type: 'object',
					additionalProperties: false,
					required: ['title', 'priority', 'due', 'children'],
					properties: {
						title: { type: 'string' },
						priority: { type: ['integer', 'null'], enum: [1, 2, 3, null] },
						due: { type: ['string', 'null'], description: 'YYYY-MM-DD oder null' },
						children: { type: 'array', items: taskNode(1) }
					}
				}
			}
		}
	}
};

const PLAN_SCHEMA: ResponseSchema = {
	name: 'tagesplan',
	schema: {
		type: 'object',
		additionalProperties: false,
		required: ['summary', 'items'],
		properties: {
			summary: { type: 'string' },
			items: {
				type: 'array',
				items: {
					type: 'object',
					additionalProperties: false,
					required: ['ref', 'reason', 'minutes', 'priority'],
					properties: {
						ref: { type: 'string' },
						reason: { type: 'string' },
						minutes: { type: 'integer' },
						priority: { type: 'integer' }
					}
				}
			}
		}
	}
};

/** Nur einer der vorhandenen Pool-Namen ist erlaubt (oder null) */
const poolSchema = (pools: string[]): ResponseSchema => ({
	name: 'pool',
	schema: {
		type: 'object',
		additionalProperties: false,
		required: ['pool', 'reason'],
		properties: {
			pool: { type: ['string', 'null'], enum: [...pools, null] },
			reason: { type: 'string' }
		}
	}
});

// ---------- Antworten prüfen ----------

const clean = (s: unknown) =>
	String(s ?? '')
		.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 200);

/** Baum aus der Antwort lesen: leere Titel raus, Tiefe und Anzahl begrenzen */
export function readTree(raw: unknown, depth = 3, max = 30): SuggestedTask[] {
	if (!Array.isArray(raw)) return [];
	const out: SuggestedTask[] = [];
	for (const item of raw.slice(0, max)) {
		const o = (item ?? {}) as Record<string, unknown>;
		const title = clean(o.title);
		if (!title) continue;
		const node: SuggestedTask = {
			title,
			children: depth > 1 ? readTree(o.children, depth - 1, 15) : []
		};
		if (o.priority === 1 || o.priority === 2 || o.priority === 3) node.priority = o.priority;
		if (typeof o.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.due)) node.due = o.due;
		out.push(node);
	}
	return out;
}

function requireTasks(tree: SuggestedTask[]) {
	if (!tree.length) throw new AiError('Die KI hat keine Aufgaben vorgeschlagen.', 'answer');
	return tree;
}

// ---------- Funktionen ----------

export interface Feature<T> {
	messages: ChatMessage[];
	schema?: ResponseSchema;
	maxTokens?: number;
	/** 0 = immer gleiche Antwort (Zuordnen), höher = mehr Ideen (Standard 0.4) */
	temperature?: number;
	parse: (content: string) => T;
}

/** Aufgabe in Unteraufgaben zerlegen (bis zu zwei Ebenen) */
export function breakdown(ctx: TaskContext): Feature<SuggestedTask[]> {
	const t = ctx.task;
	return {
		schema: TREE_SCHEMA,
		messages: [
			{ role: 'system', content: SYSTEM },
			{
				role: 'user',
				content: [
					poolHeader(ctx),
					`Aufgabe: „${t.title}“`,
					t.parent ? `Gehört zu: „${t.parent}“` : '',
					t.project ? `Projekt: ${t.project}` : '',
					t.due ? `Fällig: ${t.due}` : '',
					t.notes ? `Notizen:\n${t.notes}` : '',
					t.existingSubtasks.length
						? `Schon vorhandene Unteraufgaben (nicht wiederholen):\n${t.existingSubtasks.join('\n')}`
						: '',
					'Zerlege die Aufgabe in 3–7 konkrete Unteraufgaben in sinnvoller Reihenfolge. ' +
						'Nur wo es wirklich hilft, eine weitere Ebene darunter. Keine Selbstverständlichkeiten.'
				]
					.filter(Boolean)
					.join('\n\n')
			}
		],
		maxTokens: 1200,
		parse: (c) => requireTasks(readTree(parseJson<{ tasks: unknown }>(c).tasks))
	};
}

/** Lösungsansätze und Tipps zu einer Aufgabe (Markdown-Text) */
export function tips(ctx: TaskContext): Feature<string> {
	const t = ctx.task;
	return {
		messages: [
			{ role: 'system', content: SYSTEM },
			{
				role: 'user',
				content: [
					poolHeader(ctx),
					`Aufgabe: „${t.title}“`,
					t.parent ? `Gehört zu: „${t.parent}“` : '',
					t.notes ? `Notizen:\n${t.notes}` : '',
					t.existingSubtasks.length ? `Unteraufgaben:\n${t.existingSubtasks.join('\n')}` : '',
					'Gib 3–6 praktische Lösungsansätze oder Tipps, wie ich diese Aufgabe gut erledige. ' +
						'Format: Markdown-Liste, jeder Punkt höchstens zwei Sätze. Keine Einleitung, kein Schlusswort.'
				]
					.filter(Boolean)
					.join('\n\n')
			}
		],
		maxTokens: 700,
		parse: (c) => {
			const text = c.trim();
			if (!text) throw new AiError('Die KI hat keine Tipps geliefert.', 'answer');
			return text;
		}
	};
}

/** Freitext (Notizen, E-Mail, Gedanken) → strukturierte Aufgaben */
export function fromText(ctx: PoolContext, text: string, today: string): Feature<SuggestedTask[]> {
	return {
		schema: FREETEXT_SCHEMA,
		messages: [
			{ role: 'system', content: SYSTEM },
			{
				role: 'user',
				content: [
					poolHeader(ctx),
					`Heute ist ${today}.`,
					'Mache aus diesem Text konkrete Aufgaben. Zusammengehöriges als Unteraufgaben. ' +
						'Priorität (1 = dringend) und Fälligkeitsdatum nur, wenn der Text es nahelegt, sonst null.',
					`Text:\n"""\n${text.slice(0, 6000)}\n"""`
				]
					.filter(Boolean)
					.join('\n\n')
			}
		],
		maxTokens: 1500,
		parse: (c) => requireTasks(readTree(parseJson<{ tasks: unknown }>(c).tasks))
	};
}

/** Tagesplan: welche offenen Aufgaben heute, in welcher Reihenfolge, warum */
export function dayPlan(ctx: PoolContext, today: string, weekday: string): Feature<DayPlan> {
	return {
		schema: PLAN_SCHEMA,
		messages: [
			{ role: 'system', content: SYSTEM },
			{
				role: 'user',
				content: [
					poolHeader(ctx),
					`Heute ist ${weekday}, ${today}.`,
					`Offene Aufgaben:\n${ctx.tasks.map(taskLine).join('\n') || '(keine)'}`,
					'Schlage einen realistischen Plan für heute vor: 3–6 Aufgaben in sinnvoller Reihenfolge, ' +
						'mit je einem kurzen Grund (Fälligkeit, Priorität, oft verschoben, passt zusammen). ' +
						'Gib bei jedem Punkt die Referenz aus der Liste an (z. B. „a3“). ' +
						'Schätze je Punkt realistisch die Dauer in Minuten („minutes“; steht schon eine Schätzung da, ' +
						'übernimm sie) und eine Priorität („priority“: 1 = hoch, 2 = mittel, 3 = niedrig; ' +
						'hat die Aufgabe schon eine, übernimm sie). ' +
						'Dazu eine Zusammenfassung in einem Satz – darin keine Referenzen, nur die Aufgaben beim Namen.'
				].join('\n\n')
			}
		],
		maxTokens: 900,
		parse: (c) => {
			const raw = parseJson<{ summary?: unknown; items?: unknown }>(c);
			const seen = new Set<string>();
			const items = (Array.isArray(raw.items) ? raw.items : [])
				.map((i) => (i ?? {}) as Record<string, unknown>)
				.map((i) => ({
					ref: String(i.ref ?? '').trim(),
					reason: clean(i.reason),
					minutes: Number(i.minutes),
					priority: Number(i.priority)
				}))
				.filter((i) => ctx.refs.has(i.ref) && !seen.has(i.ref) && seen.add(i.ref))
				.slice(0, 8)
				.map((i): DayPlanItem => {
					const task = ctx.tasks.find((t) => t.ref === i.ref)!;
					// Vorhandenes hat Vorrang; Vorschläge der KI nur in sinnvollen Grenzen
					const minutes =
						Number.isFinite(i.minutes) && i.minutes > 0
							? Math.min(480, Math.max(5, Math.round(i.minutes / 5) * 5))
							: null;
					const prio = [1, 2, 3].includes(i.priority) ? (i.priority as 1 | 2 | 3) : null;
					return {
						taskId: ctx.refs.get(i.ref)!,
						title: task.title,
						reason: i.reason,
						estimateMin: task.estimate ?? minutes,
						priority: (task.priority as 1 | 2 | 3 | undefined) ?? prio
					};
				});
			if (!items.length) throw new AiError('Die KI hat keinen Plan erstellt.', 'answer');
			return { summary: clean(raw.summary), items };
		}
	};
}

/** Wochenrückblick (Markdown): was erledigt wurde, was hängt, was als Nächstes */
export function weekReview(ctx: PoolContext, from: string, to: string): Feature<string> {
	const done = ctx.tasks.filter((t) => t.done);
	const open = ctx.tasks.filter((t) => !t.done);
	return {
		messages: [
			{ role: 'system', content: SYSTEM },
			{
				role: 'user',
				content: [
					poolHeader(ctx),
					`Zeitraum: ${from} bis ${to}.`,
					`Erledigt in diesem Zeitraum:\n${done.map(taskLine).join('\n') || '(nichts)'}`,
					`Noch offen:\n${open.map(taskLine).join('\n') || '(nichts)'}`,
					'Schreibe einen kurzen Wochenrückblick in Markdown mit drei Abschnitten (Überschriften „### …“): ' +
						'„Geschafft“ (Zusammenfassung, keine reine Aufzählung), „Hängt fest“ (oft verschoben, überfällig) ' +
						'und „Vorschlag für nächste Woche“ (2–4 Punkte). Insgesamt höchstens 200 Wörter, freundlich und ehrlich. ' +
						'Ist ein Abschnitt leer, schreibe das in einem Satz.'
				].join('\n\n')
			}
		],
		maxTokens: 900,
		parse: (c) => {
			const text = c.trim();
			if (!text) throw new AiError('Die KI hat keinen Rückblick geliefert.', 'answer');
			return text;
		}
	};
}

/** Pool-Vorschlag für einen Inbox-Eintrag (sieht nur den Eintrag und die Pool-Namen) */
export function suggestPool(ctx: InboxContext): Feature<PoolSuggestion> {
	return {
		schema: poolSchema(ctx.pools),
		temperature: 0,
		messages: [
			{
				role: 'system',
				content:
					'Du ordnest Einträge einer Aufgaben-App einem Bereich zu. Antworte auf Deutsch. ' +
					'Typische Hinweise: Kunden, Kollegen, Angebote, Projekte, Rechnungen an Firmen → beruflich; ' +
					'Familie, Haushalt, Gesundheit, Freizeit, Einkäufe → privat. ' +
					'Wähle immer den wahrscheinlichsten Bereich; null nur, wenn der Eintrag zu keinem Bereich passt.'
			},
			{
				role: 'user',
				content: `Bereiche: ${ctx.pools.join(', ')}\nEintrag: „${ctx.item.title}“${ctx.item.notes ? `\nNotiz: ${ctx.item.notes}` : ''}\nAntwort: Bereichsname aus der Liste und ein Grund in höchstens 8 Wörtern.`
			}
		],
		maxTokens: 200,
		parse: (c) => {
			const raw = parseJson<{ pool?: unknown; reason?: unknown }>(c);
			const name = typeof raw.pool === 'string' ? raw.pool.trim().toLowerCase() : '';
			const pool = ctx.pools.find((p) => p.toLowerCase() === name) ?? null;
			return { pool, reason: clean(raw.reason) };
		}
	};
}
