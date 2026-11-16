/**
 * Zeiterfassung: Eingaben verstehen, Dauern anzeigen, Zeiträume und Auswertung.
 * Reine Logik ohne Datenbank und Oberfläche.
 */
import {
	addDays,
	addMonths,
	eachDayOfInterval,
	endOfMonth,
	endOfWeek,
	format,
	getISOWeek,
	startOfMonth,
	startOfWeek
} from 'date-fns';
import { de } from 'date-fns/locale';
import { fromIsoDate, toIsoDate } from './dates';
import type { Task, TimeEntry } from './types';

// ---------- Eingabe ----------

const NUM = String.raw`\d+(?:[.,]\d+)?`;
const H = String.raw`(?:h|std\.?|stunden?)`;
const M = String.raw`(?:m|min\.?|minuten?)`;

const num = (s: string) => Number(s.replace(',', '.'));

/**
 * Versteht eine Zeitangabe und liefert Minuten (oder null, wenn unverständlich).
 *   0:30 · 1:15            Stunden:Minuten
 *   0,5h · 1.5 h · 2 std   Stunden
 *   30m · 45 min           Minuten
 *   1h 30m · 1h30          beides
 *   0,5 · 1.25             Kommazahl ohne Einheit = Stunden
 *   30 · 90                ganze Zahl ohne Einheit = Minuten
 */
export function parseDuration(input: string): number | null {
	const s = input.trim().toLowerCase();
	if (!s) return null;
	let minutes: number | null = null;
	let m: RegExpExecArray | null;

	if ((m = /^(\d+):([0-5]?\d)$/.exec(s))) {
		minutes = Number(m[1]) * 60 + Number(m[2]);
	} else if ((m = new RegExp(`^(${NUM})\\s*${H}\\s*(?:(\\d+)\\s*${M}?)?$`).exec(s))) {
		minutes = num(m[1]) * 60 + (m[2] ? Number(m[2]) : 0);
	} else if ((m = new RegExp(`^(${NUM})\\s*${M}$`).exec(s))) {
		minutes = num(m[1]);
	} else if ((m = /^\d+[.,]\d+$/.exec(s))) {
		minutes = num(m[0]) * 60;
	} else if ((m = /^\d+$/.exec(s))) {
		minutes = Number(m[0]);
	}
	if (minutes === null || !Number.isFinite(minutes)) return null;
	minutes = Math.round(minutes);
	return minutes > 0 && minutes <= 24 * 60 ? minutes : null;
}

