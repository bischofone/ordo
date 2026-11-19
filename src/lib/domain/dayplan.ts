/**
 * Tagesplan einplanen: Aus Startzeit und Dauer je Aufgabe die Uhrzeiten berechnen.
 * Aufgaben ohne Schätzung zählen mit der Standarddauer. Über Mitternacht hinaus wird
 * nicht geplant (dann ohne Uhrzeit, also ganztägig).
 */

export const toMinutes = (hhmm: string) => {
	const [h, m] = hhmm.split(':').map(Number);
	return h * 60 + m;
};
export const fromMinutes = (min: number) =>
	`${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Nächste Viertelstunde ab jetzt (frühestens in 5 Minuten) */
export function nextQuarter(now: Date) {
	const min = now.getHours() * 60 + now.getMinutes() + 5;
	const q = Math.ceil(min / 15) * 15;
	return q >= 24 * 60 ? '23:45' : fromMinutes(q);
}

export interface Slot {
	/** 'HH:mm' oder undefined, wenn der Tag vorbei wäre */
	start?: string;
	end?: string;
	minutes: number;
}

export function planSlots(
	estimates: readonly (number | null | undefined)[],
	start: string,
	defaultMin = 30
): Slot[] {
	let cursor = toMinutes(start);
	return estimates.map((e) => {
		const minutes = e && e > 0 ? e : defaultMin;
		if (cursor + minutes > 24 * 60) return { minutes };
		const slot = { start: fromMinutes(cursor), end: fromMinutes(cursor + minutes), minutes };
		cursor += minutes;
		return slot;
	});
}
