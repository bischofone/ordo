/** Lokale Buchführung des Syncs. */
import type { SyncField, SyncFields } from './fields';

/** Sync-Zustand eines Pools (einer CalDAV-Liste) */
export interface SyncState {
	poolId: string;
	syncToken?: string;
	lastSync?: number;
	lastError?: string;
	/** Name/Farbe der Liste beim letzten Abgleich (zum Erkennen, wer was geändert hat) */
	meta?: { name: string; color?: string };
}

/** Stand einer Aufgabe beim letzten erfolgreichen Abgleich */
export interface SyncRecord {
	taskId: string;
	poolId: string;
	url: string;
	etag: string;
	/** Zuletzt vom Server geladenes/gespeichertes VTODO – wird beim Schreiben verändert */
	ics: string;
	/** Synchronisierte Felder beim letzten Abgleich (Basis für das Zusammenführen pro Feld) */
	base: SyncFields;
	/** Ungelöster Konflikt – die Aufgabe wird erst nach der Entscheidung hochgeladen */
	conflict?: boolean;
}

/** Ein Feld, das auf beiden Seiten unterschiedlich geändert wurde */
export interface Conflict {
	id: string;
	taskId: string;
	field: SyncField;
	local: unknown;
	remote: unknown;
	createdAt: number;
}
