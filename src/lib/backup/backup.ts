/**
 * Sicherung: alle Daten dieses Geräts als eine Datei – und zurück.
 *
 * Inhalt: jede Tabelle der lokalen Datenbank (Aufgaben, Pools, Projekte, Zeiten, Einstellungen,
 * Konten, Sync-Zuordnungen …) plus die Darstellung (liegt im Browser-Speicher). Dazu Version
 * und Schema der Datenbank: Beim Wiederherstellen einer ÄLTEREN Sicherung laufen dieselben
 * Migrationen wie bei einem Update (siehe src/lib/db/migrations.test.ts) – die Daten werden
 * erst in einer Zwischen-Datenbank auf den aktuellen Stand gebracht und geprüft, bevor
 * irgendetwas ersetzt wird.
 *
 * Zugangsdaten (Konto-Passwörter, KI-Schlüssel) kommen nur in verschlüsselte Dateien.
 * Ohne Passwort entsteht eine lesbare JSON-Datei ohne sie.
 */
import Dexie from 'dexie';
import { TasksDB } from '#lib/db/db.ts';
import { checkIntegrity } from '#lib/db/integrity.ts';
import type { Account, Pool, Project, Setting, Task } from '#lib/domain/types.ts';
import { decrypt, encrypt, type EncryptedBlock } from './crypto';

export const BACKUP_FORMAT = 'ordo-backup' as const;
export const BACKUP_VERSION = 1;

/** Einstellungen mit geheimen Feldern: Schlüssel → Feldnamen */
const SECRET_SETTINGS: Record<string, string[]> = { aiSettings: ['apiKey'] };

export interface BackupData {
	app: { version: string; commit: string };
	/** ISO-Zeitpunkt der Sicherung */
	createdAt: string;
	/** Enthält Konto-Passwörter und API-Schlüssel */
	secrets: boolean;
	db: {
		version: number;
		/** Tabelle → Dexie-Schema (Primärschlüssel, Indizes) dieser Version */
		schema: Record<string, string>;
		tables: Record<string, unknown[]>;
	};
	/** Was nicht in der Datenbank liegt (Darstellung im Browser-Speicher) */
	local: Record<string, unknown>;
}

export interface BackupFile {
	format: typeof BACKUP_FORMAT;
	version: number;
	createdAt: string;
	/** Verschlüsselt: der Inhalt steckt in `encrypted` */
	encrypted?: EncryptedBlock;
	content?: BackupData;
}

export class BackupError extends Error {}

export function schemaOf(db: Dexie) {
	return Object.fromEntries(
		db.tables.map((t) => [
			t.name,
			[t.schema.primKey.src, ...t.schema.indexes.map((i) => i.src)].join(', ')
		])
	);
}

/** Passwörter und Schlüssel leeren (Kopie) */
export function withoutSecrets(tables: Record<string, unknown[]>): Record<string, unknown[]> {
	const out = { ...tables };
	if (out.accounts) out.accounts = (out.accounts as Account[]).map((a) => ({ ...a, password: '' }));
	if (out.settings)
		out.settings = (out.settings as Setting[]).map((s) => {
			const fields = SECRET_SETTINGS[s.key];
			if (!fields || !s.value || typeof s.value !== 'object') return s;
			const value = { ...(s.value as Record<string, unknown>) };
			for (const f of fields) if (f in value) value[f] = '';
			return { ...s, value };
		});
	return out;
}

export async function collect(
	db: TasksDB,
	opts: { secrets: boolean; app: BackupData['app']; local?: Record<string, unknown>; now?: Date }
): Promise<BackupData> {
	if (!db.isOpen()) await db.open();
	const tables = await db.transaction('r', db.tables, async () => {
		const out: Record<string, unknown[]> = {};
		for (const t of db.tables) out[t.name] = await t.toArray();
		return out;
	});
	return {
		app: opts.app,
		createdAt: (opts.now ?? new Date()).toISOString(),
		secrets: opts.secrets,
		db: {
			version: db.verno,
			schema: schemaOf(db),
			tables: opts.secrets ? tables : withoutSecrets(tables)
		},
		local: opts.local ?? {}
	};
}

/** Datei-Inhalt. Mit Passwort verschlüsselt; ohne Passwort nie mit Zugangsdaten. */
export async function serialize(
	data: BackupData,
	password?: string,
	iterations?: number
): Promise<string> {
	const head = { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: data.createdAt };
	if (password) {
		const encrypted = await encrypt(JSON.stringify(data), password, iterations);
		return JSON.stringify({ ...head, encrypted } satisfies BackupFile);
	}
	const plain: BackupData = data.secrets
		? { ...data, secrets: false, db: { ...data.db, tables: withoutSecrets(data.db.tables) } }
		: data;
	return JSON.stringify({ ...head, content: plain } satisfies BackupFile, null, 1);
}

export type ReadResult = { locked: false; data: BackupData } | { locked: true; file: BackupFile };

