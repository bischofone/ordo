import { bySortOrder } from '#lib/domain/tree.ts';
import { db } from './app';

/** Lesende Abfragen für `live(...)`. */
export const q = {
	pools: () => db.pools.toArray().then((ps) => ps.sort(bySortOrder)),
	allTasks: () => db.tasks.filter((t) => !t.deletedAt).toArray(),
	poolTasks: (poolId: string) => () =>
		db.tasks
			.where('poolId')
			.equals(poolId)
			.filter((t) => !t.deletedAt)
			.toArray(),
	setting:
		<T>(key: string, fallback: T) =>
		async () =>
			((await db.settings.get(key))?.value as T) ?? fallback
};
