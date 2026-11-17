import { describe, expect, it } from 'vitest';
import { canSnooze, DEFAULT_TRIAGE_SETTINGS, triageDue, type TriageSettings } from './triage';

// Dienstag, 17.11.2026
const at = (hhmm: string, day = 17) => new Date(`2026-11-${day}T${hhmm}:00`);
const s = (patch: Partial<TriageSettings> = {}): TriageSettings => ({
	...DEFAULT_TRIAGE_SETTINGS,
	mode: 'suggest',
	times: [
		{ time: '09:00', days: [0, 1, 2, 3, 4] },
		{ time: '17:00', days: [1, 3] }
	],
	...patch
});
const inbox = { count: 3, oldest: at('08:00').getTime() };

describe('Wann ist Aufräumen fällig?', () => {
	it('aus, oder leere Inbox → nie', () => {
		expect(triageDue(at('10:00'), s({ mode: 'off' }), {}, inbox)).toBeNull();
		expect(triageDue(at('10:00'), s(), {}, { count: 0 })).toBeNull();
	});

	it('feste Zeit: ab der Uhrzeit fällig, bis erledigt', () => {
		expect(triageDue(at('08:59'), s(), {}, inbox)).toBeNull();
		expect(triageDue(at('09:00'), s(), {}, inbox)).toEqual({
			key: '2026-11-17 09:00',
			reason: 'time',
			time: '09:00'
		});
		expect(triageDue(at('12:00'), s(), { done: '2026-11-17 09:00' }, inbox)).toBeNull();
	});

	it('nimmt den spätesten erreichten Zeitpunkt, nur an den gewählten Wochentagen', () => {
		// Dienstag (1): 17:00 gilt
		expect(triageDue(at('18:00'), s(), { done: '2026-11-17 09:00' }, inbox)?.time).toBe('17:00');
		// Montag (0): 17:00 gilt nicht
		expect(triageDue(at('18:00', 16), s(), { done: '2026-11-16 09:00' }, inbox)).toBeNull();
		// Samstag: gar nichts
		expect(triageDue(at('10:00', 21), s(), {}, inbox)).toBeNull();
	});

	it('was gestern verpasst wurde, zählt heute nicht nach; spätere Erledigung deckt frühere ab', () => {
		expect(triageDue(at('08:00', 18), s(), { done: '2026-11-17 09:00' }, inbox)).toBeNull();
		expect(triageDue(at('18:00'), s(), { done: '2026-11-17 17:00' }, inbox)).toBeNull();
	});

	it('Regel: ab N Einträgen, einmal pro Tag', () => {
		const rule = s({ times: [], minCount: 3 });
		expect(triageDue(at('07:00'), rule, {}, inbox)).toEqual({
			key: 'regel:2026-11-17',
			reason: 'count'
		});
		expect(triageDue(at('07:00'), rule, {}, { count: 2 })).toBeNull();
		expect(triageDue(at('15:00'), rule, { done: 'regel:2026-11-17' }, inbox)).toBeNull();
		expect(triageDue(at('07:00', 18), rule, { done: 'regel:2026-11-17' }, inbox)?.reason).toBe(
			'count'
		);
	});

	it('Regel: ältester Eintrag älter als X Tage', () => {
		const rule = s({ times: [], olderThanDays: 3 });
		const old = { count: 1, oldest: at('10:00', 13).getTime() };
		expect(triageDue(at('07:00'), rule, {}, old)?.reason).toBe('age');
		expect(
			triageDue(at('07:00'), rule, {}, { count: 1, oldest: at('10:00', 15).getTime() })
		).toBeNull();
	});

	it('aufgeschoben: erst danach wieder fällig; beim Erzwingen nur einmal', () => {
		const snoozed = { snoozedUntil: at('09:15').getTime(), snoozedFor: '2026-11-17 09:00' };
		expect(triageDue(at('09:10'), s(), snoozed, inbox)).toBeNull();
		const due = triageDue(at('09:20'), s(), snoozed, inbox)!;
		expect(due.key).toBe('2026-11-17 09:00');
		expect(canSnooze(s(), snoozed, due)).toBe(true);
		expect(canSnooze(s({ mode: 'force' }), snoozed, due)).toBe(false);
		expect(canSnooze(s({ mode: 'force' }), {}, due)).toBe(true);
	});
});
