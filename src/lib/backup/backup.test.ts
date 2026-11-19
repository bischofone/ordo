import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { TasksDB } from '#lib/db/db.ts';
import { createRepo } from '#lib/db/repo.ts';
import {
	applyRestore,
	BackupError,
	collect,
	prepareRestore,
	readBackup,
	serialize,
	unlock,
	type BackupData
} from './backup';
import { WrongPassword } from './crypto';

const APP = { version: '0.8.0', commit: 'abc1234' };
/** Weniger Runden, damit die Tests schnell sind (im Betrieb 600 000) */
const FAST = 1_000;

const dbs: TasksDB[] = [];
async function freshDb() {
	const db = new TasksDB(`backup-${crypto.randomUUID()}`);
	dbs.push(db);
	await db.open();
	return db;
}
afterEach(async () => {
	for (const db of dbs.splice(0)) await db.delete();
});

async function filled() {
	const db = await freshDb();
	const repo = createRepo(db);
	await repo.ensureDefaults();
	const pool = (await db.pools.toArray()).find((p) => p.name === 'Arbeit')!;
	const a = await repo.createTask({ poolId: pool.id, title: 'Angebot schreiben', priority: 1 });
	await repo.createTask({ poolId: pool.id, title: 'Unteraufgabe', parentId: a });
	await repo.setTimeTotal(a, 45);
	await db.accounts.add({
		id: 'acc1',
		name: 'Server',
		serverUrl: 'https://dav.example.com/',
		username: 'alex',
		password: 'geheim',
		createdAt: 1
	});
	await repo.setSetting('aiSettings', { apiKey: 'sk-or-v1-ECHT', model: 'x' });
	await repo.setSetting('inboxAgingDays', 4);
	return { db, taskId: a };
}

const setting = async (db: TasksDB, key: string) => (await db.settings.get(key))?.value;

describe('Sicherung ohne Passwort', () => {
	it('enthält alle Daten, aber keine Zugangsdaten', async () => {
		const { db } = await filled();
		const text = await serialize(await collect(db, { secrets: true, app: APP }));
		expect(text).not.toContain('geheim');
		expect(text).not.toContain('sk-or-v1-ECHT');
		expect(text).toContain('Angebot schreiben');
		const r = readBackup(text);
		expect(r.locked).toBe(false);
		if (!r.locked) expect(r.data.secrets).toBe(false);
	});

	it('wiederherstellen auf einem neuen Gerät ergibt dieselben Daten (Passwort fehlt)', async () => {
		const { db, taskId } = await filled();
		const text = await serialize(await collect(db, { secrets: false, app: APP }));
		const target = await freshDb();
		const r = readBackup(text);
		if (r.locked) throw new Error('unerwartet verschlüsselt');
		const prepared = await prepareRestore(r.data);
		expect(prepared.problems).toEqual([]);
		expect(prepared.summary).toMatchObject({ tasks: 2, pools: 3, accounts: 1 });
		await applyRestore(target, prepared);
		expect(await target.tasks.get(taskId)).toEqual(await db.tasks.get(taskId));
		expect(await target.tasks.count()).toBe(await db.tasks.count());
		expect((await target.accounts.get('acc1'))!.password).toBe('');
		expect(await setting(target, 'inboxAgingDays')).toBe(4);
	});

	it('Zugangsdaten, die auf dem Gerät schon gespeichert sind, bleiben erhalten', async () => {
		const { db } = await filled();
		const text = await serialize(await collect(db, { secrets: false, app: APP }));
		const r = readBackup(text);
		if (r.locked) throw new Error('unerwartet verschlüsselt');
		await applyRestore(db, await prepareRestore(r.data));
		expect((await db.accounts.get('acc1'))!.password).toBe('geheim');
		expect(await setting(db, 'aiSettings')).toMatchObject({ apiKey: 'sk-or-v1-ECHT' });
	});
});