/** Datei lesen: Ist sie eine Ordo-Sicherung, und braucht sie ein Passwort? */
export function readBackup(text: string): ReadResult {
	let file: BackupFile;
	try {
		file = JSON.parse(text);
	} catch {
		throw new BackupError('Das ist keine Ordo-Sicherung (keine JSON-Datei).');
	}
	if (!file || file.format !== BACKUP_FORMAT)
		throw new BackupError('Das ist keine Ordo-Sicherung.');
	if (typeof file.version !== 'number' || file.version > BACKUP_VERSION)
		throw new BackupError(
			'Diese Sicherung stammt von einer neueren Ordo-Version – bitte erst Ordo aktualisieren.'
		);
	if (file.encrypted) return { locked: true, file };
	if (!file.content) throw new BackupError('Die Sicherung ist leer oder beschädigt.');
	return { locked: false, data: file.content };
}

export async function unlock(file: BackupFile, password: string): Promise<BackupData> {
	if (!file.encrypted) throw new BackupError('Diese Sicherung ist nicht verschlüsselt.');
	return JSON.parse(await decrypt(file.encrypted, password)) as BackupData;
}

export interface PreparedRestore {
	data: BackupData;
	/** Auf den aktuellen Stand gebrachte Tabellen */
	tables: Record<string, unknown[]>;
	summary: { tasks: number; pools: number; projects: number; accounts: number };
	problems: string[];
}

/**
 * Sicherung in einer Zwischen-Datenbank öffnen: alte Versionen werden dabei migriert wie bei
 * einem Update. Liefert die fertigen Tabellen und eine Prüfung – ändert an den echten Daten nichts.
 */
export async function prepareRestore(data: BackupData): Promise<PreparedRestore> {
	const current = new TasksDB(`ordo-pruefung-${crypto.randomUUID()}`);
	const newest = current.verno;
	if (!data?.db?.tables || !data.db.schema || typeof data.db.version !== 'number')
		throw new BackupError('Die Sicherung ist unvollständig.');
	if (data.db.version > newest)
		throw new BackupError(
			'Diese Sicherung stammt von einer neueren Ordo-Version – bitte erst Ordo aktualisieren.'
		);
	const name = current.name;
	try {
		// 1. Genau so anlegen, wie die Version der Sicherung die Datenbank hatte
		const old = new Dexie(name);
		old.version(data.db.version).stores(data.db.schema);
		await old.open();
		await old.transaction('rw', old.tables, async () => {
			for (const [table, rows] of Object.entries(data.db.tables)) {
				if (!old.tables.some((t) => t.name === table)) continue;
				await old.table(table).bulkAdd(rows);
			}
		});
		old.close();
		// 2. Mit der aktuellen Version öffnen → Migrationen laufen
		await current.open();
		const tables: Record<string, unknown[]> = {};
		for (const t of current.tables) tables[t.name] = await t.toArray();
		const problems = checkIntegrity({
			pools: tables.pools as Pool[],
			projects: tables.projects as Project[],
			tasks: tables.tasks as Task[],
			accounts: tables.accounts as Account[]
		});
		const alive = (rows: unknown[]) => rows.filter((r) => !(r as { deletedAt?: number }).deletedAt);
		return {
			data,
			tables,
			problems,
			summary: {
				tasks: alive(tables.tasks).length,
				pools: tables.pools.length,
				projects: alive(tables.projects).length,
				accounts: (tables.accounts ?? []).length
			}
		};
	} catch (e) {
		if (e instanceof BackupError) throw e;
		throw new BackupError(`Die Sicherung lässt sich nicht lesen: ${(e as Error).message}`, {
			cause: e
		});
	} finally {
		current.close();
		await Dexie.delete(name);
	}
}

/**
 * Alle Daten durch die Sicherung ersetzen – in einem Rutsch (ganz oder gar nicht).
 * Fehlen in der Sicherung Zugangsdaten, bleiben die auf diesem Gerät gespeicherten erhalten.
 */
export async function applyRestore(db: TasksDB, prepared: PreparedRestore) {
	if (!db.isOpen()) await db.open();
	await db.transaction('rw', db.tables, async () => {
		const accounts = new Map((await db.accounts.toArray()).map((a) => [a.id, a]));
		const settings = new Map((await db.settings.toArray()).map((s) => [s.key, s.value]));
		for (const t of db.tables) {
			let rows = prepared.tables[t.name] ?? [];
			if (t.name === 'accounts')
				rows = (rows as Account[]).map((a) =>
					!a.password && accounts.get(a.id)?.password
						? { ...a, password: accounts.get(a.id)!.password }
						: a
				);
			if (t.name === 'settings')
				rows = (rows as Setting[]).map((s) => {
					const fields = SECRET_SETTINGS[s.key];
					const mine = settings.get(s.key) as Record<string, unknown> | undefined;
					if (!fields || !mine || !s.value || typeof s.value !== 'object') return s;
					const value = { ...(s.value as Record<string, unknown>) };
					for (const f of fields) if (!value[f] && mine[f]) value[f] = mine[f];
					return { ...s, value };
				});
			await t.clear();
			await t.bulkAdd(rows);
		}
	});
}

export function backupFileName(data: Pick<BackupData, 'createdAt'>, encrypted: boolean) {
	const d = new Date(data.createdAt);
	const p = (n: number) => String(n).padStart(2, '0');
	const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
	return `ordo-sicherung-${stamp}${encrypted ? '-verschluesselt' : ''}.json`;
}
