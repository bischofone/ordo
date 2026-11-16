/**
 * Schreibzugriffe auf die lokale Datenbank. Die UI ändert Daten ausschließlich hierüber.
 * (Phase 2 hängt hier die Sync-Warteschlange an.)
 */
import { generateNKeysBetween } from 'fractional-indexing';
import { uuid } from '#lib/domain/id.ts';
import { needsPostponeReview, postponePatch } from '#lib/domain/postpone.ts';
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
} from '#lib/domain/tree.ts';
import {
	DEFAULT_POOL_SETTINGS,
	NEUTRAL_COLOR,
	POOL_COLORS,
	type DateValue,
	type Pool,
	type Priority,
	type Project,
	type Task
} from '#lib/domain/types.ts';
import type { TasksDB } from './db';

export const INBOX_ID = 'inbox';

/** Farben für neue Pools/Projekte (ohne Grau, das ist der Inbox vorbehalten). */
const PALETTE = POOL_COLORS.filter((c) => c !== NEUTRAL_COLOR);

export interface NewTask {
	poolId: string;
	title: string;
	/** Projekt (nur für Wurzeln relevant; Unteraufgaben erben es vom Elternteil). */
	projectId?: string | null;
	parentId?: string | null;
	/** Direkt hinter dieser Aufgabe einfügen (gleiche Ebene). */
	afterId?: string;
	/** Direkt vor dieser Aufgabe einfügen (gleiche Ebene). */
	beforeId?: string;
	/** Als erstes Element der Geschwisterliste einfügen (statt am Ende). */
	first?: boolean;
	priority?: Priority | null;
	due?: DateValue;
	scheduled?: DateValue;
	notes?: string;
	someday?: boolean;
}

export type TaskPatch = Partial<Omit<Task, 'id' | 'createdAt'>>;