describe('Sicherung mit Passwort', () => {
	it('ist verschlüsselt: weder Aufgaben noch Zugangsdaten lesbar', async () => {
		const { db } = await filled();
		const text = await serialize(
			await collect(db, { secrets: true, app: APP }),
			'richtig-gut',
			FAST
		);
		expect(text).not.toContain('Angebot');
		expect(text).not.toContain('geheim');
		const file = JSON.parse(text);
		expect(file.encrypted).toMatchObject({ kdf: 'PBKDF2-SHA256', cipher: 'AES-256-GCM' });
	});

	it('mit richtigem Passwort: alles zurück, inklusive Zugangsdaten', async () => {
		const { db, taskId } = await filled();
		const text = await serialize(
			await collect(db, { secrets: true, app: APP }),
			'richtig-gut',
			FAST
		);
		const r = readBackup(text);
		if (!r.locked) throw new Error('sollte verschlüsselt sein');
		const data = await unlock(r.file, 'richtig-gut');
		const target = await freshDb();
		await applyRestore(target, await prepareRestore(data));
		expect(await target.tasks.get(taskId)).toEqual(await db.tasks.get(taskId));
		expect((await target.accounts.get('acc1'))!.password).toBe('geheim');
		expect(await setting(target, 'aiSettings')).toMatchObject({ apiKey: 'sk-or-v1-ECHT' });
	});

	it('falsches Passwort und veränderte Datei werden erkannt', async () => {
		const { db } = await filled();
		const text = await serialize(
			await collect(db, { secrets: true, app: APP }),
			'richtig-gut',
			FAST
		);
		const r = readBackup(text);
		if (!r.locked) throw new Error('sollte verschlüsselt sein');
		await expect(unlock(r.file, 'falsch')).rejects.toBeInstanceOf(WrongPassword);
		const tampered = structuredClone(r.file);
		const bytes = atob(tampered.encrypted!.data);
		tampered.encrypted!.data = btoa(
			bytes.slice(0, 20) + String.fromCharCode(bytes.charCodeAt(20) ^ 1) + bytes.slice(21)
		);
		await expect(unlock(tampered, 'richtig-gut')).rejects.toBeInstanceOf(WrongPassword);
	});
});

describe('Ältere und fremde Dateien', () => {
	it('Sicherung einer älteren Ordo-Version wird beim Wiederherstellen migriert', async () => {
		// Echte Datenbank der ersten Version als Sicherung verpackt
		const fx = JSON.parse(
			readFileSync(new URL('../db/fixtures/v1.json', import.meta.url), 'utf8')
		) as { verno: number; tables: Record<string, { schema: string; rows: unknown[] }> };
		const data: BackupData = {
			app: { version: '0.1.0', commit: '3098571' },
			createdAt: '2026-10-01T10:00:00.000Z',
			secrets: false,
			db: {
				version: fx.verno,
				schema: Object.fromEntries(Object.entries(fx.tables).map(([k, v]) => [k, v.schema])),
				tables: Object.fromEntries(Object.entries(fx.tables).map(([k, v]) => [k, v.rows]))
			},
			local: {}
		};
		const prepared = await prepareRestore(data);
		expect(prepared.problems).toEqual([]);
		const target = await freshDb();
		await applyRestore(target, prepared);
		const tasks = await target.tasks.toArray();
		expect(tasks.find((t) => t.title === 'Angebot schreiben')!.projectId).toBe(null);
		expect(tasks.length).toBe(fx.tables.tasks.rows.length);
	});

	it('Sicherung einer neueren Version wird abgelehnt (statt Daten zu verlieren)', async () => {
		const { db } = await filled();
		const data = await collect(db, { secrets: false, app: APP });
		data.db.version += 1;
		await expect(prepareRestore(data)).rejects.toThrow('neueren Ordo-Version');
		const file = JSON.parse(await serialize(data));
		file.version = 99;
		expect(() => readBackup(JSON.stringify(file))).toThrow('neueren Ordo-Version');
	});

	it('andere Dateien werden verständlich abgelehnt', () => {
		expect(() => readBackup('hallo')).toThrow(BackupError);
		expect(() => readBackup('{"a":1}')).toThrow('keine Ordo-Sicherung');
	});

	it('beschädigte Daten werden vor dem Ersetzen erkannt', async () => {
		const { db } = await filled();
		const data = await collect(db, { secrets: false, app: APP });
		(data.db.tables.tasks[0] as { poolId: string }).poolId = 'gibt-es-nicht';
		const prepared = await prepareRestore(data);
		expect(prepared.problems.join()).toContain('keinem vorhandenen Pool');
	});
});
