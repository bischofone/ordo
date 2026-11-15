/**
 * Baum-Operationen für beliebig tiefe Unteraufgaben.
 * Alle Funktionen sind rein: Sie bekommen die Aufgaben eines Pools und liefern Patches zurück.
 */
import { generateKeyBetween } from 'fractional-indexing';
import { isDone, type Task } from './types';

/** Sortierung: sortOrder als reiner Stringvergleich (nicht localeCompare!), bei Gleichstand id. */
export function bySortOrder(a: Pick<Task, 'sortOrder' | 'id'>, b: Pick<Task, 'sortOrder' | 'id'>) {
	if (a.sortOrder !== b.sortOrder) return a.sortOrder < b.sortOrder ? -1 : 1;
	return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function childrenOf(tasks: readonly Task[], parentId: string | null, poolId?: string) {
	return tasks
		.filter(
			(t) =>
				t.parentId === parentId && !t.deletedAt && (poolId === undefined || t.poolId === poolId)
		)
		.sort(bySortOrder);
}

export function childrenMap(tasks: readonly Task[]) {
	const map = new Map<string | null, Task[]>();
	for (const t of tasks) {
		if (t.deletedAt) continue;
		const list = map.get(t.parentId) ?? [];
		list.push(t);
		map.set(t.parentId, list);
	}
	for (const list of map.values()) list.sort(bySortOrder);
	return map;
}

/** Sortierschlüssel zwischen zwei Nachbarn (beide optional). */
type Sortable = Pick<Task, 'sortOrder'>;

export function keyBetween(before?: Sortable | null, after?: Sortable | null) {
	return generateKeyBetween(before?.sortOrder ?? null, after?.sortOrder ?? null);
}

/** Schlüssel für das Ende einer Geschwisterliste. */
export function keyAtEnd(siblings: readonly Sortable[]) {
	return keyBetween(siblings.at(-1), null);
}

/** Schlüssel direkt nach `afterId` in dessen Geschwisterliste. */
export function keyAfter(tasks: readonly Task[], after: Task) {
	const sibs = childrenOf(tasks, after.parentId, after.poolId);
	const idx = sibs.findIndex((t) => t.id === after.id);
	return keyBetween(after, sibs[idx + 1]);
}

export type TreePatch = Pick<Task, 'parentId' | 'sortOrder'>;

/** Tab: wird letztes Kind des vorherigen Geschwisters. Kein vorheriges Geschwister → null. */
export function indentPatch(tasks: readonly Task[], id: string): TreePatch | null {
	const task = tasks.find((t) => t.id === id);
	if (!task) return null;
	const sibs = childrenOf(tasks, task.parentId, task.poolId);
	const idx = sibs.findIndex((t) => t.id === id);
	if (idx <= 0) return null;
	const newParent = sibs[idx - 1];
	return {
		parentId: newParent.id,
		sortOrder: keyAtEnd(childrenOf(tasks, newParent.id, task.poolId))
	};
}

/** Shift+Tab: wird Geschwister des Elternteils, direkt dahinter. Schon oberste Ebene → null. */
export function outdentPatch(tasks: readonly Task[], id: string): TreePatch | null {
	const task = tasks.find((t) => t.id === id);
	if (!task || task.parentId === null) return null;
	const parent = tasks.find((t) => t.id === task.parentId);
	if (!parent) return { parentId: null, sortOrder: task.sortOrder };
	return { parentId: parent.parentId, sortOrder: keyAfter(tasks, parent) };
}

/** Alt+↑/↓: innerhalb der Geschwister verschieben. */
export function movePatch(tasks: readonly Task[], id: string, dir: -1 | 1): TreePatch | null {
	const task = tasks.find((t) => t.id === id);
	if (!task) return null;
	const sibs = childrenOf(tasks, task.parentId, task.poolId);
	const idx = sibs.findIndex((t) => t.id === id);
	const target = idx + dir;
	if (target < 0 || target >= sibs.length) return null;
	const sortOrder =
		dir === -1
			? keyBetween(sibs[target - 1], sibs[target])
			: keyBetween(sibs[target], sibs[target + 1]);
	return { parentId: task.parentId, sortOrder };
}

export function descendantIds(tasks: readonly Task[], id: string): string[] {
	const map = childrenMap(tasks);
	const out: string[] = [];
	const walk = (pid: string) => {
		for (const c of map.get(pid) ?? []) {
			out.push(c.id);
			walk(c.id);
		}
	};
	walk(id);
	return out;
}

/** Fortschritt der direkten Unteraufgaben, z. B. 3/5. Ohne Kinder → null. */
export function progress(
	tasks: readonly Task[],
	id: string
): { done: number; total: number } | null {
	const kids = tasks.filter((t) => t.parentId === id && !t.deletedAt);
	if (kids.length === 0) return null;
	return { done: kids.filter(isDone).length, total: kids.length };
}

export interface Row {
	task: Task;
	depth: number;
	hasChildren: boolean;
}

/** Flacht Teilbäume ab den gegebenen Wurzeln in Anzeige-Reihenfolge ab (respektiert `collapsed`). */
export function flattenTree(tasks: readonly Task[], roots: readonly Task[]): Row[] {
	const map = childrenMap(tasks);
	const rows: Row[] = [];
	const walk = (t: Task, depth: number) => {
		const kids = map.get(t.id) ?? [];
		rows.push({ task: t, depth, hasChildren: kids.length > 0 });
		if (!t.collapsed) for (const k of kids) walk(k, depth + 1);
	};
	for (const r of roots) walk(r, 0);
	return rows;
}

/** Würde das Verschieben von `id` unter `newParentId` einen Zyklus erzeugen? */
export function wouldCycle(tasks: readonly Task[], id: string, newParentId: string | null) {
	if (newParentId === null) return false;
	return newParentId === id || descendantIds(tasks, id).includes(newParentId);
}
