import { describe, expect, it } from 'vitest';
import { outline } from './test-helpers';
import {
	childrenOf,
	descendantIds,
	flattenTree,
	indentPatch,
	movePatch,
	outdentPatch,
	progress,
	wouldCycle
} from './tree';
import type { Task } from './types';

const apply = (tasks: Task[], id: string, patch: Partial<Task> | null) =>
	tasks.map((t) => (t.id === id && patch ? { ...t, ...patch } : t));

const shape = (tasks: Task[]) =>
	flattenTree(tasks, childrenOf(tasks, null)).map((r) => '  '.repeat(r.depth) + r.task.id);

describe('Einrücken (Tab)', () => {
	it('wird letztes Kind des vorherigen Geschwisters', () => {
		let tasks = outline(`
			A
			  A1
			B
		`);
		tasks = apply(tasks, 'B', indentPatch(tasks, 'B'));
		expect(shape(tasks)).toEqual(['A', '  A1', '  B']);
	});

	it('erstes Geschwister kann nicht eingerückt werden', () => {
		const tasks = outline(`
			A
			  A1
		`);
		expect(indentPatch(tasks, 'A')).toBeNull();
		expect(indentPatch(tasks, 'A1')).toBeNull();
	});

	it('nimmt die eigenen Kinder mit', () => {
		let tasks = outline(`
			A
			B
			  B1
		`);
		tasks = apply(tasks, 'B', indentPatch(tasks, 'B'));
		expect(shape(tasks)).toEqual(['A', '  B', '    B1']);
	});
});

describe('Ausrücken (Shift+Tab)', () => {
	it('landet direkt hinter dem bisherigen Elternteil', () => {
		let tasks = outline(`
			A
			  A1
			  A2
			B
		`);
		tasks = apply(tasks, 'A1', outdentPatch(tasks, 'A1'));
		expect(shape(tasks)).toEqual(['A', '  A2', 'A1', 'B']);
	});

	it('funktioniert über mehrere Ebenen', () => {
		let tasks = outline(`
			A
			  A1
			    A1a
		`);
		tasks = apply(tasks, 'A1a', outdentPatch(tasks, 'A1a'));
		expect(shape(tasks)).toEqual(['A', '  A1', '  A1a']);
	});

	it('oberste Ebene kann nicht ausgerückt werden', () => {
		expect(outdentPatch(outline('A'), 'A')).toBeNull();
	});
});

describe('Verschieben (Alt+↑/↓)', () => {
	it('tauscht mit Nachbarn und stoppt am Rand', () => {
		let tasks = outline(`
			A
			B
			C
		`);
		tasks = apply(tasks, 'C', movePatch(tasks, 'C', -1));
		expect(shape(tasks)).toEqual(['A', 'C', 'B']);
		tasks = apply(tasks, 'A', movePatch(tasks, 'A', 1));
		expect(shape(tasks)).toEqual(['C', 'A', 'B']);
		expect(movePatch(tasks, 'C', -1)).toBeNull();
		expect(movePatch(tasks, 'B', 1)).toBeNull();
	});
});

describe('Fortschritt, Nachfahren, Zyklen', () => {
	const tasks = outline(`
		A
		  A1
		  A2
		    A2a
		  A3
	`).map((t) => (t.id === 'A1' || t.id === 'A3' ? { ...t, status: 'completed' as const } : t));

	it('zählt direkte Unteraufgaben', () => {
		expect(progress(tasks, 'A')).toEqual({ done: 2, total: 3 });
		expect(progress(tasks, 'A2')).toEqual({ done: 0, total: 1 });
		expect(progress(tasks, 'A1')).toBeNull();
	});

	it('findet alle Nachfahren', () => {
		expect(descendantIds(tasks, 'A').sort()).toEqual(['A1', 'A2', 'A2a', 'A3']);
	});

	it('erkennt Zyklen', () => {
		expect(wouldCycle(tasks, 'A', 'A2a')).toBe(true);
		expect(wouldCycle(tasks, 'A2a', 'A')).toBe(false);
	});

	it('eingeklappte Teilbäume werden nicht abgeflacht', () => {
		const collapsed = tasks.map((t) => (t.id === 'A2' ? { ...t, collapsed: true } : t));
		expect(shape(collapsed)).toEqual(['A', '  A1', '  A2', '  A3']);
	});

	it('gelöschte Aufgaben werden ignoriert', () => {
		const deleted = tasks.map((t) => (t.id === 'A3' ? { ...t, deletedAt: 1 } : t));
		expect(progress(deleted, 'A')).toEqual({ done: 1, total: 2 });
	});
});
