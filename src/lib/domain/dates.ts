/**
 * Datumshilfen. Daten werden als ISO-Text gespeichert: '2026-11-17' (ganztägig)
 * oder '2026-11-17T09:00' (mit Uhrzeit, lokale Zeit). So bleiben sie im CalDAV-Sync stabil.
 */
import {
	addDays,
	addMonths,
	format,
	isValid,
	nextMonday,
	parse,
	startOfMonth,
	differenceInCalendarDays
} from 'date-fns';
import { de } from 'date-fns/locale';
import type { DateValue } from './types';

export const ISO = 'yyyy-MM-dd';

export const toIsoDate = (d: Date) => format(d, ISO);
export const fromIsoDate = (s: string) => parse(s, ISO, new Date(0));

export const todayIso = (now: Date) => toIsoDate(now);

export function dateValueToDate(v: DateValue): Date {
	const d = fromIsoDate(v.date);
	if (v.time) {
		const [h, m] = v.time.split(':').map(Number);
		d.setHours(h, m, 0, 0);
	}
	return d;
}

/** Vergleich zweier DateValues (ganztägig zählt als 00:00). */
export function compareDateValue(a: DateValue, b: DateValue): number {
	return dateValueToDate(a).getTime() - dateValueToDate(b).getTime();
}

/** Tage von heute bis zum Datum (negativ = überfällig). */
export function daysFromToday(v: DateValue, now: Date): number {
	return differenceInCalendarDays(fromIsoDate(v.date), now);
}

export function isValidIsoDate(s: string) {
	return /^\d{4}-\d{2}-\d{2}$/.test(s) && isValid(fromIsoDate(s));
}

/** Kurze deutsche Darstellung: „heute“, „morgen“, „Fr., 15.12.“, ggf. mit Uhrzeit. */
export function formatDateValue(v: DateValue, now: Date): string {
	const diff = daysFromToday(v, now);
	const d = fromIsoDate(v.date);
	let label: string;
	if (diff === 0) label = 'heute';
	else if (diff === 1) label = 'morgen';
	else if (diff === -1) label = 'gestern';
	else if (diff > 1 && diff < 7) label = format(d, 'EEEE', { locale: de });
	else if (d.getFullYear() === now.getFullYear()) label = format(d, 'EEE, d.M.', { locale: de });
	else label = format(d, 'd.M.yyyy', { locale: de });
	return v.time ? `${label} ${v.time}` : label;
}

export const addDaysIso = (now: Date, n: number) => toIsoDate(addDays(now, n));
export const nextMondayIso = (now: Date) => toIsoDate(nextMonday(now));
export const firstOfNextMonthIso = (now: Date) => toIsoDate(startOfMonth(addMonths(now, 1)));
