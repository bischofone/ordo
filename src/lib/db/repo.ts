/**
 * Schreibzugriffe auf die lokale Datenbank. Die UI ändert Daten ausschließlich hierüber.
 * (Phase 2 hängt hier die Sync-Warteschlange an.)
 */
import { generateNKeysBetween } from 'fractional-indexing';
import { needsPostponeReview, postponePatch } from '#lib/domain/postpone';
import {
	bySortOrder,
	childrenOf,
	descendantIds,
	indentPatch,
	keyAfter,
	keyAtEnd,
	keyBetween,
	movePatch,
	outdentPatch,
	type TreePatch
} from '#lib/domain/tree';
import {
	DEFAULT_POOL_SETTINGS,
	POOL_COLORS,
	type DateValue,
	type Pool,
	type Priority,
	type Task
} from '#lib/domain/types';
import type { TasksDB } from './db';

export const INBOX_ID = 'inbox';

export interface NewTask {
	poolId: string;
	title: string;
	parentId?: string | null;
	/** Direkt hinter dieser Aufgabe einfügen (gleiche Ebene). */
	afterId?: string;
	priority?: Priority | null;
	due?: DateValue;
	scheduled?: DateValue;
	notes?: string;
	someday?: boolean;
}

export type TaskPatch = Partial<Omit<Task, 'id' | 'createdAt'>>;

