/**
 * Drag & Drop im Outliner – reine Berechnung, wohin eine gezogene Aufgabe fällt.
 *
 * Grundlage ist die abgeflachte Zeilenliste der Zielliste OHNE die gezogene Aufgabe und ihre
 * Unteraufgaben. `slot` ist die Einfügeposition in dieser Liste (0 = ganz oben), `depth` die
 * gewünschte Ebene (aus der waagrechten Mausposition). Die Ebene wird auf das an dieser Stelle
 * Mögliche begrenzt – wie in Outlinern üblich.
 */
import { keyBetween, type Row } from './tree';
import type { Task } from './types';

export interface DropPlacement {
	parentId: string | null;
	sortOrder: string;
	depth: number;
}

export function depthRange(rows: readonly Row[], slot: number) {
	const prev = rows[slot - 1];
	const next = rows[slot];
	// In eine eingeklappte Aufgabe kann nicht hineingezogen werden (das Ergebnis wäre unsichtbar).
	const canNestInPrev = prev && !(prev.task.collapsed && prev.hasChildren);
	const max = prev ? prev.depth + (canNestInPrev ? 1 : 0) : 0;
	const min = next ? Math.min(next.depth, max) : 0;
	return { min, max };
}

export function dropPlacement(rows: readonly Row[], slot: number, depth: number): DropPlacement {
	slot = Math.max(0, Math.min(slot, rows.length));
	const { min, max } = depthRange(rows, slot);
	const d = Math.max(min, Math.min(depth, max));

	// Elternteil: nächste Zeile oberhalb mit Ebene d-1
	let parent: Task | null = null;
	if (d > 0) {
		for (let i = slot - 1; i >= 0; i--) {
			if (rows[i].depth === d - 1) {
				parent = rows[i].task;
				break;
			}
		}
	}

	// Vorheriges Geschwister: nächste Zeile oberhalb mit Ebene d (bevor die Ebene kleiner wird)
	let prevSibling: Task | null = null;
	for (let i = slot - 1; i >= 0; i--) {
		if (rows[i].depth < d) break;
		if (rows[i].depth === d) {
			prevSibling = rows[i].task;
			break;
		}
	}
	const next = rows[slot];
	const nextSibling = next && next.depth === d ? next.task : null;

	return {
		parentId: parent?.id ?? null,
		sortOrder: keyBetween(prevSibling, nextSibling),
		depth: d
	};
}
