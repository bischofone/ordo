import ICAL from 'ical.js';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CALENDAR_SETTINGS, eventFor, eventHash, writeEvent } from './events';
import type { Task } from './types';

const task = (patch: Partial<Task> = {}): Task => ({
	id: 'abc',
	poolId: 'p',
	projectId: null,
	parentId: null,
	sortOrder: 'a',
	title: 'Angebot schreiben',
	notes: '',
	priority: null,
	status: 'needs-action',
	someday: false,
	postponeCount: 0,
	blockedBy: [],
	collapsed: false,
	createdAt: 0,
	updatedAt: 0,
	...patch
});
const now = new Date('2026-11-19T08:00:00Z');
const parse = (ics: string) => new ICAL.Component(ICAL.parse(ics)).getFirstSubcomponent('vevent')!;

describe('Termine aus geplanten Aufgaben', () => {
	it('ohne geplantes Datum kein Termin', () => {
		expect(eventFor(task(), DEFAULT_CALENDAR_SETTINGS)).toBeNull();
		expect(eventFor(task({ due: { date: '2026-11-20' } }), DEFAULT_CALENDAR_SETTINGS)).toBeNull();
	});

	it('mit Uhrzeit: Standarddauer 30 Minuten, in UTC', () => {
		const e = eventFor(
			task({ scheduled: { date: '2026-11-20', time: '14:00' } }),
			DEFAULT_CALENDAR_SETTINGS
		)!;
		const ev = parse(writeEvent(e, now));
		expect(ev.getFirstPropertyValue('uid')).toBe('ordo-abc');
		expect(ev.getFirstPropertyValue('summary')).toBe('Angebot schreiben');
		const start = ev.getFirstPropertyValue('dtstart') as ICAL.Time;
		const end = ev.getFirstPropertyValue('dtend') as ICAL.Time;
		// 14:00 in Berlin (Winterzeit) = 13:00 UTC
		expect(start.toString()).toBe('2026-11-20T13:00:00Z');
		expect(end.toString()).toBe('2026-11-20T13:30:00Z');
	});

	it('Zeitschätzung bestimmt die Dauer; Standarddauer einstellbar', () => {
		const t = task({ scheduled: { date: '2026-11-20', time: '09:00' }, estimateMin: 90 });
		expect(eventFor(t, DEFAULT_CALENDAR_SETTINGS)!.durationMin).toBe(90);
		const t2 = task({ scheduled: { date: '2026-11-20', time: '09:00' } });
		expect(eventFor(t2, { durationMin: 45, allDay: true })!.durationMin).toBe(45);
	});

	it('ohne Uhrzeit: ganztägig – oder gar nicht, wenn abgeschaltet', () => {
		const t = task({ scheduled: { date: '2026-11-20' } });
		const ev = parse(writeEvent(eventFor(t, DEFAULT_CALENDAR_SETTINGS)!, now));
		const start = ev.getFirstPropertyValue('dtstart') as ICAL.Time;
		expect(start.isDate).toBe(true);
		expect(start.toString()).toBe('2026-11-20');
		expect((ev.getFirstPropertyValue('dtend') as ICAL.Time).toString()).toBe('2026-11-21');
		expect(eventFor(t, { durationMin: 30, allDay: false })).toBeNull();
	});

	it('Sonderzeichen, Umlaute und lange Notizen bleiben heil', () => {
		const notes = 'Preise; Mengen, Termine\nZweite Zeile – äöü '.repeat(6);
		const e = eventFor(
			task({ title: 'Küche, Bad; Flur', notes, scheduled: { date: '2026-11-20', time: '10:30' } }),
			DEFAULT_CALENDAR_SETTINGS,
			{ pool: 'Arbeit', project: 'Weber' }
		)!;
		const ics = writeEvent(e, now);
		for (const line of ics.split('\r\n'))
			expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
		const ev = parse(ics);
		expect(ev.getFirstPropertyValue('summary')).toBe('Küche, Bad; Flur');
		expect(ev.getFirstPropertyValue('description')).toBe(`${notes.trim()}\n\nOrdo: Arbeit › Weber`);
	});

	it('Fingerabdruck ändert sich nur bei echten Änderungen', () => {
		const a = eventFor(
			task({ scheduled: { date: '2026-11-20', time: '10:00' } }),
			DEFAULT_CALENDAR_SETTINGS
		)!;
		const b = eventFor(
			task({ scheduled: { date: '2026-11-20', time: '10:00' }, priority: 1 }),
			DEFAULT_CALENDAR_SETTINGS
		)!;
		const c = eventFor(
			task({ scheduled: { date: '2026-11-20', time: '11:00' } }),
			DEFAULT_CALENDAR_SETTINGS
		)!;
		expect(eventHash(a)).toBe(eventHash(b));
		expect(eventHash(a)).not.toBe(eventHash(c));
	});
});
