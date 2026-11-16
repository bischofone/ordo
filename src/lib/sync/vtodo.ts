/**
 * Abbildung Aufgabe ⇄ VTODO (RFC 5545) mit ical.js.
 *
 * Grundsatz: Beim Schreiben wird immer das zuletzt vom Server geladene VTODO verändert –
 * und zwar nur die Eigenschaften, die sich geändert haben. Alles, was andere Programme
 * (Tasks.org, Thunderbird, …) hineingeschrieben haben, bleibt so erhalten: unbekannte
 * Eigenschaften, Erinnerungen (VALARM), Zeitzonen, Kategorien usw.
 */
import ICAL from 'ical.js';
import type {
	DateValue,
	Energy,
	Priority,
	TaskStatus,
	TimeEntry,
	WaitingFor
} from '#lib/domain/types.ts';
import { changedFields, normalize, type SyncField, type SyncFields } from './fields';

export const X = {
	sort: 'X-MYTASKS-SORT',
	project: 'X-MYTASKS-PROJECT',
	someday: 'X-MYTASKS-SOMEDAY',
	postponed: 'X-MYTASKS-POSTPONED',
	estimate: 'X-MYTASKS-ESTIMATE',
	energy: 'X-MYTASKS-ENERGY',
	waiting: 'X-MYTASKS-WAITING',
	time: 'X-MYTASKS-TIME'
} as const;

const PRODID = '-//Tasks App//DE';

export interface ParsedTodo {
	uid: string;
	fields: SyncFields;
	/** Ohne eigenen Sortierschlüssel (z. B. von Tasks.org angelegt) */
	hasOwnSort: boolean;
	/** X-APPLE-SORT-ORDER, falls vorhanden (für die erste Sortierung fremder Aufgaben) */
	appleSort?: number;
	created?: number;
}

// ---------- Hilfen ----------

const pad = (n: number) => String(n).padStart(2, '0');

function registerTimezones(vcal: ICAL.Component) {
	for (const tz of vcal.getAllSubcomponents('vtimezone')) {
		const id = tz.getFirstPropertyValue('tzid') as string | null;
		if (id && !ICAL.TimezoneService.has(id)) {
			ICAL.TimezoneService.register(new ICAL.Timezone(tz));
		}
	}
}

/** ICAL.Time → DateValue in lokaler Zeit (ganztägig bleibt ganztägig). */
export function timeToDateValue(t: ICAL.Time): DateValue {
	if (t.isDate) return { date: `${t.year}-${pad(t.month)}-${pad(t.day)}` };
	const d = t.toJSDate();
	return {
		date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
		time: `${pad(d.getHours())}:${pad(d.getMinutes())}`
	};
}

/** DateValue → ICAL.Time: ganztägig als DATE, sonst „floating“ lokale Zeit. */
export function dateValueToTime(v: DateValue): ICAL.Time {
	const [year, month, day] = v.date.split('-').map(Number);
	if (!v.time) return ICAL.Time.fromData({ year, month, day, isDate: true });
	const [hour, minute] = v.time.split(':').map(Number);
	return ICAL.Time.fromData({ year, month, day, hour, minute, second: 0, isDate: false });
}

const utcNow = () => ICAL.Time.fromJSDate(new Date(), true);

export const priorityToIcal = (p: Priority | null) => (p === 1 ? 1 : p === 2 ? 5 : p === 3 ? 9 : 0);
export function priorityFromIcal(n: number | null | undefined): Priority | null {
	if (!n) return null;
	if (n <= 4) return 1;
	if (n === 5) return 2;
	return 3;
}

const STATUS_FROM: Record<string, TaskStatus> = {
	'NEEDS-ACTION': 'needs-action',
	'IN-PROCESS': 'in-process',
	COMPLETED: 'completed',
	CANCELLED: 'cancelled'
};
const STATUS_TO: Record<TaskStatus, string> = {
	'needs-action': 'NEEDS-ACTION',
	'in-process': 'IN-PROCESS',
	completed: 'COMPLETED',
	cancelled: 'CANCELLED'
};

/** Fractional-Index-Schlüssel → Zahl gleicher Reihenfolge (für X-APPLE-SORT-ORDER anderer Apps). */
export function sortKeyToNumber(key: string): number {
	const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
	let n = 0;
	for (let i = 0; i < 6; i++) n = n * 62 + Math.max(0, DIGITS.indexOf(key[i] ?? '0'));
	return n;
}

