/**
 * Geplante Aufgaben eines Pools als Termine in einen Kalender schreiben (nur in eine Richtung:
 * Ordo → Kalender). Ordo ist dabei die Quelle – ändert jemand den Termin im Kalender, wird er
 * beim nächsten Abgleich wieder auf den Stand der Aufgabe gebracht.
 *
 *   - Aufgabe geplant (offen)        → Termin anlegen bzw. aktualisieren
 *   - Datum entfernt / gelöscht      → Termin löschen
 *   - erledigt                       → Termin bleibt stehen (er hat ja stattgefunden)
 *   - anderer Kalender gewählt       → Termin dort löschen, im neuen anlegen
 */
import {
	DEFAULT_CALENDAR_SETTINGS,
	eventFor,
	eventHash,
	writeEvent,
	type CalendarSettings
} from '#lib/domain/events.ts';
import { isOpen, type Account, type Pool } from '#lib/domain/types.ts';
import type { TasksDB } from '#lib/db/db.ts';
import { PreconditionFailed, type CaldavClient } from './caldav';
import type { EventRecord } from './model';

export const CALENDAR_SETTINGS_KEY = 'calendarSettings';

export interface CalendarReport {
	written: number;
	deleted: number;
}

const slash = (url: string) => (url.endsWith('/') ? url : `${url}/`);

export async function pushCalendar(
	db: TasksDB,
	pool: Pool,
	clientFor: (account: Account) => CaldavClient,
	now: Date
): Promise<CalendarReport> {
	const report: CalendarReport = { written: 0, deleted: 0 };
	const settings: CalendarSettings = {
		...DEFAULT_CALENDAR_SETTINGS,
		...((await db.settings.get(CALENDAR_SETTINGS_KEY))?.value as Partial<CalendarSettings>)
	};
	const target = pool.settings.calendar;
	const tasks = await db.tasks.where('poolId').equals(pool.id).toArray();
	const byId = new Map(tasks.map((t) => [t.id, t]));
	const projects = new Map(
		(await db.projects.where('poolId').equals(pool.id).toArray()).map((p) => [p.id, p.name])
	);
	const records = new Map(
		(await db.eventRecords.where('poolId').equals(pool.id).toArray()).map((r) => [r.taskId, r])
	);
	const clients = new Map<string, CaldavClient | null>();
	const client = async (accountId: string) => {
		if (!clients.has(accountId)) {
			const account = await db.accounts.get(accountId);
			clients.set(accountId, account ? clientFor(account) : null);
		}
		return clients.get(accountId) ?? null;
	};

	const remove = async (r: EventRecord) => {
		const c = await client(r.accountId);
		if (c) {
			await c.deleteItem(r.url, r.etag).catch(async (e) => {
				if (e instanceof PreconditionFailed) await c.deleteItem(r.url);
				else throw e;
			});
		}
		await db.eventRecords.delete(r.taskId);
		records.delete(r.taskId);
		report.deleted++;
	};

	// 1. Was nicht mehr in diesen Kalender gehört, entfernen
	for (const r of [...records.values()]) {
		const task = byId.get(r.taskId);
		const wrongCalendar = !target || r.calendarUrl !== target.url;
		const gone = !task || task.deletedAt;
		const unplanned = task && isOpen(task) && !eventFor(task, settings); /* kein Datum (mehr) */
		if (wrongCalendar || gone || unplanned) await remove(r);
	}
	if (!target) return report;

	// 2. Offene, geplante Aufgaben eintragen bzw. aktualisieren
	const c = await client(target.accountId);
	if (!c) throw new Error('Das Konto für den Kalender fehlt.');
	for (const task of tasks) {
		if (task.deletedAt || !isOpen(task)) continue;
		const ev = eventFor(task, settings, {
			pool: pool.name,
			project: task.projectId ? projects.get(task.projectId) : undefined
		});
		if (!ev) continue;
		const hash = eventHash(ev);
		const rec = records.get(task.id);
		if (rec?.hash === hash) continue;

		const url = rec?.url ?? `${slash(target.url)}${ev.uid}.ics`;
		const ics = writeEvent(ev, now);
		let etag: string;
		try {
			etag = await c.putItem(url, ics, rec ? { etag: rec.etag } : { create: true });
		} catch (e) {
			if (!(e instanceof PreconditionFailed)) throw e;
			// Im Kalender verändert (oder schon vorhanden) → aktuellen Stand holen und überschreiben
			const current = await c.etagOf(url);
			etag = await c.putItem(url, ics, current ? { etag: current } : { create: true });
		}
		await db.eventRecords.put({
			taskId: task.id,
			poolId: pool.id,
			url,
			etag,
			calendarUrl: target.url,
			accountId: target.accountId,
			hash
		});
		report.written++;
	}
	return report;
}
