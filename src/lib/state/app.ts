import { TasksDB } from '#lib/db/db.ts';
import { createRepo } from '#lib/db/repo.ts';

/** Eine Datenbank pro Gerät/Browser. Die App läuft rein clientseitig (ssr = false). */
export const db = new TasksDB();
export const repo = createRepo(db);
