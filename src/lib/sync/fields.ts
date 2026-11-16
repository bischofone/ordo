/**
 * Die Felder einer Aufgabe, die per CalDAV synchronisiert werden – und ihr Vergleich.
 * Alles andere (collapsed, Zeitstempel, Tombstones) bleibt lokal.
 */
import type { Task } from '#lib/domain/types.ts';

export const SYNC_FIELDS = [
	'title',
	'notes',
	'priority',
	'due',
	'scheduled',
	'rrule',
	'status',
	'completedAt',
	'parentId',
	'blockedBy',
	'sortOrder',
	'projectId',
	'someday',
	'postponeCount',
	'estimateMin',
	'energy',
	'waitingFor'
] as const satisfies readonly (keyof Task)[];

export type SyncField = (typeof SYNC_FIELDS)[number];
export type SyncFields = Pick<Task, SyncField>;

export function pickSyncFields(t: SyncFields): SyncFields {
	const out = {} as Record<SyncField, unknown>;
	for (const k of SYNC_FIELDS) out[k] = t[k];
	return normalize(out as SyncFields);
}

/** Einheitliche Darstellung, damit Vergleiche nicht an `undefined` vs. fehlend scheitern. */
export function normalize(f: SyncFields): SyncFields {
	const out = { ...f };
	for (const k of SYNC_FIELDS) {
		if (out[k] === null && k !== 'priority' && k !== 'parentId' && k !== 'projectId') {
			delete (out as Record<string, unknown>)[k];
		}
		if (out[k] === undefined) delete (out as Record<string, unknown>)[k];
	}
	out.priority ??= null;
	out.parentId ??= null;
	out.projectId ??= null;
	out.blockedBy = [...(out.blockedBy ?? [])].sort();
	out.someday = !!out.someday;
	out.postponeCount ??= 0;
	out.notes ??= '';
	if (out.due && !out.due.time) out.due = { date: out.due.date };
	if (out.scheduled && !out.scheduled.time) out.scheduled = { date: out.scheduled.date };
	return out;
}

/** Stabiler Vergleich eines Feldes (Objekte mit sortierten Schlüsseln). */
export function sameValue(a: unknown, b: unknown) {
	return stable(a) === stable(b);
}

function stable(v: unknown): string {
	if (v === undefined || v === null) return 'null';
	if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
	if (typeof v === 'object') {
		const o = v as Record<string, unknown>;
		return `{${Object.keys(o)
			.filter((k) => o[k] !== undefined)
			.sort()
			.map((k) => `${k}:${stable(o[k])}`)
			.join(',')}}`;
	}
	return JSON.stringify(v);
}

export function changedFields(a: SyncFields, b: SyncFields): SyncField[] {
	return SYNC_FIELDS.filter((k) => !sameValue(a[k], b[k]));
}
