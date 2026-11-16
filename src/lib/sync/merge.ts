/**
 * Dreiwege-Zusammenführung pro Feld:
 *   nur lokal geändert  → lokal gewinnt
 *   nur entfernt geändert → Server gewinnt
 *   beide gleich geändert → egal
 *   beide verschieden    → Konflikt (lokaler Wert bleibt vorerst, Nutzer entscheidet)
 * Ein paar Felder werden ohne Rückfrage aufgelöst, weil eine Nachfrage nur nerven würde.
 */
import type { TimeEntry } from '#lib/domain/types.ts';
import { normalize, sameValue, SYNC_FIELDS, type SyncField, type SyncFields } from './fields';

export interface MergeResult {
	merged: SyncFields;
	conflicts: { field: SyncField; local: unknown; remote: unknown }[];
}

/** Ohne Rückfrage: Reihenfolge vom Server, Verschiebe-Zähler das Maximum. */
const AUTO: Partial<
	Record<SyncField, (local: unknown, remote: unknown, base: unknown) => unknown>
> = {
	sortOrder: (_l, r) => r,
	postponeCount: (l, r) => Math.max(Number(l) || 0, Number(r) || 0),
	completedAt: (_l, r) => r, // wird unten passend zum Status gesetzt
	timeEntries: (l, r, b) => mergeTimeEntries(b as TimeEntry[], l as TimeEntry[], r as TimeEntry[])
};

/**
 * Zeiteinträge zweier Geräte zusammenführen – je Eintrag (über seine ID):
 * neu hinzugefügte bleiben von beiden Seiten; auf einer Seite gelöschte verschwinden;
 * auf einer Seite geänderte gelten; auf beiden geändert → Server gewinnt.
 */
export function mergeTimeEntries(
	base: TimeEntry[] = [],
	local: TimeEntry[] = [],
	remote: TimeEntry[] = []
): TimeEntry[] {
	const b = new Map(base.map((e) => [e.id, e]));
	const l = new Map(local.map((e) => [e.id, e]));
	const r = new Map(remote.map((e) => [e.id, e]));
	const out: TimeEntry[] = [];
	for (const id of new Set([...l.keys(), ...r.keys()])) {
		const [be, le, re] = [b.get(id), l.get(id), r.get(id)];
		if (!be)
			out.push((re ?? le)!); // neu (auf einer oder beiden Seiten)
		else if (!le || !re)
			continue; // auf einer Seite gelöscht
		else out.push(sameValue(re, be) ? le : re);
	}
	return out.sort((x, y) => (x.id < y.id ? -1 : 1));
}

export function merge3(baseIn: SyncFields, localIn: SyncFields, remoteIn: SyncFields): MergeResult {
	const base = normalize(baseIn);
	const local = normalize(localIn);
	const remote = normalize(remoteIn);
	const merged = { ...local } as Record<SyncField, unknown>;
	const conflicts: MergeResult['conflicts'] = [];

	for (const k of SYNC_FIELDS) {
		const b = base[k];
		const l = local[k];
		const r = remote[k];
		if (sameValue(l, r) || sameValue(r, b)) merged[k] = l;
		else if (sameValue(l, b)) merged[k] = r;
		else if (AUTO[k]) merged[k] = AUTO[k](l, r, b);
		else {
			merged[k] = l;
			conflicts.push({ field: k, local: l, remote: r });
		}
	}

	// Erledigt-Zeitpunkt gehört zum Status, der sich durchgesetzt hat.
	if (sameValue(merged.status, remote.status) && !sameValue(merged.status, local.status)) {
		merged.completedAt = remote.completedAt;
	} else if (sameValue(merged.status, local.status)) {
		merged.completedAt = local.completedAt ?? remote.completedAt;
	}
	if (merged.status !== 'completed') merged.completedAt = undefined;

	return { merged: normalize(merged as SyncFields), conflicts };
}
