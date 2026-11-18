/** Listen auf den CalDAV-Servern, je Konto – gemeinsam für Einstellungen und Pool-Seiten. */
import type { Calendar, TodoList } from '#lib/sync/caldav.ts';
import { errorText } from '#lib/sync/engine.ts';
import { sync } from './sync.svelte';

class RemoteLists {
	byAccount = $state<Record<string, TodoList[]>>({});
	errors = $state<Record<string, string>>({});
	/** Kalender für Termine, je Konto */
	calendars = $state<Record<string, Calendar[]>>({});
	calendarErrors = $state<Record<string, string>>({});
}
export const remoteLists = new RemoteLists();

const requested: string[] = [];

export async function loadLists(accountId: string) {
	if (!requested.includes(accountId)) requested.push(accountId);
	try {
		remoteLists.byAccount[accountId] = await sync.remoteLists(accountId);
		delete remoteLists.errors[accountId];
	} catch (e) {
		remoteLists.errors[accountId] = errorText(e);
	}
}

/** Lädt die Listen jedes Kontos einmal (weitere Aufrufe tun nichts). */
export function ensureLists(accountIds: string[]) {
	for (const id of accountIds) if (!requested.includes(id)) void loadLists(id);
}

const requestedCalendars: string[] = [];

export async function loadCalendars(accountId: string) {
	if (!requestedCalendars.includes(accountId)) requestedCalendars.push(accountId);
	try {
		remoteLists.calendars[accountId] = await sync.remoteCalendars(accountId);
		delete remoteLists.calendarErrors[accountId];
	} catch (e) {
		remoteLists.calendarErrors[accountId] = errorText(e);
	}
}

/** Lädt die Kalender jedes Kontos einmal. */
export function ensureCalendars(accountIds: string[]) {
	for (const id of accountIds) if (!requestedCalendars.includes(id)) void loadCalendars(id);
}