const relType = (p: ICAL.Property) => String(p.getParameter('reltype') ?? 'PARENT').toUpperCase();

function str(comp: ICAL.Component, name: string): string | undefined {
	const v = comp.getFirstPropertyValue(name);
	return v === null || v === undefined ? undefined : String(v);
}

/**
 * JSON in eigenen X-Eigenschaften wird URL-kodiert gespeichert. Server wie Radicale
 * behandeln Kommas und Strichpunkte in unbekannten Eigenschaften als Trennzeichen und
 * schneiden den Wert sonst ab.
 */
const encodeJson = (value: unknown) => encodeURIComponent(JSON.stringify(value));

function decodeJson<T>(raw: string | undefined): T | undefined {
	if (!raw) return undefined;
	for (const candidate of [() => decodeURIComponent(raw), () => raw]) {
		try {
			return JSON.parse(candidate()) as T;
		} catch {
			/* nächster Versuch (unkodiertes JSON aus älteren Ständen) */
		}
	}
	return undefined;
}

function parseTime(raw: string | undefined): TimeEntry[] {
	const v = decodeJson<TimeEntry[]>(raw);
	return Array.isArray(v)
		? v.filter((e) => e && typeof e.id === 'string' && typeof e.date === 'string' && e.minutes > 0)
		: [];
}

// ---------- Lesen ----------

export function parseTodo(ics: string): ParsedTodo {
	const vcal = new ICAL.Component(ICAL.parse(ics));
	registerTimezones(vcal);
	const todo = vcal.getFirstSubcomponent('vtodo');
	if (!todo) throw new Error('Kein VTODO enthalten');
	const uid = str(todo, 'uid');
	if (!uid) throw new Error('VTODO ohne UID');

	const time = (name: string) => {
		const v = todo.getFirstPropertyValue(name);
		return v instanceof ICAL.Time ? v : undefined;
	};
	const related = todo.getAllProperties('related-to');
	const parent = related.find((p) => relType(p) === 'PARENT');
	const status =
		STATUS_FROM[(str(todo, 'status') ?? 'NEEDS-ACTION').toUpperCase()] ?? 'needs-action';
	const completed = time('completed');
	const waiting = str(todo, X.waiting.toLowerCase());
	const sort = str(todo, X.sort.toLowerCase());
	const apple = str(todo, 'x-apple-sort-order');
	const created = time('created');
	const rrule = todo.getFirstPropertyValue('rrule');

	const waitingFor = decodeJson<WaitingFor>(waiting);

	const fields = normalize({
		title: str(todo, 'summary') ?? '',
		notes: str(todo, 'description') ?? '',
		priority: priorityFromIcal(Number(todo.getFirstPropertyValue('priority') ?? 0)),
		due: time('due') && timeToDateValue(time('due')!),
		scheduled: time('dtstart') && timeToDateValue(time('dtstart')!),
		rrule: rrule ? rrule.toString() : undefined,
		status,
		completedAt:
			status === 'completed'
				? (completed?.toJSDate().getTime() ?? time('last-modified')?.toJSDate().getTime())
				: undefined,
		parentId: parent ? String(parent.getFirstValue()) : null,
		blockedBy: related
			.filter((p) => relType(p) === 'DEPENDS-ON')
			.map((p) => String(p.getFirstValue())),
		sortOrder: sort ?? '',
		projectId: str(todo, X.project.toLowerCase()) ?? null,
		someday: str(todo, X.someday.toLowerCase()) === '1',
		postponeCount: Number(str(todo, X.postponed.toLowerCase()) ?? 0) || 0,
		estimateMin: str(todo, X.estimate.toLowerCase())
			? Number(str(todo, X.estimate.toLowerCase()))
			: undefined,
		energy: (str(todo, X.energy.toLowerCase()) as Energy | undefined) || undefined,
		waitingFor,
		timeEntries: parseTime(str(todo, X.time.toLowerCase()))
	});

	return {
		uid,
		fields,
		hasOwnSort: !!sort,
		appleSort: apple !== undefined ? Number(apple) : undefined,
		created: created?.toJSDate().getTime()
	};
}

// ---------- Schreiben ----------

