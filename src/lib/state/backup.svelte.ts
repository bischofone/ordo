/**
 * Sicherung in der App: Datei erzeugen und herunterladen, wiederherstellen, rückgängig machen.
 * Vor jedem Wiederherstellen wird der bisherige Stand auf dem Gerät aufgehoben (eigene kleine
 * Datenbank „ordo-sicherheitskopie“) – ein Fehlgriff lässt sich so zurücknehmen.
 */
import Dexie, { type EntityTable } from 'dexie';
import {
	applyRestore,
	backupFileName,
	collect,
	prepareRestore,
	serialize,
	type BackupData,
	type PreparedRestore
} from '#lib/backup/backup.ts';
import { db, repo } from './app';
import { APPEARANCE_KEY } from './appearance.svelte.ts';
import { APP_COMMIT, APP_VERSION } from './version.ts';

export const LAST_BACKUP_KEY = 'lastBackupAt';
const APP = { version: APP_VERSION, commit: APP_COMMIT };

/** Was im Browser-Speicher statt in der Datenbank liegt */
function readLocal(): Record<string, unknown> {
	try {
		const a = localStorage.getItem(APPEARANCE_KEY);
		return a ? { [APPEARANCE_KEY]: JSON.parse(a) } : {};
	} catch {
		return {};
	}
}
function writeLocal(local: Record<string, unknown>) {
	try {
		if (local[APPEARANCE_KEY])
			localStorage.setItem(APPEARANCE_KEY, JSON.stringify(local[APPEARANCE_KEY]));
	} catch {
		/* privater Modus o. ä. */
	}
}

export async function downloadBackup(opts: { password?: string; secrets: boolean }) {
	const data = await collect(db, {
		secrets: !!opts.password && opts.secrets,
		app: APP,
		local: readLocal()
	});
	const text = await serialize(data, opts.password || undefined);
	const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
	const a = document.createElement('a');
	a.href = url;
	a.download = backupFileName(data, !!opts.password);
	document.body.append(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
	await repo.setSetting(LAST_BACKUP_KEY, Date.now());
}

// ---------- Sicherheitskopie vor dem Wiederherstellen ----------

interface Snapshot {
	id: 'vorher';
	createdAt: number;
	data: BackupData;
}
class SafetyDB extends Dexie {
	snapshots!: EntityTable<Snapshot, 'id'>;
	constructor() {
		super('ordo-sicherheitskopie');
		this.version(1).stores({ snapshots: 'id' });
	}
}
const safety = new SafetyDB();

export const snapshotInfo = $state<{ createdAt: number | null }>({ createdAt: null });
export async function loadSnapshotInfo() {
	snapshotInfo.createdAt = (await safety.snapshots.get('vorher'))?.createdAt ?? null;
}

export { prepareRestore };

/** Alle Daten durch die (geprüfte) Sicherung ersetzen; der bisherige Stand wird aufgehoben. */
export async function restore(prepared: PreparedRestore) {
	const before = await collect(db, { secrets: true, app: APP, local: readLocal() });
	await safety.snapshots.put({ id: 'vorher', createdAt: Date.now(), data: before });
	await applyRestore(db, prepared);
	writeLocal(prepared.data.local ?? {});
	location.reload();
}

/** Den Stand von vor der letzten Wiederherstellung zurückholen */
export async function undoRestore() {
	const snap = await safety.snapshots.get('vorher');
	if (!snap) return;
	await applyRestore(db, await prepareRestore(snap.data));
	writeLocal(snap.data.local ?? {});
	await safety.snapshots.delete('vorher');
	location.reload();
}
