/**
 * Geplante Aufgaben als Termine im Kalender (VEVENT, RFC 5545) – reine Logik.
 *
 * Eine Aufgabe mit geplantem Datum (und Uhrzeit) wird zu einem Termin:
 *   - mit Uhrzeit: Beginn = geplante Zeit, Dauer = Zeitschätzung, sonst Standarddauer
 *   - ohne Uhrzeit: ganztägiger Eintrag (abschaltbar)
 * Die UID ist fest aus der Aufgaben-ID abgeleitet – derselbe Termin wird nur aktualisiert.
 */
import { addDays, addMinutes, format } from 'date-fns';
import { fromIsoDate } from './dates';
import type { Task } from './types';

export interface CalendarSettings {
	/** Dauer eines Termins ohne Zeitschätzung (Minuten) */
	durationMin: number;
	/** Aufgaben ohne Uhrzeit als ganztägigen Eintrag eintragen */
	allDay: boolean;
}

export const DEFAULT_CALENDAR_SETTINGS: CalendarSettings = { durationMin: 30, allDay: true };

export interface EventData {
	uid: string;
	taskId: string;
	summary: string;
	description: string;
	/** 'YYYY-MM-DD' */
	date: string;
	/** 'HH:mm' – fehlt bei ganztägigen Einträgen */
	time?: string;
	durationMin: number;
}

export const eventUid = (taskId: string) => `ordo-${taskId}`;

/** Termin zu einer Aufgabe – oder null, wenn sie (so) nicht in den Kalender gehört */
export function eventFor(
	task: Task,
	settings: CalendarSettings,
	context: { pool?: string; project?: string } = {}
): EventData | null {
	if (task.deletedAt || !task.scheduled) return null;
	const time = task.scheduled.time;
	if (!time && !settings.allDay) return null;
	const where = [context.pool, context.project].filter(Boolean).join(' › ');
	return {
		uid: eventUid(task.id),
		taskId: task.id,
		summary: task.title.trim() || 'Aufgabe',
		description: [task.notes.trim(), where ? `Ordo: ${where}` : 'Ordo']
			.filter(Boolean)
			.join('\n\n'),
		date: task.scheduled.date,
		time,
		durationMin: Math.max(5, task.estimateMin || settings.durationMin)
	};
}

/** Fingerabdruck – ändert sich nur, wenn sich der Termin ändert */
export const eventHash = (e: EventData) =>
	JSON.stringify([e.summary, e.description, e.date, e.time ?? '', e.durationMin]);

// ---------- iCalendar schreiben ----------

const escape = (s: string) =>
	s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Zeilen über 75 Bytes umbrechen (RFC 5545, 3.1) – ohne UTF-8-Zeichen zu zerteilen */
function fold(line: string) {
	const enc = new TextEncoder();
	if (enc.encode(line).length <= 75) return line;
	const parts: string[] = [];
	let cur = '';
	let len = 0;
	for (const ch of line) {
		const n = enc.encode(ch).length;
		if (len + n > (parts.length ? 74 : 75)) {
			parts.push(cur);
			cur = '';
			len = 0;
		}
		cur += ch;
		len += n;
	}
	parts.push(cur);
	return parts.join('\r\n ');
}

/** Lokale Zeit → UTC im iCalendar-Format (20261119T130000Z) */
const utc = (d: Date) =>
	d
		.toISOString()
		.replace(/[-:]/g, '')
		.replace(/\.\d{3}/, '');
const dateOnly = (d: Date) => format(d, 'yyyyMMdd');

export function writeEvent(e: EventData, now: Date): string {
	const day = fromIsoDate(e.date);
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Ordo//DE',
		'CALSCALE:GREGORIAN',
		'BEGIN:VEVENT',
		`UID:${e.uid}`,
		`DTSTAMP:${utc(now)}`
	];
	if (e.time) {
		const [h, m] = e.time.split(':').map(Number);
		const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
		lines.push(`DTSTART:${utc(start)}`, `DTEND:${utc(addMinutes(start, e.durationMin))}`);
		lines.push('TRANSP:OPAQUE');
	} else {
		lines.push(
			`DTSTART;VALUE=DATE:${dateOnly(day)}`,
			`DTEND;VALUE=DATE:${dateOnly(addDays(day, 1))}`
		);
		lines.push('TRANSP:TRANSPARENT');
	}
	lines.push(
		`SUMMARY:${escape(e.summary)}`,
		`DESCRIPTION:${escape(e.description)}`,
		`X-ORDO-TASK:${e.taskId}`,
		'END:VEVENT',
		'END:VCALENDAR'
	);
	return lines.map(fold).join('\r\n') + '\r\n';
}
