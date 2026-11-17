/**
 * Wann soll die Inbox aufgeräumt werden? Reine Logik (testbar), ohne Datenbank und Oberfläche.
 *
 * Auslöser:
 *  - feste Zeiten, je mit Wochentagen (z. B. Mo–Fr 9:00)
 *  - Regeln: mindestens N Einträge in der Inbox, oder ein Eintrag älter als X Tage
 * Ein Auslöser gilt als „erledigt“, sobald die Inbox leer geräumt oder der Hinweis
 * weggeklickt wurde. Verpasste Zeiten von gestern zählen nicht nach.
 */
import { differenceInCalendarDays, format } from 'date-fns';

export type TriageMode = 'off' | 'suggest' | 'force';

export interface TriageTime {
	/** 'HH:mm' */
	time: string;
	/** Wochentage, 0 = Montag … 6 = Sonntag */
	days: number[];
}

export interface TriageSettings {
	mode: TriageMode;
	times: TriageTime[];
	/** Regel: ab so vielen Einträgen (null = Regel aus) */
	minCount: number | null;
	/** Regel: wenn ein Eintrag älter als so viele Tage ist (null = Regel aus) */
	olderThanDays: number | null;
	/** Wie lange „Später“ aufschiebt (Minuten) */
	snoozeMinutes: number;
}

export const DEFAULT_TRIAGE_SETTINGS: TriageSettings = {
	mode: 'off',
	times: [{ time: '09:00', days: [0, 1, 2, 3, 4] }],
	minCount: null,
	olderThanDays: null,
	snoozeMinutes: 15
};

/** Gespeicherter Zustand pro Gerät */
export interface TriageState {
	/** Schlüssel des zuletzt erledigten Auslösers, z. B. '2026-11-17 09:00' oder 'regel:2026-11-17' */
	done?: string;
	/** Bis wann aufgeschoben (ms) */
	snoozedUntil?: number;
	/** Für welchen Auslöser schon einmal aufgeschoben wurde (beim Erzwingen nur einmal möglich) */
	snoozedFor?: string;
}

export interface InboxStats {
	/** offene Einträge */
	count: number;
	/** Erstellzeit des ältesten Eintrags (ms) */
	oldest?: number;
}

export interface TriageDue {
	/** Schlüssel des Auslösers (zum Merken als erledigt) */
	key: string;
	reason: 'time' | 'count' | 'age';
	/** Bei festen Zeiten: die Uhrzeit */
	time?: string;
}

const weekday = (d: Date) => (d.getDay() + 6) % 7;

/** Ist jetzt aufräumen fällig? Liefert den Auslöser oder null. */
export function triageDue(
	now: Date,
	settings: TriageSettings,
	state: TriageState,
	inbox: InboxStats
): TriageDue | null {
	if (settings.mode === 'off' || inbox.count === 0) return null;
	if (state.snoozedUntil && now.getTime() < state.snoozedUntil) return null;

	const today = format(now, 'yyyy-MM-dd');
	const hhmm = format(now, 'HH:mm');

	// Feste Zeiten: der späteste heutige Zeitpunkt, der schon erreicht ist
	const passed = settings.times
		.filter((t) => t.days.includes(weekday(now)) && /^\d{2}:\d{2}$/.test(t.time) && t.time <= hhmm)
		.map((t) => t.time)
		.sort();
	const latest = passed.at(-1);
	if (latest) {
		const key = `${today} ${latest}`;
		if (state.done !== key && !(state.done && state.done > key && state.done.startsWith(today))) {
			return { key, reason: 'time', time: latest };
		}
	}

	// Regeln: höchstens einmal pro Tag
	const ruleKey = `regel:${today}`;
	if (state.done !== ruleKey) {
		if (settings.minCount && inbox.count >= settings.minCount) {
			return { key: ruleKey, reason: 'count' };
		}
		if (
			settings.olderThanDays &&
			inbox.oldest !== undefined &&
			differenceInCalendarDays(now, new Date(inbox.oldest)) > settings.olderThanDays
		) {
			return { key: ruleKey, reason: 'age' };
		}
	}
	return null;
}

/** Darf aufgeschoben werden? Beim Erzwingen nur einmal je Auslöser. */
export function canSnooze(settings: TriageSettings, state: TriageState, due: TriageDue) {
	return settings.mode !== 'force' || state.snoozedFor !== due.key;
}
