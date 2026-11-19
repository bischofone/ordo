/**
 * Deutsche UI-Texte. Für weitere Sprachen eine Datei mit gleicher Struktur anlegen
 * und in ./index.ts auswählen.
 */
export const de = {
	appName: 'Ordo',
	nav: {
		today: 'Heute',
		inbox: 'Inbox',
		all: 'Alle Pools',
		pools: 'Pools',
		settings: 'Einstellungen',
		times: 'Zeiten',
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
		edit: 'Inbox bearbeiten',
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
		swipeHint:
			'Karte auf einen Pool ziehen · nach links wischen: löschen · nach rechts: überspringen',
		dragHint: 'Auf einen Pool oder ein Projekt ziehen – oder antippen',
		cardDate: 'Fällig',
		noDate: 'Ohne Datum',
		trash: 'Löschen',
		laterTile: 'Irgendwann',
		forcedTitle: 'Inbox aufräumen ist jetzt dran',
		forcedText: (n: number) =>
			n === 1
				? 'Noch 1 Eintrag – danach geht es weiter.'
				: `Noch ${n} Einträge – danach geht es weiter.`,
		snooze: (min: number) => `${min} Min. später`,
		dueTitle: (n: number) =>
			n === 1
				? 'Zeit zum Aufräumen: 1 Eintrag in der Inbox'
				: `Zeit zum Aufräumen: ${n} Einträge in der Inbox`,
		dueReason: {
			time: (t: string) => `geplant um ${t}`,
			count: 'viele Einträge',
			age: 'alte Einträge'
		} as {
			time: (t: string) => string;
			count: string;
			age: string;
		},
		startTriage: 'Aufräumen',
		dismiss: 'Für jetzt ausblenden',
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
		deleteTitle: (name: string) => `Projekt „${name}“ löschen?`,
		deleteEmptyText: 'Das Projekt enthält keine Aufgaben.',
		deleteText: (tasks: number) =>
			`Das Projekt enthält ${tasks === 1 ? '1 Aufgabe' : `${tasks} Aufgaben`} (Unteraufgaben mitgezählt). Sollen sie im Pool bleiben oder mit gelöscht werden?`,
		deleteKeep: 'Aufgaben behalten',
		deleteWithTasks: 'Mit Aufgaben löschen',
		deleted: (name: string) => `Projekt „${name}“ gelöscht`,
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
		notFound: 'Pool nicht gefunden.',
		delete: 'Pool löschen',
		deleteTitle: (name: string) => `Pool „${name}“ löschen?`,
		deleteText: (tasks: number, projects: number) =>
			`${tasks === 1 ? '1 Aufgabe' : `${tasks} Aufgaben`}${
				projects ? ` und ${projects === 1 ? '1 Projekt' : `${projects} Projekte`}` : ''
			} ${tasks + projects === 1 ? 'wird' : 'werden'} endgültig gelöscht. Das lässt sich nicht rückgängig machen.`,
		deleteSyncedText: (account: string) =>
			` Der Pool wird mit „${account}“ synchronisiert: Soll die Liste auch dort gelöscht werden? Dann verschwindet sie auf allen Geräten.`,
		deleteLocal: 'Nur auf diesem Gerät löschen',
		deleteEverywhere: 'Auch auf dem Server löschen',
		deleted: (name: string) => `Pool „${name}“ gelöscht`
	},
	settings: {
		title: 'Einstellungen',
		sections: {
			darstellung: 'Darstellung',
			zeit: 'Zeiterfassung',
			inbox: 'Inbox',
			pools: 'Pools & Projekte',
			planung: 'Planung',
			sync: 'Sync',
			ki: 'KI',
			sicherung: 'Sicherung'
		},
		sectionsLabel: 'Bereiche',
		appearance: 'Darstellung',
		theme: 'Farbschema',
		themes: { system: 'System', light: 'Hell', dark: 'Dunkel' },
		accent: 'Akzentfarbe',
		accentDefault: 'Standard',
		density: 'Dichte',
		densities: { compact: 'Kompakt', normal: 'Normal', cozy: 'Luftig' },
		fontSize: 'Schriftgröße',
		fontSizes: { small: 'Klein', normal: 'Normal', large: 'Groß' },
		tintGroups: 'Farbige Gruppen',
		tintGroupsHint: 'Kopfzeilen von Pools und Projekten leicht in ihrer Farbe tönen',
		openDetailOnClick: 'Details beim Anklicken öffnen',
		openDetailOnClickHint:
			'Am PC: Klick auf eine Aufgabe zeigt die Details rechts daneben. Am Handy: neben den Titel tippen.',
		resetAppearance: 'Darstellung zurücksetzen',
		appearanceHint: 'Gilt nur für dieses Gerät.',
		poolsHint: 'Farbe, Icon, Name und Reihenfolge. Projekte stehen eingerückt unter ihrem Pool.',
		inbox: 'Alte Einträge',
		inboxHint: 'Einträge, die zu lange in der Inbox liegen, werden hervorgehoben.',
		agingDays: 'Einträge markieren nach (Tagen)',
		pools: 'Pools',
		about:
			'Alle Daten liegen lokal auf diesem Gerät – und, falls verbunden, auf deinem CalDAV-Server.',
		version: (v: string) => `Ordo ${v}`,
		checkUpdate: 'Nach neuer Version suchen',
		checking: 'Suche …',
		upToDate: 'Ordo ist aktuell.',
		updateCheckFailed: 'Server nicht erreichbar – später noch einmal versuchen.'
	},
	backup: {
		title: 'Sicherung erstellen',
		intro: 'Alle Aufgaben, Pools, Projekte, Zeiten und Einstellungen dieses Geräts als eine Datei.',
		password: 'Passwort für die Datei',
		passwordRepeat: 'Passwort wiederholen',
		passwordHint:
			'Empfohlen. Die Datei wird damit verschlüsselt (AES-256). Ohne das Passwort kann sie niemand öffnen – auch du nicht, also gut aufheben, z. B. im Passwort-Manager.',
		mismatch: 'Die Passwörter stimmen nicht überein.',
		tooShort: 'Mindestens 8 Zeichen.',
		secrets: 'Zugangsdaten mitsichern (Server-Passwörter, KI-Schlüssel)',
		secretsHint: 'Nur mit Passwort möglich – ohne Passwort enthält die Datei keine Zugangsdaten.',
		download: 'Sicherung herunterladen',
		working: 'Erstelle …',
		last: (when: string) => `Letzte Sicherung: ${when}`,
		never: 'Noch keine Sicherung von diesem Gerät.',
		restoreTitle: 'Wiederherstellen',
		restoreIntro:
			'Ersetzt alle Daten auf diesem Gerät durch eine Sicherung. Sicherungen älterer Ordo-Versionen werden dabei automatisch umgewandelt.',
		chooseFile: 'Sicherungsdatei wählen',
		locked: 'Diese Sicherung ist verschlüsselt.',
		unlock: 'Öffnen',
		checking: 'Prüfe …',
		summary: (n: { tasks: number; pools: number; projects: number; accounts: number }) =>
			`${n.tasks} Aufgaben · ${n.pools} Pools · ${n.projects} Projekte · ${n.accounts} Konten`,
		from: (when: string, version: string) => `Sicherung vom ${when} (Ordo ${version})`,
		withSecrets: 'mit Zugangsdaten',
		withoutSecrets:
			'ohne Zugangsdaten – auf diesem Gerät gespeicherte bleiben erhalten, fehlende musst du neu eingeben',
		problems: 'Die Sicherung ist beschädigt und wird nicht eingespielt:',
		replace: 'Alle Daten ersetzen',
		replaceTitle: 'Alle Daten ersetzen?',
		replaceText:
			'Alle Aufgaben und Einstellungen auf diesem Gerät werden durch die Sicherung ersetzt. Der jetzige Stand wird vorher aufgehoben und lässt sich hier wieder zurückholen. Mit dem Server verbundene Pools gleichen sich danach wieder mit dem Server ab.',
		undoTitle: 'Rückgängig',
		undoText: (when: string) => `Stand von vor der Wiederherstellung am ${when} ist aufgehoben.`,
		undo: 'Zurückholen',
		undoConfirm:
			'Die Daten werden auf den Stand von vor der letzten Wiederherstellung zurückgesetzt.',
		serverHint:
			'Auf dem eigenen Ordo-Server (Proxmox) sichert „update“ die Daten außerdem automatisch; von Hand mit „ordo sicherung“.'
	},
	update: {
		title: 'Neue Version von Ordo ist da',
		hint: 'Neu laden, um sie zu verwenden. Deine Daten bleiben erhalten.',
		reload: 'Neu laden',
		later: 'Später'
	},
	timeSettings: {
		title: 'Zeiterfassung',
		hint: 'Gilt nur für dieses Gerät.',
		enable: 'Zeiterfassungs-Modus',
		enableHint:
			'Zeigt Play-Knopf und Zeitfeld an jeder Aufgabe, den Zeit-Bereich in den Details und die Seite „Zeiten“.',
		targets: 'Soll-Zeit je Wochentag',
		targetsHint: 'z. B. 8:00 oder 7,5h – 0 für freie Tage',
		weekdays: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'],
		weekTotal: 'Soll pro Woche',
		round: 'Timer runden',
		roundHint: 'Beim Stoppen auf volle 5 oder 15 Minuten runden',
		roundExact: 'Genau'
	},
	triageSettings: {
		title: 'Inbox aufräumen',
		hint: 'Gilt nur für dieses Gerät.',
		mode: 'Aufräumen',
		modes: { off: 'Aus', suggest: 'Vorschlagen', force: 'Erzwingen' },
		modeHint:
			'Vorschlagen: Hinweis oben mit „Aufräumen“. Erzwingen: Die App öffnet das Aufräumen und lässt erst weiter, wenn die Inbox leer ist (einmal aufschieben möglich).',
		times: 'Zu festen Zeiten',
		addTime: 'Zeit hinzufügen',
		removeTime: 'Zeit entfernen',
		timeLabel: (i: number) => `Uhrzeit ${i + 1}`,
		rules: 'Nach Regeln',
		ruleCount: 'wenn mindestens',
		ruleCountUnit: 'Einträge in der Inbox liegen',
		ruleAge: 'wenn ein Eintrag älter als',
		ruleAgeUnit: 'Tage ist',
		snooze: '„Später“ schiebt auf um',
		minutes: 'Min.',
		onlyIfEntries: 'Nur, wenn etwas in der Inbox liegt.'
	},
	time: {
		title: 'Zeiten',
		target: 'Soll',
		worked: 'Gearbeitet',
		workedHint: 'Tatsächliche Arbeitszeit – hier eintragen',
		workedFor: (day: string) => `Gearbeitet am ${day}`,
		workedPlaceholder: 'eintragen',
		tracked: 'Getrackt',
		unassigned: 'Nicht zugeordnet',
		unassignedHint: 'Gearbeitet, aber noch keiner Aufgabe zugeordnet',
		missing: 'Fehlt aufs Soll',
		saldo: 'Saldo',
		saldoHint: 'Plus oder Minus gegenüber dem Soll, bis einschließlich heute',
		day: 'Tag',
		days: 'Tage',
		todaySummary: (tracked: string, target: string) => `Heute ${tracked} von ${target}`,
		notEntered: 'Arbeitszeit nicht eingetragen – die getrackte Zeit zählt als gearbeitet.',
		section: 'Zeit',
		start: 'Timer starten',
		stop: 'Timer stoppen',
		running: 'Timer läuft',
		logged: (d: string) => `${d} erfasst`,
		tooShort: 'Unter 30 Sekunden – nicht erfasst',
		rowLabel: 'Erfasste Zeit',
		rowHint: 'Erfasste Zeit – anklicken und überschreiben (z. B. 1:30, 0,5h, +0:15)',
		sumTitle: 'Summe mit Unteraufgaben',
		total: 'Gesamt',
		withChildren: (d: string) => `mit Unteraufgaben ${d}`,
		duration: 'Dauer',
		durationPlaceholder: '0:30 oder 0,5h',
		durationHint: '0:30 · 0,5h · 45min · 1h 30m',
		invalid: 'Zeitangabe nicht verstanden',
		date: 'Datum',
		add: 'Erfassen',
		deleteEntry: 'Eintrag löschen',
		noEntries: 'Noch keine Zeit erfasst.',
		period: 'Zeitraum',
		periods: { day: 'Tag', week: 'Woche', month: 'Monat' },
		prev: 'Zurück',
		next: 'Weiter',
		today: 'Heute',
		overview: 'Übersicht',
		byGroup: 'Nach Pool und Projekt',
		byTask: 'Nach Aufgabe',
		entries: 'Einträge',
		empty: 'In diesem Zeitraum wurde keine Zeit erfasst.',
		hours: 'Std.',
		untitled: '(ohne Titel)'
	},
	sync: {
		title: 'CalDAV-Konten',
		intro:
			'Du kannst mehrere CalDAV-Konten verbinden (z. B. privat und Arbeit, Radicale oder Nextcloud). Zugangsdaten bleiben nur auf diesem Gerät.',
		accounts: 'Konten',
		addAccount: 'Konto hinzufügen',
		accountName: 'Name (optional)',
		serverUrl: 'Server-Adresse',
		serverUrlHint: 'z. B. https://dav.example.de/ oder http://localhost:5232/',
		username: 'Benutzer',
		password: 'Passwort',
		connect: 'Verbinden',
		connecting: 'Verbinde …',
		remove: 'Entfernen',
		passwordMissing:
			'Passwort fehlt – bitte neu eingeben (die Sicherung enthielt keine Zugangsdaten).',
		newPassword: 'Passwort',
		savePassword: 'Prüfen und speichern',
		changePassword: 'Passwort ändern',
		checking: 'Prüfe …',
		removeTitle: 'Konto entfernen?',
		removeText: (name: string) =>
			`Die Verbindung zu „${name}“ wird gelöst. Aufgaben bleiben auf diesem Gerät und auf dem Server erhalten.`,
		poolLabel: 'Synchronisation',
		noAccount: 'Noch kein Konto verbunden.',
		usedBy: (pool: string) => `(Pool „${pool}“)`,
		linkedTo: (pool: string) => `Pool „${pool}“`,
		accountLists: 'Listen in diesem Konto',
		noLists: 'Noch keine Aufgabenlisten.',
		syncedWith: (account: string) => `Wird mit „${account}“ synchronisiert`,
		poolHint:
			'Welcher Pool wohin synchronisiert, stellst du im jeweiligen Pool ein (Stift neben dem Namen).',
		notSynced: 'Nicht synchronisieren',
		newList: (account: string) => `Neue Liste in „${account}“`,
		adopt: 'Als Pool übernehmen',
		syncNow: 'Jetzt synchronisieren',
		syncing: 'Synchronisiere …',
		lastSync: (when: string) => `Zuletzt: ${when}`,
		never: 'noch nie',
		error: 'Fehler',
		ok: 'Synchron',
		offline: 'Offline',
		conflicts: (n: number) => (n === 1 ? '1 Konflikt' : `${n} Konflikte`),
		passwordNote:
			'Hinweis: Im Browser liegt das Passwort unverschlüsselt in der lokalen Datenbank. In der Android-App kommt es später in den sicheren Speicher.'
	},
	conflicts: {
		title: 'Konflikte',
		intro:
			'Diese Felder wurden auf zwei Geräten unterschiedlich geändert. Wähle, welcher Stand gelten soll – die Aufgabe wird erst danach wieder hochgeladen.',
		none: 'Keine Konflikte. Alles synchron.',
		local: 'Dieses Gerät',
		remote: 'Server',
		empty: '(leer)',
		fields: {
			title: 'Titel',
			notes: 'Notizen',
			priority: 'Priorität',
			due: 'Fällig',
			scheduled: 'Geplant',
			rrule: 'Wiederholung',
			status: 'Status',
			completedAt: 'Erledigt am',
			parentId: 'Elternaufgabe',
			blockedBy: 'Blockiert durch',
			sortOrder: 'Reihenfolge',
			projectId: 'Projekt',
			someday: 'Irgendwann',
			postponeCount: 'Verschoben',
			estimateMin: 'Zeitschätzung',
			energy: 'Energie',
			waitingFor: 'Wartet auf',
			timeEntries: 'Erfasste Zeit'
		} as Record<string, string>
	},
	today: {
		title: 'Heute',
		overdue: 'Überfällig',
		planned: 'Für heute',
		doneToday: (n: number) => (n === 1 ? '1 heute erledigt' : `${n} heute erledigt`),
		empty: 'Für heute ist nichts geplant.',
		emptyHint: 'Wähle unten bei „Was als Nächstes?“ etwas aus oder plane deinen Tag.',
		planDay: 'Tag planen',
		planDayHint:
			'Überfälliges ansehen, Inbox aufräumen, Aufgaben für heute wählen – dauert zwei Minuten.',
		replan: 'Neu planen',
		dismiss: 'Ausblenden',
		estimate: (est: string, cap: string) => `${est} geschätzt von ${cap} verfügbar`,
		over: (m: string) => `${m} zu viel`,
		unestimated: (n: number) => (n === 1 ? '1 ohne Schätzung' : `${n} ohne Schätzung`),
		available: 'Verfügbar heute',
		availableHint: 'Zeit, die du heute für Aufgaben hast (z. B. 6:00 oder 4,5h)',
		carried: (n: number) => (n === 1 ? 'seit gestern' : `seit ${n} Tagen`),
		dueAt: 'fällig',
		overdueSince: (n: number) =>
			n === 1 ? 'seit gestern überfällig' : `seit ${n} Tagen überfällig`,
		addToday: 'Für heute einplanen',
		removeToday: 'Nicht heute',
		tomorrow: 'Auf morgen',
		review: 'Wochenrückblick',
		estimateLabel: 'Schätzung'
	},
	next: {
		title: 'Was als Nächstes?',
		hint: 'Vorschläge aus Priorität, Fälligkeit, Alter, Verschiebungen, Zeit und Energie.',
		minutes: 'Ich habe',
		minutesAny: 'beliebig Zeit',
		energy: 'Energie',
		energyAny: 'egal',
		none: 'Nichts Passendes offen – gut gemacht!',
		start: 'Für heute',
		planned: 'eingeplant',
		open: 'Öffnen',
		minutesOptions: [
			{ value: '', label: 'beliebig' },
			{ value: '15', label: '15 min' },
			{ value: '30', label: '30 min' },
			{ value: '60', label: '1 Std.' },
			{ value: '120', label: '2 Std.' }
		]
	},
	planFlow: {
		title: 'Tag planen',
		steps: ['Überfällig', 'Inbox', 'Auswählen', 'Fertig'],
		overdueTitle: 'Was ist überfällig?',
		overdueNone: 'Nichts überfällig. Weiter!',
		overdueHint: 'Für heute einplanen, verschieben, erledigen – oder bewusst liegen lassen.',
		inboxTitle: 'Inbox aufräumen',
		inboxCount: (n: number) =>
			n === 0
				? 'Die Inbox ist leer.'
				: n === 1
					? '1 Eintrag wartet in der Inbox.'
					: `${n} Einträge warten in der Inbox.`,
		inboxGo: 'Jetzt aufräumen',
		pickTitle: 'Was machst du heute?',
		pickHint: 'Vorschläge nach „Was als Nächstes?“ – abhaken, was heute drankommt.',
		pickNone: 'Keine offenen Aufgaben – du hast frei!',
		doneTitle: 'Dein Tag steht.',
		doneSummary: (n: number, est: string) =>
			n === 0
				? 'Heute ist nichts geplant.'
				: `${n} ${n === 1 ? 'Aufgabe' : 'Aufgaben'}, ${est} geschätzt.`,
		next: 'Weiter',
		back: 'Zurück',
		skip: 'Überspringen',
		finish: 'Zu „Heute“',
		someday: 'Irgendwann'
	},
	review: {
		title: 'Wochenrückblick',
		range: (from: string, to: string) => `${from} – ${to}`,
		done: 'Erledigt',
		postponed: 'Oft verschoben',
		time: 'Erfasst',
		created: 'Neu',
		nothing: 'In den letzten 7 Tagen ist hier nichts passiert.',
		more: (n: number) => `und ${n} weitere`,
		ai: 'KI-Rückblick',
		times: (n: number) => `${n}×`
	},
	planningSettings: {
		title: 'Planung',
		hint: 'Gilt nur für dieses Gerät.',
		capacity: 'Verfügbare Zeit pro Tag',
		capacityHint:
			'Gilt, wenn keine Soll-Zeit eingestellt ist. Lässt sich in „Heute“ für den Tag ändern.',
		weights: 'Was zählt bei „Was als Nächstes?“',
		weightsHint: 'Wie stark ein Grund in die Vorschläge eingeht.',
		weightNames: {
			priority: 'Priorität',
			due: 'Fälligkeit',
			planned: 'Für heute geplant',
			age: 'Alter',
			postponed: 'Oft verschoben',
			fit: 'Passt in meine Zeit',
			energy: 'Passt zu meiner Energie'
		},
		levels: [
			{ value: '0', label: 'aus' },
			{ value: '0.5', label: 'wenig' },
			{ value: '1', label: 'normal' },
			{ value: '2', label: 'stark' }
		],
		reset: 'Zurücksetzen'
	},
	nextcloud: {
		title: 'Nextcloud verbinden',
		intro: 'Aufgabenlisten und Kalender aus deiner Nextcloud – Ordo findet sie selbst.',
		url: 'Nextcloud-Adresse',
		urlPlaceholder: 'https://cloud.example.com',
		user: 'Benutzername',
		appPassword: 'App-Passwort',
		appPasswordHint:
			'Nicht dein normales Passwort: in Nextcloud unter Persönliche Einstellungen → Sicherheit → „Neues App-Passwort erstellen“.',
		openSecurity: 'App-Passwort in Nextcloud erstellen',
		connect: 'Verbinden',
		connecting: 'Verbinde …',
		other: 'Anderer CalDAV-Server',
		badLogin: 'Benutzername oder App-Passwort stimmt nicht.',
		viaProxy: 'über Ordo-Server',
		viaProxyHint:
			'Nextcloud erlaubt keine Anfragen direkt aus dem Browser – Ordo leitet sie über den eigenen Server weiter.',
		proxyMissing: (host: string) =>
			`${host} erlaubt keine Anfragen direkt aus dem Browser (CORS). Ordo kann sie über den eigenen Server weiterleiten – das muss dort einmal erlaubt werden:`,
		proxyLxc: (host: string) => `Proxmox-Container: ordo nextcloud ${host}`,
		proxyDocker: (host: string) => `Docker: in .env ORDO_PROXY_HOSTS=${host} und neu starten`,
		proxyDev: 'Lokal mit „pnpm dev“ funktioniert die Weiterleitung von selbst.',
		connected: (lists: number, calendars: number) =>
			`Verbunden: ${lists} ${lists === 1 ? 'Aufgabenliste' : 'Aufgabenlisten'}, ${calendars} ${calendars === 1 ? 'Kalender' : 'Kalender'}.`,
		nextSteps:
			'Listen unten „Als Pool übernehmen“. Für Termine im Pool über den Stift-Knopf einen Kalender wählen.'
	},
	calendar: {
		poolLabel: 'Termine im Kalender',
		none: 'nicht eintragen',
		hint: (min: string) =>
			`Geplante Aufgaben erscheinen als Termin – Dauer aus der Zeitschätzung, sonst ${min}.`,
		noAccount: 'Für Termine zuerst ein Konto verbinden (Nextcloud oder CalDAV).',
		loading: 'Kalender werden geladen …',
		settingsTitle: 'Termine im Kalender',
		settingsHint:
			'Für Pools mit Kalender: Aufgaben mit geplantem Datum werden als Termine eingetragen. Ordo ist dabei die Quelle.',
		duration: 'Standarddauer',
		durationHint: 'Für Aufgaben ohne Zeitschätzung (z. B. 0:30 oder 1h).',
		allDay: 'Aufgaben ohne Uhrzeit ganztägig eintragen',
		allDayHint: 'Sonst kommen nur Aufgaben mit Uhrzeit in den Kalender.',
		calendars: 'Kalender'
	},
	ai: {
		name: 'KI',
		settingsTitle: 'KI-Assistent',
		settingsHint:
			'Über OpenRouter. Der Schlüssel bleibt auf diesem Gerät. Jeder Aufruf sieht nur die Daten eines einzigen Pools.',
		key: 'API-Schlüssel',
		keyHint: 'Von openrouter.ai → Keys. Für Ordo reichen ein paar Dollar Guthaben für Jahre.',
		keyPlaceholder: 'sk-or-v1-…',
		showKey: 'Schlüssel zeigen',
		hideKey: 'Schlüssel verbergen',
		check: 'Prüfen',
		checking: 'Prüfe …',
		keyOk: (usage: string, limit: string) =>
			`Schlüssel gültig · bisher verbraucht ${usage}${limit}`,
		model: 'Modell',
		modelHint: 'Gilt für alle Pools, die kein eigenes Modell haben.',
		modelCustom: 'Anderes Modell …',
		modelCustomLabel: 'Modell-ID von OpenRouter',
		fallback: 'Ersatzmodell',
		fallbackHint: 'Springt ein, wenn das Hauptmodell gerade nicht erreichbar ist.',
		limit: 'Tageslimit',
		limitHint: 'Danach macht Ordo bis morgen keine KI-Aufrufe mehr.',
		cents: 'Cent',
		today: (cents: string, calls: number) =>
			`Heute: ${cents} Cent · ${calls} ${calls === 1 ? 'Aufruf' : 'Aufrufe'}`,
		privateOnly: 'Nur Anbieter ohne Datenspeicherung',
		privateOnlyHint:
			'OpenRouter leitet nur an Anbieter weiter, die Eingaben weder speichern noch zum Training verwenden.',
		poolTitle: 'KI in diesem Pool',
		poolEnable: 'KI-Funktionen',
		poolModel: 'Modell',
		poolModelDefault: 'Standard aus den Einstellungen',
		poolNotes: 'Kontext für die KI',
		poolNotesPlaceholder: 'z. B. „Ich arbeite als Schreiner, meine Kunden sind Privatleute.“',
		poolNotesHint: 'Geht bei jedem KI-Aufruf in diesem Pool mit – und nur hier.',
		inboxEnable: 'Pool-Vorschläge beim Aufräumen',
		inboxHint: 'Die KI sieht dabei nur den einzelnen Eintrag und die Namen deiner Pools.',
		noKey: 'Noch kein API-Schlüssel hinterlegt.',
		toSettings: 'Zu den Einstellungen',
		menu: 'KI-Funktionen',
		breakdown: 'Zerlegen',
		breakdownTitle: 'In Unteraufgaben zerlegen',
		tips: 'Tipps',
		tipsTitle: 'Lösungsansätze und Tipps',
		fromText: 'Aus Text erstellen',
		fromTextTitle: 'Aufgaben aus Text',
		fromTextLabel: 'Notizen, E-Mail, Gedanken – einfach einfügen',
		fromTextPlaceholder:
			'z. B. „Kunde Weber will bis Freitag wissen, ob Eiche oder Buche günstiger ist. Nächste Woche TÜV für den Transporter.“',
		dayPlan: 'Tagesplan',
		dayPlanTitle: 'Vorschlag für heute',
		weekReview: 'Wochenrückblick',
		weekReviewTitle: 'Rückblick auf die letzten 7 Tage',
		suggestPool: 'Pool vorschlagen',
		suggesting: 'Überlege …',
		suggestion: (pool: string, reason: string) =>
			`KI-Vorschlag: ${pool}${reason ? ` – ${reason}` : ''}`,
		noSuggestion: 'Die KI ist unsicher – kein Vorschlag.',
		start: 'Los',
		working: 'Die KI denkt nach …',
		again: 'Neu erzeugen',
		discard: 'Verwerfen',
		addTasks: (n: number) => (n === 1 ? '1 Aufgabe übernehmen' : `${n} Aufgaben übernehmen`),
		added: (n: number) => (n === 1 ? '1 Aufgabe angelegt' : `${n} Aufgaben angelegt`),
		toNotes: 'In Notizen übernehmen',
		notesAdded: 'Zu den Notizen hinzugefügt',
		copy: 'Kopieren',
		copied: 'Kopiert',
		close: 'Schließen',
		cost: (cents: string, model: string) => `${cents} Cent · ${model}`,
		suggestionHint: 'Nur ein Vorschlag – du entscheidest, was übernommen wird.',
		selectAll: 'Alle',
		selectNone: 'Keine',
		openTask: 'Aufgabe öffnen',
		planStart: 'Beginn',
		planWithTimes: 'Mit Uhrzeiten',
		planWithTimesHint: 'Steht beim Pool ein Kalender, erscheinen sie dort als Termine.',
		planEstimate: 'Dauer',
		planPriority: 'Priorität',
		planNone: '–',
		planTotal: (sum: string, end: string) => `Zusammen ${sum}, fertig etwa ${end}`,
		planTotalNoEnd: (sum: string) => `Zusammen ${sum}`,
		planApply: (n: number) =>
			n === 1 ? '1 Aufgabe für heute einplanen' : `${n} Aufgaben für heute einplanen`,
		planned: (n: number) =>
			n === 1 ? '1 Aufgabe für heute eingeplant' : `${n} Aufgaben für heute eingeplant`,
		undo: 'Rückgängig',
		allDay: 'ganztägig'
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
