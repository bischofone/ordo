/**
 * Zurückschieben: setzt das geplante Datum (DTSTART) und zählt mit.
 * Ab dem 3. Mal fragt die App nach: Aufteilen, „Irgendwann“ oder Löschen.
 */
import { addDaysIso, firstOfNextMonthIso, fromIsoDate, nextMondayIso, todayIso } from './dates';
import type { Task } from './types';

export const POSTPONE_REVIEW_THRESHOLD = 3;

export interface PostponeOption {
	id: 'tomorrow' | 'next-week' | 'next-month';
	label: string;
	date: string;
}

export function postponeOptions(now: Date): PostponeOption[] {
	return [
		{ id: 'tomorrow', label: 'Morgen', date: addDaysIso(now, 1) },
		{ id: 'next-week', label: 'Nächste Woche', date: nextMondayIso(now) },
		{ id: 'next-month', label: 'Nächster Monat', date: firstOfNextMonthIso(now) }
	];
}

/** Muss vor diesem Verschieben nachgefragt werden? (Wäre es das 3. Mal oder öfter?) */
export function needsPostponeReview(task: Pick<Task, 'postponeCount'>) {
	return task.postponeCount + 1 >= POSTPONE_REVIEW_THRESHOLD;
}

export function postponePatch(task: Task, date: string): Pick<Task, 'scheduled' | 'postponeCount'> {
	return {
		scheduled: { date, time: task.scheduled?.time },
		postponeCount: task.postponeCount + 1
	};
}

/** Liegt das geplante Datum in der Zukunft? → Bereich „Später“. */
export function isLater(task: Pick<Task, 'scheduled'>, now: Date) {
	return !!task.scheduled && fromIsoDate(task.scheduled.date) > fromIsoDate(todayIso(now));
}
