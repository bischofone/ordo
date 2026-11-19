/**
 * Datenintegrität: Prüft, ob die gespeicherten Daten zur aktuellen App passen – nach einer
 * Migration, beim Wiederherstellen einer Sicherung und in den Tests mit echten Datenbanken
 * früherer Versionen (src/lib/db/fixtures). Liefert eine Liste verständlicher Befunde;
 * leer = alles in Ordnung. Ändert nichts.
 */
import type { Account, Pool, Project, Task, TimeEntry, WorkDay } from '#lib/domain/types.ts';

export interface IntegrityData {
	pools: readonly Pool[];
	projects: readonly Project[];
	tasks: readonly Task[];
	accounts?: readonly Account[];
	workDays?: readonly WorkDay[];
}

const STATUS = ['needs-action', 'in-process', 'completed', 'cancelled'];
const ENERGY = ['low', 'mid', 'high'];
const isIsoDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isTime = (v: unknown) => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v);
const isDateValue = (v: unknown) =>
	!!v &&
	typeof v === 'object' &&
	isIsoDate((v as { date?: unknown }).date) &&
	((v as { time?: unknown }).time === undefined || isTime((v as { time?: unknown }).time));
const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

function checkEntry(e: TimeEntry) {
	return !!e && typeof e.id === 'string' && isIsoDate(e.date) && isNum(e.minutes) && e.minutes >= 0;
}

export function checkIntegrity(d: IntegrityData): string[] {
	const problems: string[] = [];
	const say = (what: string, id: string, msg: string) => problems.push(`${what} ${id}: ${msg}`);

	const poolIds = new Set<string>();
	for (const p of d.pools) {
		if (typeof p.id !== 'string' || !p.id) say('Pool', String(p.id), 'ohne ID');
		poolIds.add(p.id);
		if (typeof p.name !== 'string') say('Pool', p.id, 'ohne Namen');
		if (p.kind !== 'pool' && p.kind !== 'inbox') say('Pool', p.id, `unbekannte Art „${p.kind}“`);
		if (typeof p.sortOrder !== 'string') say('Pool', p.id, 'ohne Reihenfolge');
		if (typeof p.archived !== 'boolean') say('Pool', p.id, '„archiviert“ fehlt');
		if (!p.settings || typeof p.settings !== 'object') say('Pool', p.id, 'ohne Einstellungen');
		else if (!p.settings.ai || typeof p.settings.ai.enabled !== 'boolean')
			say('Pool', p.id, 'KI-Einstellung fehlt');
		if (p.caldav && (!p.caldav.accountId || !p.caldav.collectionUrl))
			say('Pool', p.id, 'unvollständige Sync-Zuordnung');
	}
	if (!d.pools.some((p) => p.kind === 'inbox')) problems.push('Es gibt keine Inbox.');

	const projectIds = new Set<string>();
	for (const p of d.projects) {
		projectIds.add(p.id);
		if (!poolIds.has(p.poolId)) say('Projekt', p.id, 'gehört zu keinem vorhandenen Pool');
		if (typeof p.name !== 'string') say('Projekt', p.id, 'ohne Namen');
	}

	const taskIds = new Set(d.tasks.map((t) => t.id));
	for (const t of d.tasks) {
		const id = t.id;
		if (typeof id !== 'string' || !id) say('Aufgabe', String(id), 'ohne ID');
		if (typeof t.title !== 'string') say('Aufgabe', id, 'ohne Titel');
		if (typeof t.notes !== 'string') say('Aufgabe', id, 'Notizen fehlen');
		if (!poolIds.has(t.poolId)) say('Aufgabe', id, 'gehört zu keinem vorhandenen Pool');
		if (t.projectId === undefined) say('Aufgabe', id, 'Projektfeld fehlt');
		else if (t.projectId !== null && !projectIds.has(t.projectId) && !t.deletedAt)
			say('Aufgabe', id, 'verweist auf ein fehlendes Projekt');
		if (t.parentId !== null && typeof t.parentId !== 'string')
			say('Aufgabe', id, 'ungültiges Elternteil');
		if (typeof t.sortOrder !== 'string') say('Aufgabe', id, 'ohne Reihenfolge');
		if (!STATUS.includes(t.status)) say('Aufgabe', id, `unbekannter Status „${t.status}“`);
		if (t.priority !== null && ![1, 2, 3].includes(t.priority))
			say('Aufgabe', id, `ungültige Priorität „${t.priority}“`);
		if (t.due && !isDateValue(t.due)) say('Aufgabe', id, 'ungültiges Fälligkeitsdatum');
		if (t.scheduled && !isDateValue(t.scheduled)) say('Aufgabe', id, 'ungültiges geplantes Datum');
		if (t.estimateMin !== undefined && !isNum(t.estimateMin))
			say('Aufgabe', id, 'ungültige Zeitschätzung');
		if (t.energy !== undefined && !ENERGY.includes(t.energy))
			say('Aufgabe', id, 'ungültige Energie');
		if (typeof t.someday !== 'boolean') say('Aufgabe', id, '„Irgendwann“ fehlt');
		if (!isNum(t.postponeCount)) say('Aufgabe', id, 'Verschiebe-Zähler fehlt');
		if (!Array.isArray(t.blockedBy)) say('Aufgabe', id, '„blockiert durch“ fehlt');
		if (typeof t.collapsed !== 'boolean') say('Aufgabe', id, '„eingeklappt“ fehlt');
		if (!isNum(t.createdAt) || !isNum(t.updatedAt)) say('Aufgabe', id, 'Zeitstempel fehlen');
		if (t.timeEntries !== undefined) {
			if (!Array.isArray(t.timeEntries)) say('Aufgabe', id, 'Zeiteinträge sind keine Liste');
			else if (!t.timeEntries.every(checkEntry)) say('Aufgabe', id, 'ungültiger Zeiteintrag');
		}
		// Eltern, die fehlen, zeigt die App als oberste Aufgabe (kein Datenverlust) – nur Zyklen sind Fehler
		const seen = new Set<string>([id]);
		let p = t.parentId;
		while (p && taskIds.has(p)) {
			if (seen.has(p)) {
				say('Aufgabe', id, 'steckt in einem Kreis aus Unteraufgaben');
				break;
			}
			seen.add(p);
			p = d.tasks.find((x) => x.id === p)?.parentId ?? null;
		}
	}

	for (const a of d.accounts ?? []) {
		if (!a.id || typeof a.serverUrl !== 'string' || typeof a.username !== 'string')
			say('Konto', String(a.id), 'unvollständig');
	}
	for (const w of d.workDays ?? []) {
		if (!isIsoDate(w.date) || !isNum(w.minutes)) say('Arbeitstag', String(w.date), 'ungültig');
	}
	return problems;
}
