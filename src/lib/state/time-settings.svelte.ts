/** Einstellungen der Zeiterfassung (Modus an/aus, Soll-Zeiten, Runden) – reaktiv für die Oberfläche. */
import { liveQuery } from 'dexie';
import { TIME_SETTINGS_KEY } from '#lib/db/repo.ts';
import { DEFAULT_TIME_SETTINGS, type TimeSettings } from '#lib/domain/time.ts';
import { db, repo } from './app';

class TimeSettingsState {
	current = $state.raw<TimeSettings>(DEFAULT_TIME_SETTINGS);
	loaded = $state(false);

	/** Zeiterfassungs-Modus eingeschaltet? */
	get enabled() {
		return this.current.enabled;
	}

	set(patch: Partial<TimeSettings>) {
		return repo.setTimeSettings(patch);
	}
}
export const timeSettings = new TimeSettingsState();

/** Beobachtet die gespeicherten Einstellungen. Gibt eine Aufräumfunktion zurück. */
export function watchTimeSettings() {
	const sub = liveQuery(() => db.settings.get(TIME_SETTINGS_KEY)).subscribe((s) => {
		timeSettings.current = {
			...DEFAULT_TIME_SETTINGS,
			...(s?.value as Partial<TimeSettings> | undefined)
		};
		timeSettings.loaded = true;
	});
	return () => sub.unsubscribe();
}
