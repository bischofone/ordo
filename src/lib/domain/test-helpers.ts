import { generateNKeysBetween } from 'fractional-indexing';
import type { Task } from './types';

let counter = 0;

export function makeTask(overrides: Partial<Task> = {}): Task {
	counter++;
	return {
		id: overrides.id ?? `t${counter}`,
		poolId: 'p1',
		parentId: null,
		sortOrder: 'a0',
		title: `Aufgabe ${counter}`,
		notes: '',
		priority: null,
		status: 'needs-action',
		someday: false,
		postponeCount: 0,
		blockedBy: [],
		collapsed: false,
		createdAt: 0,
		updatedAt: 0,
		...overrides
	};
}

/** Baut Aufgaben aus einer eingerückten Gliederung ("  " = eine Ebene). Id = Titel. */
export function outline(text: string, poolId = 'p1'): Task[] {
	const tasks: Task[] = [];
	const stack: Task[] = [];
	const lines = text.split('\n').filter((l) => l.trim());
	const indent = Math.min(...lines.map((l) => l.search(/\S/)));
	for (const line of lines) {
		const depth = (line.search(/\S/) - indent) / 2;
		const title = line.trim();
		stack.length = depth;
		const parent = stack[depth - 1] ?? null;
		const t = makeTask({ id: title, title, poolId, parentId: parent?.id ?? null });
		tasks.push(t);
		stack[depth] = t;
	}
	// sortOrder pro Geschwisterliste vergeben
	const groups = new Map<string | null, Task[]>();
	for (const t of tasks) groups.set(t.parentId, [...(groups.get(t.parentId) ?? []), t]);
	for (const g of groups.values()) {
		const keys = generateNKeysBetween(null, null, g.length);
		g.forEach((t, i) => (t.sortOrder = keys[i]));
	}
	return tasks;
}
