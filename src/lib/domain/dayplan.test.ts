import { describe, expect, it } from 'vitest';
import { nextQuarter, planSlots } from './dayplan';

describe('Tagesplan: Uhrzeiten', () => {
	it('reiht die Aufgaben ab der Startzeit hintereinander', () => {
		expect(planSlots([45, null, 90], '09:00')).toEqual([
			{ start: '09:00', end: '09:45', minutes: 45 },
			{ start: '09:45', end: '10:15', minutes: 30 },
			{ start: '10:15', end: '11:45', minutes: 90 }
		]);
	});

	it('plant nicht über Mitternacht hinaus', () => {
		expect(planSlots([60, 60], '22:30')).toEqual([
			{ start: '22:30', end: '23:30', minutes: 60 },
			{ minutes: 60 }
		]);
	});

	it('Start: nächste Viertelstunde, mindestens 5 Minuten Luft', () => {
		expect(nextQuarter(new Date(2026, 10, 20, 9, 0))).toBe('09:15');
		expect(nextQuarter(new Date(2026, 10, 20, 9, 7))).toBe('09:15');
		expect(nextQuarter(new Date(2026, 10, 20, 9, 11))).toBe('09:30');
		expect(nextQuarter(new Date(2026, 10, 20, 23, 50))).toBe('23:45');
	});
});
