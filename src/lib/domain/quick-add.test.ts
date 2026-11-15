import { describe, expect, it } from 'vitest';
import { parseQuickAdd, type ParseContext } from './quick-add';

// Mittwoch, 12.11.2025, 14:30
const now = new Date(2025, 10, 12, 14, 30);
const pools = [
	{ id: 'arbeit', name: 'Arbeit' },
	{ id: 'privat', name: 'Privat' },
	{ id: 'haus', name: 'Projekt Haus' }
];
const ctx: ParseContext = { now, pools };
const parse = (s: string, extra: Partial<ParseContext> = {}) =>
	parseQuickAdd(s, { ...ctx, ...extra });

describe('parseQuickAdd', () => {
	it('erkennt das Beispiel aus der Spec', () => {
		const r = parse('Rechnung zahlen morgen !1 #privat');
		expect(r.title).toBe('Rechnung zahlen');
		expect(r.due).toEqual({ date: '2025-11-13' });
		expect(r.priority).toBe(1);
		expect(r.poolId).toBe('privat');
		expect(r.tokens.map((t) => t.kind)).toEqual(['date', 'priority', 'pool']);
	});

	it.each([
		['heute', '2025-11-12'],
		['morgen', '2025-11-13'],
		['übermorgen', '2025-11-14'],
		['Freitag', '2025-11-14'],
		['mittwoch', '2025-11-12'], // heute ist Mittwoch → heute
		['Dienstag', '2025-11-18'],
		['15.12.', '2025-12-15'],
		['1.1.', '2026-01-01'], // ohne Jahr, schon vorbei → nächstes Jahr
		['12.11.', '2025-11-12'], // heute zählt nicht als vorbei
		['15.12.2027', '2027-12-15'],
		['15.12.27', '2027-12-15']
	])('Datum „%s“ → %s', (word, date) => {
		expect(parse(`Test ${word}`).due).toEqual({ date });
	});

	it('kombiniert Datum und Uhrzeit, auch mit „Uhr“', () => {
		expect(parse('Meeting Freitag 9:00').due).toEqual({ date: '2025-11-14', time: '09:00' });
		const r = parse('Meeting Freitag 9:00 Uhr mit Team');
		expect(r.due).toEqual({ date: '2025-11-14', time: '09:00' });
		expect(r.title).toBe('Meeting mit Team');
	});

	it('nur Uhrzeit: heute wenn noch nicht vorbei, sonst morgen', () => {
		expect(parse('Anrufen 16:00').due).toEqual({ date: '2025-11-12', time: '16:00' });
		expect(parse('Anrufen 9:00').due).toEqual({ date: '2025-11-13', time: '09:00' });
	});

	it('interpretiert Wortteile nicht als Datum', () => {
		const r = parse('Morgenroutine überarbeiten');
		expect(r.due).toBeUndefined();
		expect(r.title).toBe('Morgenroutine überarbeiten');
	});

	it('ignoriert ungültige Daten und Uhrzeiten', () => {
		expect(parse('Test 31.02.').due).toBeUndefined();
		expect(parse('Test 25:00').due).toBeUndefined();
		expect(parse('Version 1.5').due).toBeUndefined();
	});

	it('erkennt jede Art nur einmal – der Rest bleibt Titel', () => {
		const r = parse('morgen oder übermorgen !1 !2');
		expect(r.due).toEqual({ date: '2025-11-13' });
		expect(r.priority).toBe(1);
		expect(r.title).toBe('oder übermorgen !2');
	});

	it('Pool: Groß/Klein egal, Präfix reicht, Leerzeichen im Namen', () => {
		expect(parse('x #ARBEIT').poolId).toBe('arbeit');
		expect(parse('x #arb').poolId).toBe('arbeit');
		expect(parse('x #projekthaus').poolId).toBe('haus');
	});

	it('unbekannter Pool wird als fehlerhafter Chip markiert', () => {
		const r = parse('x #gibtsnicht');
		expect(r.poolId).toBeUndefined();
		expect(r.tokens[0]).toMatchObject({ kind: 'pool', error: 'Unbekannter Pool' });
		expect(r.title).toBe('x');
	});

	it('entfernte Chips bleiben als normaler Text im Titel', () => {
		const first = parse('Bericht Freitag abgeben');
		const key = first.tokens[0].key;
		const r = parse('Bericht Freitag abgeben', { ignored: [key] });
		expect(r.due).toBeUndefined();
		expect(r.title).toBe('Bericht Freitag abgeben');
	});

	it('Satzzeichen am Wortende stören nicht', () => {
		const r = parse('Einkaufen morgen, dringend !2');
		expect(r.due).toEqual({ date: '2025-11-13' });
		expect(r.title).toBe('Einkaufen , dringend');
	});

	it('leere Eingabe', () => {
		expect(parse('   ')).toMatchObject({ title: '', tokens: [] });
	});
});
