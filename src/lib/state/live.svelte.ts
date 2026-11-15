import { liveQuery } from 'dexie';

/**
 * Reaktive Datenbank-Abfrage für Komponenten.
 * `setup` läuft in einem $effect: reaktive Werte, die darin gelesen werden (z. B. eine Route-ID),
 * lösen eine neue Abfrage aus. Es gibt die eigentliche Abfragefunktion zurück.
 *
 *   const tasks = live(() => { const id = page.params.id; return () => db.tasks.where(...)... }, []);
 */
export function live<T>(setup: () => () => T | Promise<T>, initial: T) {
	let value = $state.raw<T>(initial);
	let loaded = $state(false);
	$effect(() => {
		const query = setup();
		const sub = liveQuery(query).subscribe({
			next: (v) => {
				value = v;
				loaded = true;
			},
			error: (e) => console.error(e)
		});
		return () => sub.unsubscribe();
	});
	return {
		get current() {
			return value;
		},
		get loaded() {
			return loaded;
		}
	};
}
