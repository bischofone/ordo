/**
 * Schreibzugriffe auf die lokale Datenbank. Die UI ändert Daten ausschließlich hierüber.
 * (Phase 2 hängt hier die Sync-Warteschlange an.)
 */
import { generateNKeysBetween } from 'fractional-indexing';
import { toIsoDate } from '#lib/domain/dates.ts';
import { uuid } from '#lib/domain/id.ts';
import { timerMinutes } from '#lib/domain/time.ts';
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
	type RunningTimer,
	type Task,
	type TimeEntry
} from '#lib/domain/types.ts';
import type { TasksDB } from './db';

export const INBOX_ID = 'inbox';
export const TIMER_KEY = 'timer';

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

		/**
		 * Pool endgültig löschen – mit allen Aufgaben, Projekten und Sync-Daten auf diesem Gerät.
		 * Auf dem Server passiert hier nichts (siehe Sync-Engine `deleteRemoteList`).
		 */
		async deletePool(id: string) {
			if (id === INBOX_ID) throw new Error('Die Inbox kann nicht gelöscht werden');
			await db.transaction(
				'rw',
				[db.pools, db.projects, db.tasks, db.syncRecords, db.syncState, db.conflicts],
				async () => {
					const taskIds = (await db.tasks.where('poolId').equals(id).primaryKeys()) as string[];
					await db.conflicts.where('taskId').anyOf(taskIds).delete();
					await db.syncRecords.where('poolId').equals(id).delete();
					await db.syncState.delete(id);
					await db.tasks.where('poolId').equals(id).delete();
					await db.projects.where('poolId').equals(id).delete();
					await db.pools.delete(id);
				}
			);
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

		/**
		 * Projekt löschen (Tombstone für den Sync). Die Aufgaben bleiben im Pool, nur ohne
		 * Projekt – oder werden mit `withTasks` ebenfalls gelöscht.
		 */
		async deleteProject(id: string, opts: { withTasks?: boolean } = {}) {
			await db.transaction('rw', db.projects, db.tasks, async () => {
				const t = now();
				await db.tasks
					.filter((task) => task.projectId === id && !task.deletedAt)
					.modify(
						opts.withTasks ? { deletedAt: t, updatedAt: t } : { projectId: null, updatedAt: t }
					);
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

		// ---------- Zeiterfassung ----------

		/** Zeit an einer Aufgabe erfassen. Ohne Datum gilt der heutige Tag. */
		async addTime(taskId: string, input: { minutes: number; date?: string; note?: string }) {
			if (!(input.minutes > 0)) throw new Error('Dauer muss größer als 0 sein');
			const entry: TimeEntry = {
				id: uid(),
				date: input.date ?? toIsoDate(clock()),
				minutes: Math.round(input.minutes),
				...(input.note ? { note: input.note } : {})
			};
			await db.transaction('rw', db.tasks, async () => {
				const task = await getTask(taskId);
				await db.tasks.update(taskId, {
					timeEntries: [...(task.timeEntries ?? []), entry],
					updatedAt: now()
				});
			});
			return entry;
		},

		async updateTime(taskId: string, entryId: string, patch: Partial<Omit<TimeEntry, 'id'>>) {
			await db.transaction('rw', db.tasks, async () => {
				const task = await getTask(taskId);
				await db.tasks.update(taskId, {
					timeEntries: (task.timeEntries ?? []).map((e) =>
						e.id === entryId ? { ...e, ...patch } : e
					),
					updatedAt: now()
				});
			});
		},

		async deleteTime(taskId: string, entryId: string) {
			await db.transaction('rw', db.tasks, async () => {
				const task = await getTask(taskId);
				await db.tasks.update(taskId, {
					timeEntries: (task.timeEntries ?? []).filter((e) => e.id !== entryId),
					updatedAt: now()
				});
			});
		},

		getTimer: (): Promise<RunningTimer | null> =>
			db.settings.get(TIMER_KEY).then((s) => (s?.value as RunningTimer | undefined) ?? null),

		/**
		 * Timer starten. Es läuft immer nur einer: ein anderer wird gestoppt und erfasst.
		 * Läuft der Timer schon für diese Aufgabe, passiert nichts.
		 */
		async startTimer(taskId: string) {
			const running = await repo.getTimer();
			if (running?.taskId === taskId) return;
			if (running) await repo.stopTimer();
			await getTask(taskId);
			await db.settings.put({ key: TIMER_KEY, value: { taskId, start: now() } });
		},

		/**
		 * Timer stoppen und die Zeit erfassen (am Tag des Starts).
		 * Liefert den Eintrag – oder null, wenn kein Timer lief, er zu kurz war oder die
		 * Aufgabe inzwischen gelöscht wurde.
		 */
		async stopTimer(): Promise<{ taskId: string; entry: TimeEntry } | null> {
			const running = await repo.getTimer();
			if (!running) return null;
			await db.settings.delete(TIMER_KEY);
			const minutes = timerMinutes(running.start, now());
			const task = await db.tasks.get(running.taskId);
			if (minutes === null || !task || task.deletedAt) return null;
			const entry = await repo.addTime(running.taskId, {
				minutes,
				date: toIsoDate(new Date(running.start))
			});
			return { taskId: running.taskId, entry };
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
