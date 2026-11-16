/**
 * Deutsche UI-Texte. Für weitere Sprachen eine Datei mit gleicher Struktur anlegen
 * und in ./index.ts auswählen.
 */
export const de = {
	appName: 'Tasks',
	nav: {
		inbox: 'Inbox',
		all: 'Alle Pools',
		pools: 'Pools',
		settings: 'Einstellungen',
		newPool: 'Neuer Pool',
		menu: 'Menü'
	},
	quickAdd: {
		placeholder: 'Neue Aufgabe … z. B. „Rechnung zahlen morgen !1 #privat“',
		date: 'Datum',
		priority: 'Priorität',
		pool: 'Pool',
		today: 'Heute',
		tomorrow: 'Morgen',
		none: 'Keine',
		add: 'Hinzufügen',
		removeChip: 'Entfernen',
		pickDate: 'Datum wählen',
		target: 'Pool / Projekt',
		noProject: 'ohne Projekt',
		createPool: 'anlegen',
		addedTo: (pool: string) => `In „${pool}“ angelegt`
	},
	task: {
		newPlaceholder: 'Neue Aufgabe',
		title: 'Titel',
		done: 'Erledigt',
		expand: 'Ausklappen',
		collapse: 'Einklappen',
		details: 'Details',
		postpone: 'Zurückschieben',
		postponedTimes: (n: number) => `${n}× verschoben`,
		addTask: 'Aufgabe hinzufügen',
		addSubtask: 'Unteraufgabe hinzufügen',
		drag: 'Ziehen zum Verschieben',
		moved: (target: string) => `Nach „${target}“ verschoben`,
		notes: 'Notizen',
		notesPlaceholder: 'Notizen (Markdown)',
		edit: 'Bearbeiten',
		preview: 'Vorschau',
		due: 'Fällig',
		scheduled: 'Geplant',
		time: 'Uhrzeit',
		estimate: 'Zeitschätzung (Min.)',
		energy: 'Energie',
		energyLevels: { low: 'niedrig', mid: 'mittel', high: 'hoch' },
		pool: 'Pool',
		someday: 'Irgendwann',
		delete: 'Löschen',
		close: 'Schließen',
		created: 'Erstellt'
	},
	sections: {
		later: 'Später',
		someday: 'Irgendwann',
		done: 'Erledigt',
		empty: 'Keine offenen Aufgaben.'
	},
	postpone: {
		custom: 'Eigenes Datum',
		movedTo: (d: string) => `Verschoben auf ${d}`,
		reviewTitle: 'Schon mehrfach verschoben',
		reviewText: (title: string, n: number) =>
			`„${title}“ wurde bereits ${n}-mal verschoben. Aufteilen, ins „Irgendwann“ verschieben oder löschen?`,
		split: 'Aufteilen',
		someday: 'Irgendwann',
		delete: 'Löschen',
		anyway: 'Trotzdem verschieben'
	},
	confirm: {
		cancel: 'Abbrechen',
		openChildrenTitle: 'Unteraufgaben noch offen',
		openChildrenText: (n: number) =>
			n === 1 ? 'Eine Unteraufgabe ist noch offen.' : `${n} Unteraufgaben sind noch offen.`,
		completeAll: 'Alle erledigen',
		completeOnly: 'Nur diese',
		deleteTitle: 'Aufgabe löschen',
		deleteText: 'Diese Aufgabe hat Unteraufgaben. Sollen sie mitgelöscht werden?',
		deleteAll: 'Mit Unteraufgaben löschen',
		deleteOnly: 'Nur diese Aufgabe',
		deleted: 'Gelöscht',
		undo: 'Rückgängig'
	},
	inbox: {
		title: 'Inbox',
		triage: 'Aufräumen',
		empty: 'Die Inbox ist leer.',
		aged: (n: number) => `${n} Eintr${n === 1 ? 'ag liegt' : 'äge liegen'} schon länger hier.`,
		agedBadge: 'alt',
		assignTo: 'Pool zuweisen',
		someday: 'Irgendwann',
		someDayPick: 'Irgendwann – in welchen Pool?',
		setDate: 'Termin',
		delete: 'Löschen',
		skip: 'Überspringen',
		progress: (i: number, n: number) => `${i} von ${n}`,
		done: 'Fertig aufgeräumt!',
		back: 'Zurück zur Inbox',
		swipeHint: 'Wischen: ← löschen · → überspringen',
		keyHint: 'Tasten: 1–9 Pool · I Irgendwann · Entf löschen · → überspringen'
	},
	all: {
		title: 'Alle Pools',
		filter: 'Pools filtern'
	},
	picker: {
		color: 'Farbe wählen',
		customColor: 'Eigene Farbe …',
		icon: 'Icon wählen',
		noIcon: 'Kein Icon (Punkt)'
	},
	project: {
		new: 'Neues Projekt',
		newName: 'Name des neuen Projekts',
		edit: 'Projekt bearbeiten',
		delete: 'Projekt löschen',
		deleteTitle: 'Projekt löschen?',
		deleteText: (name: string) =>
			`„${name}“ wird gelöscht. Die Aufgaben bleiben im Pool, nur ohne Projekt.`,
		none: 'Ohne Projekt',
		notFound: 'Projekt nicht gefunden.'
	},
	pool: {
		edit: 'Pool bearbeiten',
		name: 'Name',
		color: 'Farbe',
		archive: 'Archivieren',
		unarchive: 'Wiederherstellen',
		archived: 'Archiviert',
		moveUp: 'Nach oben',
		moveDown: 'Nach unten',
		newName: 'Name des neuen Pools',
		notFound: 'Pool nicht gefunden.'
	},
	settings: {
		title: 'Einstellungen',
		appearance: 'Darstellung',
		theme: 'Farbschema',
		themes: { system: 'System', light: 'Hell', dark: 'Dunkel' },
		inbox: 'Inbox',
		agingDays: 'Einträge markieren nach (Tagen)',
		pools: 'Pools',
		about: 'Alle Daten liegen nur lokal auf diesem Gerät.'
	},
	toolbar: {
		outdent: 'Ausrücken',
		indent: 'Einrücken',
		up: 'Nach oben',
		down: 'Nach unten',
		done: 'Erledigt',
		hide: 'Tastatur ausblenden'
	}
};

export type Messages = typeof de;
