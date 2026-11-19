/**
 * Strikte Trennung pro Pool – hier zentral erzwungen.
 *
 * Jeder KI-Aufruf bekommt seinen Kontext ausschließlich aus `buildPoolContext` (genau ein Pool)
 * oder `buildInboxItemContext` (genau ein Inbox-Eintrag, ohne Inhalte aus Pools).
 * Beide filtern selbst nach der Pool-ID und prüfen das Ergebnis zusätzlich mit
 * `assertSinglePool` – ein Fehler hier bricht den Aufruf ab, statt Daten preiszugeben.
 * Abgesichert durch context.test.ts.
 */
import { format } from 'date-fns';
import { bySortOrder, childrenOf } from '#lib/domain/tree.ts';
import { isDone, type Pool, type Project, type Task } from '#lib/domain/types.ts';

/** Aufgabe, wie die KI sie sieht: kurze Referenz statt UUID, nur nötige Felder */
export interface ContextTask {
	/** Kurze Referenz („a1“) – die KI antwortet damit, die App übersetzt zurück */
	ref: string;
	title: string;
	notes?: string;
	project?: string;
	priority?: number;
	due?: string;
	scheduled?: string;
	done?: boolean;
	completed?: string;
	postponed?: number;
	minutes?: number;
	/** Zeitschätzung (Minuten) */
	estimate?: number;
	depth: number;
}

export interface PoolContext {
	poolId: string;
	pool: string;
	/** Eigene Kontext-Notizen des Pools („Ich arbeite als …“) */
	notes?: string;
	projects: string[];
	tasks: ContextTask[];
	/** Referenz → echte Aufgaben-ID (bleibt in der App, geht nicht an die KI) */
	refs: Map<string, string>;
}

export interface PoolData {
	pools: Pool[];
	projects: Project[];
	tasks: Task[];
}

export class IsolationError extends Error {}

/** Wirft, wenn irgendetwas nicht zu genau diesem Pool gehört. */
export function assertSinglePool(poolId: string, items: { poolId: string }[]) {
	for (const item of items) {
		if (item.poolId !== poolId)
			throw new IsolationError(`KI-Kontext enthält Daten aus einem anderen Pool (${item.poolId})`);
	}
}

const dateText = (d?: { date: string; time?: string }) =>
	d ? (d.time ? `${d.date} ${d.time}` : d.date) : undefined;

/**
 * Kontext für genau einen Pool. Bekommt beliebige Daten, nimmt aber nur, was zu `poolId` gehört.
 * `include` steuert, welche Aufgaben hinein dürfen (z. B. nur offene, oder erledigte der letzten Woche).
 */
export function buildPoolContext(
	poolId: string,
	data: PoolData,
	opts: { include?: (t: Task) => boolean; maxTasks?: number; withNotes?: boolean } = {}
): PoolContext {
	const pool = data.pools.find((p) => p.id === poolId);
	if (!pool) throw new IsolationError('Pool nicht gefunden');

	const projects = data.projects.filter((p) => p.poolId === poolId && !p.deletedAt);
	const all = data.tasks.filter((t) => t.poolId === poolId && !t.deletedAt);
	assertSinglePool(poolId, projects);
	assertSinglePool(poolId, all);

	const include = opts.include ?? ((t: Task) => !isDone(t));
	const projectName = new Map(projects.map((p) => [p.id, p.name]));
	const refs = new Map<string, string>();
	const out: ContextTask[] = [];
	const max = opts.maxTasks ?? 150;

	// Baumreihenfolge, damit Unteraufgaben bei ihrer Elternaufgabe stehen
	const walk = (parentId: string | null, depth: number) => {
		for (const t of childrenOf(all, parentId).sort(bySortOrder)) {
			if (out.length >= max) return;
			if (include(t)) {
				const ref = `a${out.length + 1}`;
				refs.set(ref, t.id);
				const minutes = (t.timeEntries ?? []).reduce((s, e) => s + e.minutes, 0);
				out.push({
					ref,
					title: t.title,
					...(opts.withNotes && t.notes ? { notes: t.notes.slice(0, 400) } : {}),
					...(t.projectId && projectName.has(t.projectId)
						? { project: projectName.get(t.projectId) }
						: {}),
					...(t.priority ? { priority: t.priority } : {}),
					...(t.due ? { due: dateText(t.due) } : {}),
					...(t.scheduled ? { scheduled: dateText(t.scheduled) } : {}),
					...(isDone(t) ? { done: true } : {}),
					...(t.completedAt ? { completed: format(t.completedAt, 'yyyy-MM-dd') } : {}),
					...(t.postponeCount ? { postponed: t.postponeCount } : {}),
					...(minutes ? { minutes } : {}),
					...(t.estimateMin ? { estimate: t.estimateMin } : {}),
					depth
				});
			}
			walk(t.id, depth + 1);
		}
	};
	walk(null, 0);

	return {
		poolId,
		pool: pool.name,
		notes: pool.settings.ai.contextNotes?.trim() || undefined,
		projects: projects.filter((p) => !p.archived).map((p) => p.name),
		tasks: out,
		refs
	};
}

/** Kontext für eine einzelne Aufgabe: sie selbst, ihre Unteraufgaben und ihr Pool – sonst nichts. */
export function buildTaskContext(taskId: string, data: PoolData) {
	const task = data.tasks.find((t) => t.id === taskId && !t.deletedAt);
	if (!task) throw new IsolationError('Aufgabe nicht gefunden');
	const ctx = buildPoolContext(task.poolId, data, { include: () => false });
	const poolTasks = data.tasks.filter((t) => t.poolId === task.poolId && !t.deletedAt);
	assertSinglePool(task.poolId, poolTasks);
	const sub = (id: string): string[] =>
		childrenOf(poolTasks, id)
			.sort(bySortOrder)
			.flatMap((c) => [c.title, ...sub(c.id).map((s) => `  ${s}`)]);
	const parent = task.parentId ? poolTasks.find((t) => t.id === task.parentId) : undefined;
	return {
		...ctx,
		task: {
			title: task.title,
			notes: task.notes.slice(0, 1500) || undefined,
			parent: parent?.title,
			project: task.projectId
				? data.projects.find((p) => p.id === task.projectId && p.poolId === task.poolId)?.name
				: undefined,
			due: dateText(task.due),
			existingSubtasks: sub(task.id)
		}
	};
}

/**
 * Kontext für einen Inbox-Eintrag: nur sein eigener Text und die Namen der Pools
 * (damit die KI einen vorschlagen kann) – keine Aufgaben, Projekte oder Notizen aus Pools.
 */
export function buildInboxItemContext(taskId: string, data: PoolData) {
	const task = data.tasks.find((t) => t.id === taskId && !t.deletedAt);
	if (!task) throw new IsolationError('Eintrag nicht gefunden');
	const inbox = data.pools.find((p) => p.id === task.poolId);
	if (inbox?.kind !== 'inbox') throw new IsolationError('Nur für Inbox-Einträge');
	return {
		poolId: task.poolId,
		item: { title: task.title, notes: task.notes.slice(0, 600) || undefined },
		pools: data.pools.filter((p) => p.kind === 'pool' && !p.archived).map((p) => p.name)
	};
}
