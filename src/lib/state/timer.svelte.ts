/** Laufender Timer (pro Gerät): Zustand für die Oberfläche und Start/Stopp mit Rückmeldung. */
import { liveQuery } from 'dexie';
import { TIMER_KEY } from '#lib/db/repo.ts';
import { formatDuration } from '#lib/domain/time.ts';
import type { RunningTimer } from '#lib/domain/types.ts';
import { m } from '#lib/i18n/index.ts';
import { db, repo } from './app';
import { toast } from './ui.svelte';

class TimerState {
	current = $state<RunningTimer | null>(null);
	/** Aktuelle Uhrzeit, tickt sekündlich solange ein Timer läuft */
	now = $state(Date.now());

	get elapsed() {
		return this.current ? Math.max(0, this.now - this.current.start) : 0;
	}
}
export const timer = new TimerState();

/** Beobachtet den gespeicherten Timer (auch aus anderen Tabs). Gibt eine Aufräumfunktion zurück. */
export function watchTimer() {
	const sub = liveQuery(() => db.settings.get(TIMER_KEY)).subscribe((s) => {
		timer.current = (s?.value as RunningTimer | undefined) ?? null;
		timer.now = Date.now();
	});
	const tick = setInterval(() => {
		if (timer.current) timer.now = Date.now();
	}, 1000);
	return () => {
		sub.unsubscribe();
		clearInterval(tick);
	};
}

export async function stopTimer() {
	const wasRunning = await repo.getTimer();
	const result = await repo.stopTimer();
	if (result) toast(m.time.logged(formatDuration(result.entry.minutes)));
	else if (wasRunning) toast(m.time.tooShort);
}

/** Play/Stop an einer Aufgabe. Läuft ein anderer Timer, wird er gestoppt und erfasst. */
export async function toggleTimer(taskId: string) {
	if (timer.current?.taskId === taskId) return stopTimer();
	const previous = await repo.getTimer();
	await repo.startTimer(taskId);
	if (previous) toast(m.time.running);
}
