/**
 * Heute-Ansicht und Wochenrückblick – reine Logik über alle Pools.
 *
 * „Für heute geplant“ heißt: geplantes Datum (DTSTART) ist heute. Was an einem früheren Tag
 * geplant und nicht erledigt wurde, rutscht automatisch nach heute („liegen geblieben“).
 * Überfällig heißt: das Fälligkeitsdatum ist vorbei.
 */
import { differenceInCalendarDays, subDays } from 'date-fns';
import { daysFromToday, fromIsoDate, toIsoDate, todayIso } from './dates';
import { isDone, isOpen, type Task } from './types';

export interface TodayItem {
	task: Task;
	/** „Elternaufgabe › …“ – damit Unteraufgaben verständlich sind */
	path: string[];
	/** Tage seit dem geplanten Datum (0 = heute geplant) */
	carriedOver: number;
}

export interface TodayView {
	overdue: TodayItem[];
	today: TodayItem[];
	/** Heute erledigt */
	done: Task[];
	/** Wie viele Aufgaben heute drankommen (für heute + überfällige, die für heute eingeplant sind) */
	count: number;
	/** Summe ihrer Schätzungen (Minuten) */
	estimate: number;
	/** Wie viele davon keine Schätzung haben */
	unestimated: number;
}

function pathOf(task: Task, byId: Map<string, Task>) {
	const path: string[] = [];
	let p = task.parentId ? byId.get(task.parentId) : undefined;
	while (p) {
		path.unshift(p.title);
		p = p.parentId ? byId.get(p.parentId) : undefined;
	}
	return path;
}

/** Liegt die Aufgabe (oder eine Elternaufgabe) unter „Irgendwann“? */
function inSomeday(task: Task, byId: Map<string, Task>) {
	for (let t: Task | undefined = task; t; t = t.parentId ? byId.get(t.parentId) : undefined)
		if (t.someday) return true;
	return false;
}

/** Ist das geplante Datum heute oder früher? */
export const isPlannedFor = (task: Pick<Task, 'scheduled'>, now: Date) =>
	!!task.scheduled && task.scheduled.date <= todayIso(now);

export function buildToday(tasks: readonly Task[], now: Date): TodayView {
	const live = tasks.filter((t) => !t.deletedAt);
	const byId = new Map(live.map((t) => [t.id, t]));
	const today = todayIso(now);
	const overdue: TodayItem[] = [];
	const planned: TodayItem[] = [];
	const done: Task[] = [];

	for (const t of live) {
		if (isDone(t)) {
			if (t.completedAt && toIsoDate(new Date(t.completedAt)) === today) done.push(t);
			continue;
		}
		if (inSomeday(t, byId)) continue;
		const item = (): TodayItem => ({
			task: t,
			path: pathOf(t, byId),
			carriedOver: t.scheduled
				? Math.max(0, differenceInCalendarDays(fromIsoDate(today), fromIsoDate(t.scheduled.date)))
				: 0
		});
		if (t.due && daysFromToday(t.due, now) < 0) overdue.push(item());
		else if (isPlannedFor(t, now) || (t.due && t.due.date === today)) planned.push(item());
	}

	const byTime = (a: TodayItem, b: TodayItem) =>
		(a.task.scheduled?.time ?? a.task.due?.time ?? '99').localeCompare(
			b.task.scheduled?.time ?? b.task.due?.time ?? '99'
		) ||
		(a.task.priority ?? 9) - (b.task.priority ?? 9) ||
		a.task.createdAt - b.task.createdAt;
	overdue.sort((a, b) => a.task.due!.date.localeCompare(b.task.due!.date) || byTime(a, b));
	planned.sort(byTime);
	done.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));

	// Überfälliges zählt mit, sobald es für heute eingeplant ist
	const counted = [...planned, ...overdue.filter((i) => isPlannedFor(i.task, now))];
	return {
		overdue,
		today: planned,
		done,
		count: counted.length,
		estimate: counted.reduce((s, i) => s + (i.task.estimateMin ?? 0), 0),
		unestimated: counted.filter((i) => !i.task.estimateMin).length
	};
}

// ---------- Wochenrückblick ----------

export interface PoolWeek {
	poolId: string;
	done: Task[];
	/** Offene Aufgaben, die schon verschoben wurden – häufigste zuerst */
	postponed: Task[];
	/** Erfasste Minuten im Zeitraum */
	minutes: number;
	/** Neu angelegt im Zeitraum */
	created: number;
}

/** Rückblick auf die letzten 7 Tage (bis einschließlich heute), je Pool */
export function buildWeek(
	tasks: readonly Task[],
	now: Date
): { from: string; to: string; pools: PoolWeek[] } {
	const from = toIsoDate(subDays(now, 6));
	const to = todayIso(now);
	const fromMs = fromIsoDate(from).getTime();
	const byPool = new Map<string, PoolWeek>();
	const get = (poolId: string) => {
		let w = byPool.get(poolId);
		if (!w) byPool.set(poolId, (w = { poolId, done: [], postponed: [], minutes: 0, created: 0 }));
		return w;
	};
	for (const t of tasks) {
		if (t.deletedAt) continue;
		const w = get(t.poolId);
		if (isDone(t) && (t.completedAt ?? 0) >= fromMs) w.done.push(t);
		if (isOpen(t) && t.postponeCount > 0 && !t.someday) w.postponed.push(t);
		if (t.createdAt >= fromMs) w.created++;
		for (const e of t.timeEntries ?? []) if (e.date >= from && e.date <= to) w.minutes += e.minutes;
	}
	for (const w of byPool.values()) {
		w.done.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
		w.postponed.sort((a, b) => b.postponeCount - a.postponeCount);
	}
	return { from, to, pools: [...byPool.values()] };
}
