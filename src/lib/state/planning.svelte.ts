/**
 * Planung (pro Gerät): Gewichtungen für „Was als Nächstes?“, verfügbare Zeit pro Tag,
 * und ob der Tag schon geplant wurde. Dazu die Aktionen „für heute einplanen“ / „nicht heute“.
 */
import { liveQuery } from 'dexie';
import { format } from 'date-fns';
import { DEFAULT_NEXT_WEIGHTS, type NextWeights } from '#lib/domain/next.ts';
import type { Task } from '#lib/domain/types.ts';
import { db, repo } from './app';

export const PLANNING_KEY = 'planning';

export interface PlanningSettings {
	weights: NextWeights;
	/** Verfügbare Zeit an einem normalen Tag (Minuten), wenn keine Soll-Zeit eingestellt ist */
	capacity: number;
	/** Verfügbare Zeit für einen bestimmten Tag (überschreibt die Vorgabe) */
	capacityFor?: { date: string; minutes: number };
	/** Tag, an dem der Morgen-Ablauf zuletzt abgeschlossen wurde */
	plannedOn?: string;
}

export const DEFAULT_PLANNING: PlanningSettings = {
	weights: DEFAULT_NEXT_WEIGHTS,
	capacity: 6 * 60
};

class PlanningState {
	current = $state.raw<PlanningSettings>(DEFAULT_PLANNING);
	loaded = $state(false);
}
export const planning = new PlanningState();

export function watchPlanning() {
	const sub = liveQuery(() => db.settings.get(PLANNING_KEY)).subscribe((s) => {
		const v = (s?.value ?? {}) as Partial<PlanningSettings>;
		planning.current = {
			...DEFAULT_PLANNING,
			...v,
			weights: { ...DEFAULT_NEXT_WEIGHTS, ...v.weights }
		};
		planning.loaded = true;
	});
	return () => sub.unsubscribe();
}

export async function savePlanning(patch: Partial<PlanningSettings>) {
	const cur = await repo.getSetting<Partial<PlanningSettings>>(PLANNING_KEY, {});
	await repo.setSetting(PLANNING_KEY, { ...DEFAULT_PLANNING, ...cur, ...patch });
}

const todayStr = () => format(Date.now(), 'yyyy-MM-dd');

/** Für heute einplanen (geplantes Datum = heute, Uhrzeit bleibt) */
export function planToday(task: Task) {
	return repo.updateTask(task.id, { scheduled: { date: todayStr(), time: task.scheduled?.time } });
}

/** Nicht mehr für heute: geplantes Datum entfernen */
export function unplan(task: Task) {
	return repo.updateTask(task.id, { scheduled: undefined });
}

/** Morgen-Ablauf für heute abgeschlossen */
export function markPlanned() {
	return savePlanning({ plannedOn: todayStr() });
}
