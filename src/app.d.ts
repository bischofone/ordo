// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	/** Versionsnummer aus package.json (beim Bauen eingesetzt) */
	const __ORDO_VERSION__: string;
	/** Git-Stand, z. B. „8aa5d67“ – leer, wenn ohne Git gebaut */
	const __ORDO_COMMIT__: string;

	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
