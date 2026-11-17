/**
 * Lokale Datenbank (IndexedDB über Dexie). Jede Schemaänderung bekommt eine neue
 * Versionsnummer; alte Versionen bleiben stehen, damit bestehende Daten migriert werden.
 */
import Dexie, { type EntityTable } from 'dexie';
import type { Conflict, SyncRecord, SyncState } from '#lib/sync/model.ts';
import type {
	Account,
	ContextMode,
	Pool,
	Project,
	Setting,
	Task,
	Template,
	WorkDay
} from '#lib/domain/types.ts';

export class TasksDB extends Dexie {
	pools!: EntityTable<Pool, 'id'>;
	projects!: EntityTable<Project, 'id'>;
	tasks!: EntityTable<Task, 'id'>;
	templates!: EntityTable<Template, 'id'>;
	contextModes!: EntityTable<ContextMode, 'id'>;
	settings!: EntityTable<Setting, 'key'>;
	accounts!: EntityTable<Account, 'id'>;
	syncState!: EntityTable<SyncState, 'poolId'>;
	syncRecords!: EntityTable<SyncRecord, 'taskId'>;
	conflicts!: EntityTable<Conflict, 'id'>;
	workDays!: EntityTable<WorkDay, 'date'>;

	constructor(name = 'tasks-app') {
		super(name);
		// Nur indizierte Felder stehen hier. Booleans lassen sich in IndexedDB nicht indizieren.
		this.version(1).stores({
			pools: 'id, kind, sortOrder',
			tasks: 'id, poolId, parentId, updatedAt',
			timeEntries: 'id, taskId, start',
			templates: 'id',
			contextModes: 'id',
			settings: 'key'
		});
		// v2: Projekte innerhalb von Pools
		this.version(2)
			.stores({ projects: 'id, poolId, sortOrder' })
			.upgrade((tx) =>
				tx
					.table('tasks')
					.toCollection()
					.modify((t: Task) => {
						t.projectId ??= null;
					})
			);
		// v3: CalDAV-Sync
		this.version(3).stores({
			accounts: 'id',
			syncState: 'poolId',
			syncRecords: 'taskId, poolId, url',
			conflicts: 'id, taskId'
		});
		// v4: Zeiteinträge liegen direkt an der Aufgabe (werden mit ihr synchronisiert);
		// die bisher ungenutzte eigene Tabelle entfällt.
		this.version(4).stores({ timeEntries: null });
		// v5: tatsächliche Arbeitszeit je Tag
		this.version(5).stores({ workDays: 'date' });
	}
}