export function createRepo(db: TasksDB, clock: () => Date = () => new Date()) {
	const now = () => clock().getTime();
	const uid = uuid;

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

	/** Wurzel bekommt `place`, alle Nachfahren übernehmen Pool und Projekt. */
	async function moveSubtree(
		task: Task,
		place: { poolId: string; projectId: string | null; parentId: string | null; sortOrder: string },
		patch: TaskPatch = {}
	) {
		const t = now();
		const sub = descendantIds(await poolTasks(task.poolId), task.id);
		if (place.parentId && sub.includes(place.parentId)) {
			throw new Error('Aufgabe kann nicht in eine eigene Unteraufgabe verschoben werden');
		}
		await db.tasks.update(task.id, { ...patch, ...place, updatedAt: t });
		await Promise.all(
			sub.map((s) =>
				db.tasks.update(s, { poolId: place.poolId, projectId: place.projectId, updatedAt: t })
			)
		);
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
						color: NEUTRAL_COLOR,
						sortOrder: keys[0],
						archived: false,
						settings: structuredClone(DEFAULT_POOL_SETTINGS),
						createdAt: t,
						updatedAt: t
					},
					...(['Privat', 'Arbeit'] as const).map((name, i): Pool => ({
						id: uid(),
						kind: 'pool',
						name,
						color: PALETTE[i === 0 ? 3 : 5],
						sortOrder: keys[i + 1],
						archived: false,
						settings: structuredClone(DEFAULT_POOL_SETTINGS),
						createdAt: t,
						updatedAt: t
					}))
				]);
			});
		},

		async createPool(name: string, color?: string) {
			const pools = (await db.pools.toArray()).sort(bySortOrder);
			const used = pools.filter((p) => p.kind === 'pool').length;
			const id = uid();
			const t = now();
			await db.pools.add({
				id,
				kind: 'pool',
				name: name.trim(),
				color: color ?? PALETTE[(used * 3) % PALETTE.length],
				sortOrder: keyAtEnd(pools),
				archived: false,
				settings: structuredClone(DEFAULT_POOL_SETTINGS),
				createdAt: t,
				updatedAt: t
			});
			return id;
		},

		async updatePool(
			id: string,
			patch: Partial<Pick<Pool, 'name' | 'color' | 'icon' | 'archived'>>
		) {
			if (id === INBOX_ID && patch.archived)
				throw new Error('Die Inbox kann nicht archiviert werden');
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

		// ---------- Projekte ----------

		async createProject(
			poolId: string,
			name: string,
			opts: { color?: string; icon?: string } = {}
		) {
			const siblings = (await db.projects.where('poolId').equals(poolId).toArray())
				.filter((p) => !p.deletedAt)
				.sort(bySortOrder);
			const id = uid();
			const t = now();
			await db.projects.add({
				id,
				poolId,
				name: name.trim(),
				color: opts.color ?? PALETTE[(siblings.length * 5 + 1) % PALETTE.length],
				icon: opts.icon ?? 'folder',
				sortOrder: keyAtEnd(siblings),
				archived: false,
				createdAt: t,
				updatedAt: t
			});
			return id;
		},

		async updateProject(
			id: string,
			patch: Partial<Pick<Project, 'name' | 'color' | 'icon' | 'archived'>>
		) {
			await db.projects.update(id, { ...patch, updatedAt: now() });
		},

		async moveProject(id: string, dir: -1 | 1) {
			const project = await db.projects.get(id);
			if (!project) return;
			const list = (await db.projects.where('poolId').equals(project.poolId).toArray())
				.filter((p) => !p.archived && !p.deletedAt)
				.sort(bySortOrder);
			const idx = list.findIndex((p) => p.id === id);
			const target = idx + dir;
			if (target < 0 || target >= list.length) return;
			const sortOrder =
				dir === -1
					? keyBetween(list[target - 1], list[target])
					: keyBetween(list[target], list[target + 1]);
			await db.projects.update(id, { sortOrder, updatedAt: now() });
		},

		/** Projekt löschen – die Aufgaben bleiben im Pool, nur ohne Projekt. (Tombstone für den Sync) */
		async deleteProject(id: string) {
			await db.transaction('rw', db.projects, db.tasks, async () => {
				const t = now();
				await db.tasks
					.filter((task) => task.projectId === id)
					.modify({ projectId: null, updatedAt: t });
				await db.projects.update(id, { deletedAt: t, updatedAt: t });
			});
		},

		// ---------- Aufgaben ----------

		async createTask(input: NewTask) {
			return db.transaction('rw', db.tasks, async () => {
				const tasks = await poolTasks(input.poolId);
				let parentId = input.parentId ?? null;
				let projectId = input.projectId ?? null;
				let sortOrder: string;
				if (input.afterId) {
					const after = tasks.find((t) => t.id === input.afterId);
					if (!after) throw new Error('afterId nicht gefunden');
					parentId = after.parentId;
					projectId = after.projectId;
					sortOrder = keyAfter(tasks, after);
				} else if (input.beforeId) {
					const before = tasks.find((t) => t.id === input.beforeId);
					if (!before) throw new Error('beforeId nicht gefunden');
					parentId = before.parentId;
					projectId = before.projectId;
					const sibs = childrenOf(tasks, parentId);
					sortOrder = keyBetween(sibs[sibs.findIndex((t) => t.id === before.id) - 1], before);
				} else if (input.first) {
					sortOrder = keyBetween(null, childrenOf(tasks, parentId)[0]);
				} else {
					sortOrder = keyAtEnd(childrenOf(tasks, parentId));
				}
				if (parentId) projectId = tasks.find((t) => t.id === parentId)?.projectId ?? null;
				const t = now();
				const task: Task = {
					id: uid(),
					poolId: input.poolId,
					projectId,
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

		/** Verschiebt eine Aufgabe samt Unteraufgaben in einen anderen Pool (ohne Projekt, ans Ende). */
		moveToPool(id: string, poolId: string, patch: TaskPatch = {}) {
			return repo.moveTo(id, { poolId, projectId: null }, patch);
		},

		/**
		 * Verschiebt eine Aufgabe samt Unteraufgaben in einen Pool/ein Projekt – als Wurzel ans Ende.
		 * Liegt sie dort schon als Wurzel, wird nur `patch` angewendet.
		 */
		async moveTo(
			id: string,
			target: { poolId: string; projectId: string | null },
			patch: TaskPatch = {}
		) {
			await db.transaction('rw', db.tasks, async () => {
				const task = await getTask(id);
				const t = now();
				if (
					task.poolId === target.poolId &&
					task.projectId === target.projectId &&
					task.parentId === null
				) {
					if (Object.keys(patch).length) await db.tasks.update(id, { ...patch, updatedAt: t });
					return;
				}
				const roots = childrenOf(await poolTasks(target.poolId), null);
				await moveSubtree(task, { ...target, parentId: null, sortOrder: keyAtEnd(roots) }, patch);
			});
		},

		/** Drag & Drop: Aufgabe samt Unteraufgaben an eine berechnete Stelle legen. */
		async placeTask(
			id: string,
			place: {
				poolId: string;
				projectId: string | null;
				parentId: string | null;
				sortOrder: string;
			}
		) {
			await db.transaction('rw', db.tasks, async () => {
				const task = await getTask(id);
				if (place.parentId === id) throw new Error('Aufgabe kann nicht in sich selbst liegen');
				await moveSubtree(task, place);
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