export function createRepo(db: TasksDB, clock: () => Date = () => new Date()) {
	const now = () => clock().getTime();
	const uid = () => crypto.randomUUID();

	const poolTasks = (poolId: string) =>
		db.tasks
			.where('poolId')
			.equals(poolId)
			.filter((t) => !t.deletedAt)
			.toArray();

	async function getTask(id: string) {
		const t = await db.tasks.get(id);
		if (!t || t.deletedAt) throw new Error(`Aufgabe ${id} nicht gefunden`);
		return t;
	}

	async function applyTreePatch(id: string, compute: (tasks: Task[]) => TreePatch | null) {
		return db.transaction('rw', db.tasks, async () => {
			const task = await getTask(id);
			const patch = compute(await poolTasks(task.poolId));
			if (!patch) return false;
			await db.tasks.update(id, { ...patch, updatedAt: now() });
			return true;
		});
	}

	const repo = {
		// ---------- Pools ----------

		/** Legt beim ersten Start Inbox und Beispiel-Pools an. */
		async ensureDefaults() {
			await db.transaction('rw', db.pools, async () => {
				if (await db.pools.get(INBOX_ID)) return;
				const t = now();
				const keys = generateNKeysBetween(null, null, 3);
				await db.pools.bulkAdd([
					{
						id: INBOX_ID,
						kind: 'inbox',
						name: 'Inbox',
						color: POOL_COLORS[8],
						sortOrder: keys[0],
						archived: false,
						settings: structuredClone(DEFAULT_POOL_SETTINGS),
						createdAt: t,
						updatedAt: t
					},
					...(['Privat', 'Arbeit'] as const).map(
						(name, i): Pool => ({
							id: uid(),
							kind: 'pool',
							name,
							color: POOL_COLORS[i === 0 ? 3 : 5],
							sortOrder: keys[i + 1],
							archived: false,
							settings: structuredClone(DEFAULT_POOL_SETTINGS),
							createdAt: t,
							updatedAt: t
						})
					)
				]);
			});
		},

		async createPool(name: string, color?: string) {
			const pools = (await db.pools.toArray()).sort(bySortOrder);
			const id = uid();
			const t = now();
			await db.pools.add({
				id,
				kind: 'pool',
				name: name.trim(),
				color: color ?? POOL_COLORS[pools.length % (POOL_COLORS.length - 1)],
				sortOrder: keyAtEnd(pools),
				archived: false,
				settings: structuredClone(DEFAULT_POOL_SETTINGS),
				createdAt: t,
				updatedAt: t
			});
			return id;
		},

		async updatePool(id: string, patch: Partial<Pick<Pool, 'name' | 'color' | 'archived'>>) {
			if (id === INBOX_ID && patch.archived) throw new Error('Die Inbox kann nicht archiviert werden');
			await db.pools.update(id, { ...patch, updatedAt: now() });
		},

		async movePool(id: string, dir: -1 | 1) {
			const pools = (await db.pools.toArray())
				.filter((p) => p.kind === 'pool' && !p.archived)
				.sort(bySortOrder);
			const idx = pools.findIndex((p) => p.id === id);
			const target = idx + dir;
			if (idx < 0 || target < 0 || target >= pools.length) return;
			const sortOrder =
				dir === -1
					? keyBetween(pools[target - 1], pools[target])
					: keyBetween(pools[target], pools[target + 1]);
			await db.pools.update(id, { sortOrder, updatedAt: now() });
		},

		// ---------- Aufgaben ----------

		async createTask(input: NewTask) {
			return db.transaction('rw', db.tasks, async () => {
				const tasks = await poolTasks(input.poolId);
				let parentId = input.parentId ?? null;
				let sortOrder: string;
				if (input.afterId) {
					const after = tasks.find((t) => t.id === input.afterId);
					if (!after) throw new Error('afterId nicht gefunden');
					parentId = after.parentId;
					sortOrder = keyAfter(tasks, after);
				} else {
					sortOrder = keyAtEnd(childrenOf(tasks, parentId));
				}
				const t = now();
				const task: Task = {
					id: uid(),
					poolId: input.poolId,
					parentId,
					sortOrder,
					title: input.title,
					notes: input.notes ?? '',
					priority: input.priority ?? null,
					due: input.due,
					scheduled: input.scheduled,
					status: 'needs-action',
					someday: input.someday ?? false,
					postponeCount: 0,
					blockedBy: [],
					collapsed: false,
					createdAt: t,
					updatedAt: t
				};
				await db.tasks.add(task);
				return task.id;
			});
		},

		async updateTask(id: string, patch: TaskPatch) {
			await db.tasks.update(id, { ...patch, updatedAt: now() });
		},

		indent: (id: string) => applyTreePatch(id, (tasks) => indentPatch(tasks, id)),
		outdent: (id: string) => applyTreePatch(id, (tasks) => outdentPatch(tasks, id)),
		move: (id: string, dir: -1 | 1) => applyTreePatch(id, (tasks) => movePatch(tasks, id, dir)),

		/** Offene Unteraufgaben (alle Ebenen) – für die Nachfrage beim Abhaken. */
		async openDescendants(id: string) {
			const task = await getTask(id);
			const tasks = await poolTasks(task.poolId);
			const ids = new Set(descendantIds(tasks, id));
			return tasks.filter(
				(t) => ids.has(t.id) && (t.status === 'needs-action' || t.status === 'in-process')
			);
		},

		async setDone(id: string, done: boolean, opts: { withChildren?: boolean } = {}) {
			await db.transaction('rw', db.tasks, async () => {
				const task = await getTask(id);
				const t = now();
				const ids = [id];
				if (done && opts.withChildren) {
					ids.push(...descendantIds(await poolTasks(task.poolId), id));
				}
				for (const tid of ids) {
					const cur = await db.tasks.get(tid);
					if (!cur || (done && cur.status === 'completed')) continue;
					await db.tasks.update(
						tid,
						done
							? { status: 'completed', completedAt: t, updatedAt: t }
							: { status: 'needs-action', completedAt: undefined, updatedAt: t }
					);
				}
			});
		},

		/**
		 * Löschen (als Tombstone, damit der spätere Sync die Löschung übertragen kann).
		 * Ohne `withChildren` rücken die Kinder an die Stelle der gelöschten Aufgabe.
		 * Liefert die IDs aller gelöschten Aufgaben (für „Rückgängig“).
		 */
		async deleteTask(id: string, opts: { withChildren?: boolean } = {}) {
			return db.transaction('rw', db.tasks, async () => {
				const task = await getTask(id);
				const tasks = await poolTasks(task.poolId);
				const t = now();
				const deleted = [id];
				if (opts.withChildren) {
					deleted.push(...descendantIds(tasks, id));
				} else {
					const kids = childrenOf(tasks, id);
					if (kids.length) {
						const sibs = childrenOf(tasks, task.parentId);
						const next = sibs[sibs.findIndex((s) => s.id === id) + 1];
						const keys = generateNKeysBetween(task.sortOrder, next?.sortOrder ?? null, kids.length);
						await Promise.all(
							kids.map((k, i) =>
								db.tasks.update(k.id, { parentId: task.parentId, sortOrder: keys[i], updatedAt: t })
							)
						);
					}
				}
				await Promise.all(deleted.map((d) => db.tasks.update(d, { deletedAt: t, updatedAt: t })));
				return deleted;
			});
		},

		async restoreTasks(ids: string[]) {
			const t = now();
			await db.transaction('rw', db.tasks, () =>
				Promise.all(ids.map((id) => db.tasks.update(id, { deletedAt: undefined, updatedAt: t })))
			);
		},

		/** Verschiebt eine Aufgabe samt Unteraufgaben in einen anderen Pool (als Wurzel ans Ende). */
		async moveToPool(id: string, poolId: string, patch: TaskPatch = {}) {
			await db.transaction('rw', db.tasks, async () => {
				const task = await getTask(id);
				if (task.poolId === poolId) {
					if (Object.keys(patch).length) await db.tasks.update(id, { ...patch, updatedAt: now() });
					return;
				}
				const sub = descendantIds(await poolTasks(task.poolId), id);
				const target = childrenOf(await poolTasks(poolId), null);
				const t = now();
				await db.tasks.update(id, {
					...patch,
					poolId,
					parentId: null,
					sortOrder: keyAtEnd(target),
					updatedAt: t
				});
				await Promise.all(sub.map((s) => db.tasks.update(s, { poolId, updatedAt: t })));
			});
		},

		/** Zurückschieben. Liefert 'review', wenn vorher nachgefragt werden muss (3. Mal). */
		async postpone(id: string, date: string, opts: { force?: boolean } = {}) {
			const task = await getTask(id);
			if (!opts.force && needsPostponeReview(task)) return 'review' as const;
			await db.tasks.update(id, { ...postponePatch(task, date), updatedAt: now() });
			return 'ok' as const;
		},

		// ---------- Einstellungen ----------

		async getSetting<T>(key: string, fallback: T): Promise<T> {
			return ((await db.settings.get(key))?.value as T) ?? fallback;
		},

		async setSetting(key: string, value: unknown) {
			await db.settings.put({ key, value });
		}
	};
	return repo;
}

export type Repo = ReturnType<typeof createRepo>;
