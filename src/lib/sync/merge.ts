/**
 * Dreiwege-Zusammenführung pro Feld:
 *   nur lokal geändert  → lokal gewinnt
 *   nur entfernt geändert → Server gewinnt
 *   beide gleich geändert → egal
 *   beide verschieden    → Konflikt (lokaler Wert bleibt vorerst, Nutzer entscheidet)
 * Ein paar Felder werden ohne Rückfrage aufgelöst, weil eine Nachfrage nur nerven würde.
 */
import { normalize, sameValue, SYNC_FIELDS, type SyncField, type SyncFields } from './fields';

export interface MergeResult {
	merged: SyncFields;
	conflicts: { field: SyncField; local: unknown; remote: unknown }[];
}

/** Ohne Rückfrage: Reihenfolge vom Server, Verschiebe-Zähler das Maximum. */
const AUTO: Partial<Record<SyncField, (local: unknown, remote: unknown) => unknown>> = {
	sortOrder: (_l, r) => r,
	postponeCount: (l, r) => Math.max(Number(l) || 0, Number(r) || 0),
	completedAt: (_l, r) => r // wird unten passend zum Status gesetzt
};

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
		else if (AUTO[k]) merged[k] = AUTO[k](l, r);
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
