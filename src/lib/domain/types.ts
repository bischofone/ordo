/**
 * Kern-Datenmodell. Reine Typen, keine Abhängigkeiten zu DB oder UI.
 * Felder späterer Phasen sind bereits angelegt, damit keine DB-Migration nötig wird.
 */

/** Datum ohne Zeitzonen-Fallstricke: 'YYYY-MM-DD', optional 'HH:mm'. Ohne `time` = ganztägig (VALUE=DATE). */
export interface DateValue {
	date: string;
	time?: string;
}

export type Priority = 1 | 2 | 3;
export type Energy = 'low' | 'mid' | 'high';
export type TaskStatus = 'needs-action' | 'in-process' | 'completed' | 'cancelled';
export type WaitType = 'mail' | 'feedback' | 'question' | 'delivery' | 'person' | 'other';

export interface QuietHours {
	from: string; // 'HH:mm'
	to: string; // 'HH:mm'
}

export interface PoolSettings {
	notifications: boolean;
	quietHours?: QuietHours;
	/** Geräte-IDs, die benachrichtigt werden. Leer = alle. (Phase 3) */
	notifyDevices: string[];
	ai: { enabled: boolean; model?: string; contextNotes?: string };
}

export interface CaldavBinding {
	accountId: string;
	collectionUrl: string;
}

/** CalDAV-Konto. Zugangsdaten bleiben lokal auf dem Gerät. */
export interface Account {
	id: string;
	name: string;
	serverUrl: string;
	username: string;
	password: string;
	homeUrl?: string;
	createdAt: number;
}

export interface Pool {
	id: string;
	kind: 'pool' | 'inbox';
	name: string;
	color: string;
	/** Name eines Icons aus der Icon-Auswahl (optional). */
	icon?: string;
	sortOrder: string;
	archived: boolean;
	settings: PoolSettings;
	caldav?: CaldavBinding;
	createdAt: number;
	updatedAt: number;
}

/** Projekt innerhalb eines Pools (eine Ebene). Aufgaben ordnen sich per `projectId` zu. */
export interface Project {
	id: string;
	poolId: string;
	name: string;
	color: string;
	icon?: string;
	sortOrder: string;
	archived: boolean;
	createdAt: number;
	updatedAt: number;
	/** Gelöscht (bleibt für den Sync als Tombstone erhalten) */
	deletedAt?: number;
}

export interface WaitingFor {
	type: WaitType;
	text: string;
	followUp?: DateValue;
}

export interface Task {
	/** Entspricht später der VTODO-UID. */
	id: string;
	poolId: string;
	/** Projekt im Pool; null = ohne Projekt. Unteraufgaben tragen das Projekt ihrer Wurzel. */
	projectId: string | null;
	parentId: string | null;
	sortOrder: string;
	title: string;
	notes: string;
	priority: Priority | null;
	due?: DateValue;
	/** Geplantes Datum (DTSTART). Zurückschieben setzt dieses Feld. */
	scheduled?: DateValue;
	estimateMin?: number;
	energy?: Energy;
	rrule?: string;
	status: TaskStatus;
	completedAt?: number;
	/** „Irgendwann“-Ablage */
	someday: boolean;
	postponeCount: number;
	waitingFor?: WaitingFor;
	blockedBy: string[];
	/** Nur lokal (UI-Zustand), wird nicht gesynct. */
	collapsed: boolean;
	createdAt: number;
	updatedAt: number;
	/** Tombstone für den Sync. Gelöschte Aufgaben bleiben bis zum Sync erhalten. */
	deletedAt?: number;
}

export interface TimeEntry {
	id: string;
	taskId: string;
	start: number;
	/** null = Timer läuft */
	end: number | null;
}

export interface TemplateNode {
	title: string;
	notes?: string;
	children: TemplateNode[];
}

export interface Template {
	id: string;
	name: string;
	tree: TemplateNode[];
}

export interface ContextMode {
	id: string;
	name: string;
	visiblePools: string[];
	notifyPools: string[];
}

export interface Setting {
	key: string;
	value: unknown;
}

export const DEFAULT_POOL_SETTINGS: PoolSettings = {
	notifications: true,
	notifyDevices: [],
	ai: { enabled: false }
};

export const POOL_COLORS = [
	'#e5484d',
	'#f76b15',
	'#ffc53d',
	'#46a758',
	'#12a594',
	'#0090ff',
	'#6e56cf',
	'#d6409f',
	'#8d8d8d',
	'#a18072',
	'#3e63dd',
	'#bdee63'
] as const;

export const NEUTRAL_COLOR = '#8d8d8d';

export const isOpen = (t: Task) => t.status === 'needs-action' || t.status === 'in-process';
export const isDone = (t: Task) => !isOpen(t);
