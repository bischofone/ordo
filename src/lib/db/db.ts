import Dexie, { type EntityTable } from 'dexie';
import type {
	ContextMode,
	Pool,
	Project,
	Setting,
	Task,
	Template,
	TimeEntry
} from '#lib/domain/types.ts';

export class TasksDB extends Dexie {
	pools!: EntityTable<Pool, 'id'>;
	projects!: EntityTable<Project, 'id'>;
	tasks!: EntityTable<Task, 'id'>;
	timeEntries!: EntityTable<TimeEntry, 'id'>;
	templates!: EntityTable<Template, 'id'>;
	contextModes!: EntityTable<ContextMode, 'id'>;
	settings!: EntityTable<Setting, 'key'>;

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
	}
}
