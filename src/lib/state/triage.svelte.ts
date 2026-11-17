/**
 * Aufräum-Zeitplan der Inbox (pro Gerät): Einstellungen, Zustand und die aktuelle Fälligkeit.
 * Die Regeln stehen in domain/triage.ts.
 */
import { liveQuery } from 'dexie';
import {
	DEFAULT_TRIAGE_SETTINGS,
	type TriageDue,
	type TriageSettings,
	type TriageState
} from '#lib/domain/triage.ts';
import { db } from './app';

export const TRIAGE_SETTINGS_KEY = 'triageSettings';
const TRIAGE_STATE_KEY = 'triageState';

class TriageUi {
	settings = $state.raw<TriageSettings>(DEFAULT_TRIAGE_SETTINGS);
	state = $state.raw<TriageState>({});
	/** Aktuell fälliger Auslöser (wird im Layout berechnet) */
	due = $state.raw<TriageDue | null>(null);
	loaded = $state(false);

	/** Erzwungen und gerade fällig → Aufräumen ist Pflicht */
	get forced() {
		return this.settings.mode === 'force' && !!this.due;
	}
}
export const triage = new TriageUi();

export function watchTriage() {
	const sub = liveQuery(async () => ({
		settings: (await db.settings.get(TRIAGE_SETTINGS_KEY))?.value as
			Partial<TriageSettings> | undefined,
		state: (await db.settings.get(TRIAGE_STATE_KEY))?.value as TriageState | undefined
	})).subscribe(({ settings, state }) => {
		triage.settings = { ...DEFAULT_TRIAGE_SETTINGS, ...settings };
		triage.state = state ?? {};
		triage.loaded = true;
	});
	return () => sub.unsubscribe();
}

export async function saveTriageSettings(patch: Partial<TriageSettings>) {
	await db.settings.put({ key: TRIAGE_SETTINGS_KEY, value: { ...triage.settings, ...patch } });
}

async function saveState(patch: Partial<TriageState>) {
	const next = { ...triage.state, ...patch };
	triage.state = next;
	await db.settings.put({ key: TRIAGE_STATE_KEY, value: next });
}

/** Auslöser erledigt (Inbox leer geräumt oder Hinweis weggeklickt) */
export const markTriageDone = (key: string) => saveState({ done: key, snoozedUntil: undefined });

/** Später erinnern */
export const snoozeTriage = (due: TriageDue) =>
	saveState({
		snoozedUntil: Date.now() + triage.settings.snoozeMinutes * 60_000,
		snoozedFor: due.key
	});