/**
 * Schreibt `fields` in ein VTODO. Mit `previous` (dem zuletzt geladenen ICS) wird dieses
 * verändert, sonst ein neues erzeugt. Mit `base` werden nur geänderte Felder angefasst.
 */
export function writeTodo(
	uid: string,
	fields: SyncFields,
	opts: { previous?: string; base?: SyncFields } = {}
): string {
	const f = normalize(fields);
	let vcal: ICAL.Component;
	let todo: ICAL.Component;
	if (opts.previous) {
		vcal = new ICAL.Component(ICAL.parse(opts.previous));
		todo = vcal.getFirstSubcomponent('vtodo')!;
	} else {
		vcal = new ICAL.Component(['vcalendar', [], []]);
		vcal.addPropertyWithValue('version', '2.0');
		vcal.addPropertyWithValue('prodid', PRODID);
		todo = new ICAL.Component('vtodo');
		vcal.addSubcomponent(todo);
		todo.addPropertyWithValue('uid', uid);
		todo.addPropertyWithValue('created', utcNow());
	}

	const changed: SyncField[] =
		opts.base && opts.previous ? changedFields(normalize(opts.base), f) : [];
	const touch = (k: SyncField) => !opts.base || !opts.previous || changed.includes(k);

	const set = (rawName: string, value: unknown) => {
		const name = rawName.toLowerCase();
		todo.removeAllProperties(name);
		if (value !== undefined && value !== null && value !== '')
			todo.addPropertyWithValue(name, value);
	};

	if (touch('title')) set('summary', f.title);
	if (touch('notes')) set('description', f.notes);
	if (touch('priority')) set('priority', f.priority ? priorityToIcal(f.priority) : undefined);
	if (touch('due')) set('due', f.due && dateValueToTime(f.due));
	if (touch('scheduled')) set('dtstart', f.scheduled && dateValueToTime(f.scheduled));
	if (touch('rrule')) set('rrule', f.rrule && ICAL.Recur.fromString(f.rrule));

	if (touch('status') || touch('completedAt')) {
		set('status', STATUS_TO[f.status]);
		if (f.status === 'completed') {
			set('completed', ICAL.Time.fromJSDate(new Date(f.completedAt ?? Date.now()), true));
			if (todo.hasProperty('percent-complete')) set('percent-complete', 100);
		} else {
			todo.removeAllProperties('completed');
			if (Number(todo.getFirstPropertyValue('percent-complete')) === 100) {
				todo.removeAllProperties('percent-complete');
			}
		}
	}

	if (touch('parentId') || touch('blockedBy')) {
		// Nur unsere Beziehungsarten ersetzen, andere (CHILD, SIBLING …) bleiben.
		for (const p of todo.getAllProperties('related-to')) {
			const t = relType(p);
			if ((t === 'PARENT' && touch('parentId')) || (t === 'DEPENDS-ON' && touch('blockedBy'))) {
				todo.removeProperty(p);
			}
		}
		if (touch('parentId') && f.parentId) todo.addPropertyWithValue('related-to', f.parentId);
		if (touch('blockedBy')) {
			for (const id of f.blockedBy) {
				const p = todo.addPropertyWithValue('related-to', id);
				p.setParameter('reltype', 'DEPENDS-ON');
			}
		}
	}

	if (touch('sortOrder')) {
		set(X.sort, f.sortOrder || undefined);
		set('x-apple-sort-order', f.sortOrder ? String(sortKeyToNumber(f.sortOrder)) : undefined);
	}
	if (touch('projectId')) set(X.project, f.projectId ?? undefined);
	if (touch('someday')) set(X.someday, f.someday ? '1' : undefined);
	if (touch('postponeCount'))
		set(X.postponed, f.postponeCount ? String(f.postponeCount) : undefined);
	if (touch('estimateMin')) set(X.estimate, f.estimateMin ? String(f.estimateMin) : undefined);
	if (touch('energy')) set(X.energy, f.energy);
	if (touch('waitingFor')) set(X.waiting, f.waitingFor ? encodeJson(f.waitingFor) : undefined);
	if (touch('timeEntries')) {
		set(X.time, f.timeEntries?.length ? encodeJson(f.timeEntries) : undefined);
	}

	set('dtstamp', utcNow());
	set('last-modified', utcNow());
	return vcal.toString();
}
