/**
 * „Was als Nächstes?“ – deterministische, erklärbare Bewertung ohne KI.
 *
 * Jede offene Aufgabe bekommt Punkte aus mehreren Gründen (Priorität, Fälligkeit, für heute
 * geplant, Alter, wie oft verschoben, passt in die verfügbare Zeit, passt zur Energie).
 * Jeder Grund wird mit einer Gewichtung multipliziert, die sich in den Einstellungen
 * ändern lässt. Die wichtigsten Gründe werden als Begründung angezeigt.
 *
 * Nicht vorgeschlagen werden: Erledigtes, „Irgendwann“, Späteres (geplant in der Zukunft),
 * Blockiertes, Wartendes und Aufgaben mit offenen Unteraufgaben (dann die Unteraufgaben).
 */
import { differenceInCalendarDays } from 'date-fns';
import { daysFromToday, fromIsoDate, todayIso } from './dates';
import { isLater } from './postpone';
import { isDone, isOpen, type Energy, type Task } from './types';

export interface NextWeights {
	priority: number;
	due: number;
	planned: number;
	age: number;
	postponed: number;
	fit: number;
	energy: number;
}

/** 1 = normal, 0 = aus, 2 = doppelt so wichtig */
export const DEFAULT_NEXT_WEIGHTS: NextWeights = {
	priority: 1,
	due: 1,
	planned: 1,
	age: 1,
	postponed: 1,
	fit: 1,
	energy: 1
};

export interface NextInput {
	now: Date;
	/** So viel Zeit habe ich gerade (Minuten) – optional */
	minutes?: number;
	/** So viel Energie habe ich gerade – optional */
	energy?: Energy;
	weights?: Partial<NextWeights>;
}

export interface Reason {
	key: keyof NextWeights | 'fit-bad' | 'energy-bad';
	text: string;
	points: number;
}

export interface Scored {
	task: Task;
	score: number;
	/** Gründe, wichtigste zuerst (nur die mit Gewicht) */
	reasons: Reason[];
}

export type Exclusion =
	'done' | 'someday' | 'later' | 'blocked' | 'waiting' | 'parent' | 'too-long';

const ENERGY_LEVEL: Record<Energy, number> = { low: 0, mid: 1, high: 2 };

/** Warum wird eine Aufgabe nicht vorgeschlagen? `null` = sie kommt infrage. */
export function exclusion(task: Task, all: readonly Task[], input: NextInput): Exclusion | null {
	if (task.deletedAt || isDone(task)) return 'done';
	if (task.someday) return 'someday';
	if (isLater(task, input.now)) return 'later';
	if (task.waitingFor) return 'waiting';
	if (task.blockedBy.some((id) => all.some((t) => t.id === id && !t.deletedAt && isOpen(t))))
		return 'blocked';
	if (all.some((t) => t.parentId === task.id && !t.deletedAt && isOpen(t))) return 'parent';
	// Eine Unteraufgabe einer „Irgendwann“- oder späteren Aufgabe kommt auch nicht dran
	let parent = all.find((t) => t.id === task.parentId);
	while (parent) {
		if (parent.someday) return 'someday';
		if (isLater(parent, input.now)) return 'later';
		parent = all.find((t) => t.id === parent!.parentId);
	}
	if (input.minutes !== undefined && task.estimateMin && task.estimateMin > input.minutes * 1.5)
		return 'too-long';
	return null;
}

const dayWord = (n: number) => (n === 1 ? '1 Tag' : `${n} Tagen`);

/** Punkte und Gründe für eine Aufgabe (ohne Ausschlussprüfung) */
export function scoreTask(task: Task, input: NextInput): Scored {
	const w = { ...DEFAULT_NEXT_WEIGHTS, ...input.weights };
	const reasons: Reason[] = [];
	const add = (key: Reason['key'], weight: number, points: number, text: string) => {
		const p = points * weight;
		if (p !== 0) reasons.push({ key, text, points: Math.round(p * 10) / 10 });
	};

	// Priorität
	if (task.priority) {
		add(
			'priority',
			w.priority,
			{ 1: 30, 2: 20, 3: 10 }[task.priority],
			`Priorität ${task.priority}`
		);
	}

	// Fälligkeit
	if (task.due) {
		const d = daysFromToday(task.due, input.now);
		if (d < 0) add('due', w.due, 40 + Math.min(20, -d * 2), `seit ${dayWord(-d)} überfällig`);
		else if (d === 0) add('due', w.due, 35, 'heute fällig');
		else if (d === 1) add('due', w.due, 25, 'morgen fällig');
		else if (d <= 3) add('due', w.due, 15, `in ${d} Tagen fällig`);
		else if (d <= 7) add('due', w.due, 8, 'diese Woche fällig');
	}

	// Für heute geplant (oder von früher liegen geblieben)
	if (task.scheduled) {
		const d = differenceInCalendarDays(
			fromIsoDate(task.scheduled.date),
			fromIsoDate(todayIso(input.now))
		);
		if (d === 0) add('planned', w.planned, 20, 'für heute geplant');
		else if (d < 0)
			add('planned', w.planned, 22, d === -1 ? 'seit gestern geplant' : `seit ${-d} Tagen geplant`);
	}

	// Alter
	const age = differenceInCalendarDays(input.now, new Date(task.createdAt));
	if (age >= 7) add('age', w.age, Math.min(15, Math.floor(age / 2)), `seit ${dayWord(age)} offen`);

	// Oft verschoben → endlich erledigen
	if (task.postponeCount > 0)
		add(
			'postponed',
			w.postponed,
			Math.min(20, task.postponeCount * 5),
			task.postponeCount === 1 ? 'schon einmal verschoben' : `${task.postponeCount}× verschoben`
		);

	// Passt in die verfügbare Zeit?
	if (input.minutes !== undefined && task.estimateMin) {
		if (task.estimateMin <= input.minutes) {
			const quick = task.estimateMin <= Math.min(15, input.minutes);
			add('fit', w.fit, quick ? 15 : 10, quick ? 'schnell erledigt' : 'passt in deine Zeit');
		} else add('fit-bad', w.fit, -20, 'dauert etwas länger als deine Zeit');
	}

	// Passt zur Energie?
	if (input.energy && task.energy) {
		const diff = ENERGY_LEVEL[task.energy] - ENERGY_LEVEL[input.energy];
		if (diff === 0) add('energy', w.energy, 10, 'passt zu deiner Energie');
		else if (diff > 0) add('energy-bad', w.energy, -15 * diff, 'braucht mehr Energie');
		else add('energy', w.energy, 5, 'braucht wenig Energie');
	}

	reasons.sort((a, b) => b.points - a.points);
	return { task, score: reasons.reduce((s, r) => s + r.points, 0), reasons };
}

/** Vorschläge, beste zuerst. Bei Gleichstand: früher fällig, dann älter. */
export function suggestNext(all: readonly Task[], input: NextInput, limit = 5): Scored[] {
	return all
		.filter((t) => exclusion(t, all, input) === null)
		.map((t) => scoreTask(t, input))
		.sort(
			(a, b) =>
				b.score - a.score ||
				(a.task.due?.date ?? '9999').localeCompare(b.task.due?.date ?? '9999') ||
				a.task.createdAt - b.task.createdAt
		)
		.slice(0, limit);
}

/** Begründung als kurzer Text, z. B. „morgen fällig · Priorität 1“ */
export function explain(s: Scored, max = 3) {
	return s.reasons
		.filter((r) => r.points > 0)
		.slice(0, max)
		.map((r) => r.text)
		.join(' · ');
}
