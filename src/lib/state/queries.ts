import { bySortOrder } from '#lib/domain/tree.ts';
import type { Task } from '#lib/domain/types.ts';
import { db } from './app';

/**
 * Aufgaben, deren Elternteil hier fehlt (z. B. von anderen Apps synchronisiert oder dessen
 * Elternteil gelöscht wurde), werden als oberste Aufgaben angezeigt statt zu verschwinden.
 */
function adoptOrphans(tasks: Task[]): Task[] {
	const ids = new Set(tasks.map((t) => t.id));
	return tasks.map((t) => (t.parentId && !ids.has(t.parentId) ? { ...t, parentId: null } : t));
}

/** Lesende Abfragen für `live(...)`. */
export const q = {
	pools: () => db.pools.toArray().then((ps) => ps.sort(bySortOrder)),
	projects: () =>
		db.projects
			.filter((p) => !p.deletedAt)
			.toArray()
			.then((ps) => ps.sort(bySortOrder)),
	allTasks: () =>
		db.tasks
			.filter((t) => !t.deletedAt)
			.toArray()
			.then(adoptOrphans),
	poolTasks: (poolId: string) => () =>
		db.tasks
			.where('poolId')
			.equals(poolId)
			.filter((t) => !t.deletedAt)
			.toArray()
			.then(adoptOrphans),
	setting:
		<T>(key: string, fallback: T) =>
		async () =>
			((await db.settings.get(key))?.value as T) ?? fallback
};