/** 90 → „1:30“ */
export function formatDuration(minutes: number): string {
	const m = Math.max(0, Math.round(minutes));
	return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/** Laufender Timer: 3725 s → „1:02:05“ */
export function formatElapsed(ms: number): string {
	const s = Math.max(0, Math.floor(ms / 1000));
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** Unter dieser Laufzeit wird ein Timer beim Stoppen verworfen (versehentlicher Klick). */
export const MIN_TIMER_MS = 30_000;

/** Gestoppter Timer → Minuten (mindestens 1), oder null, wenn zu kurz. */
export function timerMinutes(startMs: number, endMs: number): number | null {
	const elapsed = endMs - startMs;
	if (elapsed < MIN_TIMER_MS) return null;
	return Math.max(1, Math.round(elapsed / 60_000));
}

/**
 * Eingabe im Zeitfeld der Aufgabenzeile:
 *   „1:30“ / „0,5h“  → Gesamtzeit auf diesen Wert setzen
 *   „+0:15“          → 15 Minuten dazu
 *   „-10“            → 10 Minuten weniger
 *   leer oder „0“    → alles löschen
 * Liefert die neue Gesamtzeit in Minuten (oder null, wenn unverständlich).
 */
export function parseTotalInput(input: string, current: number): number | null {
	const s = input.trim();
	if (s === '' || /^0+(?:[:.,]0+)?\s*(?:h|m|min|std)?\.?$/i.test(s)) return 0;
	const sign = s[0] === '+' ? 1 : s[0] === '-' || s[0] === '−' ? -1 : 0;
	const minutes = parseDuration(sign ? s.slice(1) : s);
	if (minutes === null) return null;
	return sign ? Math.max(0, current + sign * minutes) : minutes;
}

/**
 * Gesamtzeit einer Aufgabe auf `target` Minuten bringen, ohne die Tage durcheinanderzubringen:
 * Mehr Zeit zählt für heute (vorhandener Eintrag von heute wird erhöht, sonst kommt einer dazu).
 * Weniger Zeit wird zuerst bei heute abgezogen, dann bei den jüngsten Tagen.
 */
export function withTotal(
	entries: readonly TimeEntry[] | undefined,
	target: number,
	today: string,
	newId: () => string
): TimeEntry[] {
	const list = (entries ?? []).map((e) => ({ ...e }));
	let diff = Math.round(target) - entryMinutes(list);
	if (diff > 0) {
		const todays = list.filter((e) => e.date === today).at(-1);
		if (todays) todays.minutes += diff;
		else list.push({ id: newId(), date: today, minutes: diff });
		return list;
	}
	// jüngster Tag zuerst; bei gleichem Tag der zuletzt angelegte Eintrag zuerst
	const order = list
		.map((e, i) => ({ e, i }))
		.sort((a, b) => (a.e.date < b.e.date ? 1 : a.e.date > b.e.date ? -1 : b.i - a.i));
	for (const { e } of order) {
		if (diff >= 0) break;
		const take = Math.min(e.minutes, -diff);
		e.minutes -= take;
		diff += take;
	}
	return list.filter((e) => e.minutes > 0);
}

// ---------- Summen ----------

export const entryMinutes = (entries: readonly TimeEntry[] | undefined) =>
	(entries ?? []).reduce((sum, e) => sum + e.minutes, 0);

/** Erfasste Minuten je Aufgabe einschließlich aller Unteraufgaben. */
export function totalsWithChildren(tasks: readonly Task[]): Map<string, number> {
	const own = new Map(tasks.map((t) => [t.id, entryMinutes(t.timeEntries)]));
	const parent = new Map(tasks.map((t) => [t.id, t.parentId]));
	const total = new Map(own);
	for (const t of tasks) {
		const minutes = own.get(t.id)!;
		if (!minutes) continue;
		let p = t.parentId;
		for (let i = 0; p && i < 50; i++) {
			if (total.has(p)) total.set(p, total.get(p)! + minutes);
			p = parent.get(p) ?? null;
		}
	}
	return total;
}

// ---------- Zeiträume ----------

export type PeriodKind = 'day' | 'week' | 'month';

export interface Period {
	kind: PeriodKind;
	/** erster und letzter Tag (einschließlich), 'YYYY-MM-DD' */
	from: string;
	to: string;
	label: string;
	days: string[];
}

export function periodOf(kind: PeriodKind, anchorIso: string): Period {
	const d = fromIsoDate(anchorIso);
	let start = d;
	let end = d;
	let label = format(d, 'EEEE, d. MMMM yyyy', { locale: de });
	if (kind === 'week') {
		start = startOfWeek(d, { weekStartsOn: 1 });
		end = endOfWeek(d, { weekStartsOn: 1 });
		label = `KW ${getISOWeek(d)} · ${format(start, 'd.M.')}–${format(end, 'd.M.yyyy')}`;
	} else if (kind === 'month') {
		start = startOfMonth(d);
		end = endOfMonth(d);
		label = format(d, 'MMMM yyyy', { locale: de });
	}
	return {
		kind,
		from: toIsoDate(start),
		to: toIsoDate(end),
		label,
		days: eachDayOfInterval({ start, end }).map(toIsoDate)
	};
}

/** Anker für den vorherigen/nächsten Zeitraum. */
export function shiftPeriod(kind: PeriodKind, anchorIso: string, dir: -1 | 1): string {
	const d = fromIsoDate(anchorIso);
	if (kind === 'day') return toIsoDate(addDays(d, dir));
	if (kind === 'week') return toIsoDate(addDays(d, 7 * dir));
	return toIsoDate(addMonths(d, dir));
}

// ---------- Auswertung ----------

export interface ReportEntry extends TimeEntry {
	task: Task;
}

export interface ReportGroup {
	poolId: string;
	projectId: string | null;
	minutes: number;
}

export interface Report {
	total: number;
	/** Minuten je Tag des Zeitraums (auch Tage ohne Einträge) */
	byDay: { date: string; minutes: number }[];
	/** je Pool/Projekt, absteigend nach Zeit */
	byGroup: ReportGroup[];
	/** je Aufgabe, absteigend nach Zeit */
	byTask: { task: Task; minutes: number }[];
	/** alle Einträge, neueste Tage zuerst */
	entries: ReportEntry[];
}

export function buildReport(
	tasks: readonly Task[],
	period: Pick<Period, 'from' | 'to' | 'days'>,
	poolIds?: readonly string[]
): Report {
	const entries: ReportEntry[] = [];
	for (const task of tasks) {
		if (task.deletedAt || (poolIds?.length && !poolIds.includes(task.poolId))) continue;
		for (const e of task.timeEntries ?? []) {
			if (e.date >= period.from && e.date <= period.to) entries.push({ ...e, task });
		}
	}
	entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

	const day = new Map(period.days.map((d) => [d, 0]));
	const group = new Map<string, ReportGroup>();
	const perTask = new Map<string, { task: Task; minutes: number }>();
	let total = 0;
	for (const e of entries) {
		total += e.minutes;
		day.set(e.date, (day.get(e.date) ?? 0) + e.minutes);
		const key = `${e.task.poolId}|${e.task.projectId ?? ''}`;
		const g = group.get(key) ?? { poolId: e.task.poolId, projectId: e.task.projectId, minutes: 0 };
		g.minutes += e.minutes;
		group.set(key, g);
		const t = perTask.get(e.task.id) ?? { task: e.task, minutes: 0 };
		t.minutes += e.minutes;
		perTask.set(e.task.id, t);
	}
	return {
		total,
		byDay: period.days.map((date) => ({ date, minutes: day.get(date) ?? 0 })),
		byGroup: [...group.values()].sort((a, b) => b.minutes - a.minutes),
		byTask: [...perTask.values()].sort((a, b) => b.minutes - a.minutes),
		entries
	};
}
