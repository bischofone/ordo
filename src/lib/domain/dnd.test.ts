import { describe, expect, it } from 'vitest';
import { depthRange, dropPlacement } from './dnd';
import { outline } from './test-helpers';
import { childrenOf, descendantIds, flattenTree } from './tree';
import type { Task } from './types';

/** Simuliert Ziehen: Zeilen ohne den gezogenen Teilbaum, Drop anwenden, Gliederung zurückgeben. */
function drag(tasks: Task[], id: string, slot: number, depth: number) {
	const moving = new Set([id, ...descendantIds(tasks, id)]);
	const rows = flattenTree(tasks, childrenOf(tasks, null)).filter((r) => !moving.has(r.task.id));
	const p = dropPlacement(rows, slot, depth);
	const next = tasks.map((t) =>
		t.id === id ? { ...t, parentId: p.parentId, sortOrder: p.sortOrder } : t
	);
	return flattenTree(next, childrenOf(next, null)).map((r) => '  '.repeat(r.depth) + r.task.id);
}

const base = () =>
	outline(`
		A
		  A1
		  A2
		B
		C
	`);

describe('Drag & Drop im Outliner', () => {
	it('verschiebt auf oberster Ebene', () => {
		// ohne C: [A, A1, A2, B] → Slot 0 = ganz oben
		expect(drag(base(), 'C', 0, 0)).toEqual(['C', 'A', '  A1', '  A2', 'B']);
	});

	it('zieht eine Aufgabe als Unteraufgabe hinein (nach rechts)', () => {
		// ohne B: [A, A1, A2, C] → Slot 3 (nach A2), Ebene 1 → letztes Kind von A
		expect(drag(base(), 'B', 3, 1)).toEqual(['A', '  A1', '  A2', '  B', 'C']);
		// Ebene 2 → Kind von A2
		expect(drag(base(), 'B', 3, 2)).toEqual(['A', '  A1', '  A2', '    B', 'C']);
	});

	it('zieht eine Unteraufgabe heraus (nach links)', () => {
		// ohne A1: [A, A2, B, C] → Slot 2 (zwischen A2 und B), Ebene 0
		expect(drag(base(), 'A1', 2, 0)).toEqual(['A', '  A2', 'A1', 'B', 'C']);
	});

	it('begrenzt die Ebene auf das Mögliche', () => {
		// Ebene 5 gewünscht nach B → höchstens Kind von B
		expect(drag(base(), 'C', 4, 5)).toEqual(['A', '  A1', '  A2', 'B', '  C']);
		// Zwischen A und A1 kann nicht auf Ebene 0 gelegt werden (A1 hängt an A)
		expect(drag(base(), 'C', 1, 0)).toEqual(['A', '  C', '  A1', '  A2', 'B']);
	});

	it('nimmt Unteraufgaben mit', () => {
		// ohne A, A1, A2: [B, C] → ans Ende
		expect(drag(base(), 'A', 2, 0)).toEqual(['B', 'C', 'A', '  A1', '  A2']);
	});

	it('nicht in eingeklappte Aufgaben hinein', () => {
		const tasks = base().map((t) => (t.id === 'A' ? { ...t, collapsed: true } : t));
		const rows = flattenTree(tasks, childrenOf(tasks, null)).filter((r) => r.task.id !== 'B');
		expect(depthRange(rows, 1)).toEqual({ min: 0, max: 0 });
	});

	it('leere Liste', () => {
		const p = dropPlacement([], 0, 3);
		expect(p.parentId).toBeNull();
		expect(p.depth).toBe(0);
	});
});
