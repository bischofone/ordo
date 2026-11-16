/**
 * Automatischer Sync im Hintergrund:
 *   - beim Start, alle 5 Minuten (solange die App sichtbar ist), wenn das Netz zurückkommt,
 *   - und ein paar Sekunden nach lokalen Änderungen.
 */
import { liveQuery } from 'dexie';
import { createSyncEngine, errorText } from '#lib/sync/engine.ts';
import { db } from './app';

export const sync = createSyncEngine(db);

class SyncStatus {
	running = $state(false);
	lastRun = $state<number | null>(null);
	error = $state<string | null>(null);
	/** Gibt es überhaupt verbundene Pools? */
	enabled = $state(false);
}
export const syncStatus = new SyncStatus();

const INTERVAL = 5 * 60_000;
const DEBOUNCE = 3_000;
let again = false;
let changedDuringRun = false;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;

export async function syncNow() {
	if (syncStatus.running) {
		again = true;
		return;
	}
	// Sperre sofort setzen – vor dem ersten await, sonst können zwei Läufe gleichzeitig starten.
	syncStatus.running = true;
	try {
		const bound = (await db.pools.toArray()).some((p) => p.caldav);
		syncStatus.enabled = bound;
		if (!bound || !navigator.onLine) return;
		const results = await sync.syncAll();
		const errors = Object.values(results)
			.filter((r): r is { error: string } => 'error' in r)
			.map((r) => r.error);
		syncStatus.error = errors[0] ?? null;
	} catch (e) {
		syncStatus.error = errorText(e);
	} finally {
		syncStatus.running = false;
		syncStatus.lastRun = Date.now();
		if (again) {
			again = false;
			void syncNow();
		} else if (changedDuringRun) {
			// Während des Laufs wurde etwas geändert (vom Sync selbst oder vom Nutzer) →
			// sicherheitshalber noch ein Lauf. Ein Lauf ohne Neues schreibt keine Aufgaben,
			// daher endet das von selbst.
			schedule();
		}
		changedDuringRun = false;
	}
}

function schedule() {
	clearTimeout(debounceTimer);
	debounceTimer = setTimeout(() => void syncNow(), DEBOUNCE);
}

/** Startet die automatische Synchronisation. Gibt eine Aufräumfunktion zurück. */
export function startAutoSync() {
	void syncNow();
	const timer = setInterval(() => {
		if (document.visibilityState === 'visible') void syncNow();
	}, INTERVAL);
	const onVisible = () => document.visibilityState === 'visible' && void syncNow();
	const onOnline = () => void syncNow();
	document.addEventListener('visibilitychange', onVisible);
	window.addEventListener('online', onOnline);

	// Lokale Änderungen beobachten (Aufgaben, Projekte, Pools)
	let first = true;
	const sub = liveQuery(async () => [
		(await db.tasks.orderBy('updatedAt').last())?.updatedAt,
		await db.tasks.count(),
		(await db.projects.toArray()).reduce((m, p) => Math.max(m, p.updatedAt), 0),
		(await db.pools.toArray()).reduce((m, p) => Math.max(m, p.updatedAt), 0)
	]).subscribe(() => {
		if (first) {
			first = false;
			return;
		}
		if (syncStatus.running) changedDuringRun = true;
		else schedule();
	});

	return () => {
		clearInterval(timer);
		clearTimeout(debounceTimer);
		document.removeEventListener('visibilitychange', onVisible);
		window.removeEventListener('online', onOnline);
		sub.unsubscribe();
	};
}
