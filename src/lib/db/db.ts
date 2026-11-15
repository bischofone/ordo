import Dexie, { type EntityTable } from 'dexie';
import type { ContextMode, Pool, Setting, Task, Template, TimeEntry } from '#lib/domain/types.ts';

export class TasksDB extends Dexie {
	pools!: EntityTable<Pool, 'id'>;
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
	}
}
