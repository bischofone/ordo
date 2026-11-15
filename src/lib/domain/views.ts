/**
 * Aufteilung der Aufgaben eines Pools in die sichtbaren Bereiche.
 * Nur Wurzel-Aufgaben werden eingeteilt; Unteraufgaben hängen immer an ihrem Elternteil.
 */
import { differenceInCalendarDays } from 'date-fns';
import { compareDateValue } from './dates';
import { isLater } from './postpone';
import { bySortOrder } from './tree';
import { isDone, type Task } from './types';

export interface Sections {
	active: Task[];
	later: Task[];
	someday: Task[];
	done: Task[];
}

export function sectionRoots(tasks: readonly Task[], now: Date): Sections {
	const s: Sections = { active: [], later: [], someday: [], done: [] };
	for (const t of tasks) {
		if (t.parentId !== null || t.deletedAt) continue;
		if (isDone(t)) s.done.push(t);
		else if (t.someday) s.someday.push(t);
		else if (isLater(t, now)) s.later.push(t);
		else s.active.push(t);
	}
	s.active.sort(bySortOrder);
	s.someday.sort(bySortOrder);
	s.later.sort((a, b) => compareDateValue(a.scheduled!, b.scheduled!) || bySortOrder(a, b));
	s.done.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
	return s;
}

export const DEFAULT_INBOX_AGING_DAYS = 7;

/** Liegt ein Inbox-Eintrag länger als `days` Tage? */
export function isAged(task: Pick<Task, 'createdAt'>, now: Date, days = DEFAULT_INBOX_AGING_DAYS) {
	return differenceInCalendarDays(now, new Date(task.createdAt)) > days;
}
