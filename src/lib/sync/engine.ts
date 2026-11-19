/**
 * Sync-Engine: gleicht jeden verbundenen Pool mit seiner CalDAV-Liste ab.
 * Unabhängig von der Oberfläche – bekommt nur die Datenbank und eine Client-Fabrik.
 *
 * Ablauf pro Pool:
 *   1. Holen: Änderungen seit dem letzten sync-token (sonst Vergleich aller ETags),
 *      geänderte Aufgaben laden und pro Feld mit den lokalen zusammenführen.
 *   2. Projekte und Name/Farbe der Liste abgleichen.
 *   3. Senden: neue, geänderte und gelöschte Aufgaben hochladen – immer mit ETag-Prüfung.
 * Lokale Änderungen „warten“ automatisch: Eine Aufgabe gilt als geändert, solange sie sich
 * von ihrem letzten synchronisierten Stand unterscheidet. Offline passiert einfach nichts,
 * beim nächsten Lauf geht alles raus.
 */
import { uuid } from '#lib/domain/id.ts';
import { bySortOrder, childrenOf, keyAtEnd } from '#lib/domain/tree.ts';
import {
	DEFAULT_POOL_SETTINGS,
	type Account,
	type Pool,
	type Project,
	type Task
} from '#lib/domain/types.ts';
import type { TasksDB } from '#lib/db/db.ts';
import {
	CaldavError,
	createClient,
	fetchTransport,
	proxyTransport,
	InvalidSyncToken,
	PreconditionFailed,
	type CaldavClient,
	type Transport
} from './caldav';
import { changedFields, pickSyncFields, sameValue } from './fields';
import { merge3 } from './merge';
import type { SyncRecord, SyncState } from './model';
import { parseTodo, writeTodo } from './vtodo';
import { pushCalendar, type CalendarReport } from './calendar';

export interface SyncReport {
	pulled: number;
	pushed: number;
	deleted: number;
	conflicts: number;
}

/** Projekt, wie es in der Liste gespeichert wird */
type RemoteProject = Pick<
	Project,
	'id' | 'name' | 'color' | 'icon' | 'sortOrder' | 'archived' | 'updatedAt' | 'deletedAt'
>;

export function createSyncEngine(
	db: TasksDB,
	opts: { transport?: Transport; clock?: () => Date; proxyOrigin?: string } = {}
) {
	const now = () => (opts.clock ?? (() => new Date()))().getTime();
	/** Client für ein Konto – bei Bedarf über die Weiterleitung des eigenen Servers (gegen CORS) */
	const clientFor = (account: Account): CaldavClient => {
		const base = opts.transport ?? fetchTransport;
		const origin = opts.proxyOrigin ?? globalThis.location?.origin;
		return createClient(
			account,
			account.proxy && origin ? proxyTransport(base, origin) : opts.transport
		);
	};

	const isDirty = (task: Task, rec: SyncRecord) =>
		changedFields(pickSyncFields(task), rec.base).length > 0;

	/**
	 * Nie zwei Abgleiche desselben Pools gleichzeitig – auch nicht aus zwei Browser-Tabs
	 * (Web Locks, falls vorhanden; sonst innerhalb dieser Seite per Warteschlange).
	 */
	const running = new Map<string, Promise<unknown>>();
	function exclusive<T>(poolId: string, fn: () => Promise<T>): Promise<T> {
		const prev = running.get(poolId) ?? Promise.resolve();
		const locks = (globalThis.navigator as Navigator | undefined)?.locks;
		const run = () => (locks ? locks.request(`tasks-sync-${poolId}`, fn) : fn());
		const next = prev.catch(() => undefined).then(run);
		running.set(poolId, next);
		return next as Promise<T>;
	}

	function syncPool(poolId: string): Promise<SyncReport> {
		return exclusive(poolId, () => syncPoolNow(poolId));
	}

	async function syncPoolNow(poolId: string): Promise<SyncReport> {
		const pool = await db.pools.get(poolId);
		if (!pool?.caldav) throw new Error('Pool ist nicht verbunden');
		const account = await db.accounts.get(pool.caldav.accountId);
		if (!account) throw new Error('Konto fehlt');
		const client = clientFor(account);
		const listUrl = pool.caldav.collectionUrl;
		const report: SyncReport = { pulled: 0, pushed: 0, deleted: 0, conflicts: 0 };
		const state = (await db.syncState.get(poolId)) ?? { poolId };

		try {
			// ---------- 1. Holen ----------
			const records = await db.syncRecords.where('poolId').equals(poolId).toArray();
			const byUrl = new Map(records.map((r) => [r.url, r]));
			let changedUrls: string[];
			let deletedUrls: string[];
			let token: string | undefined;

			const fullScan = async () => {
				const info = await client.listInfo(listUrl);
				token = info.syncToken;
				const items = await client.listItems(listUrl);
				const seen = new Set(items.map((i) => i.url));
				changedUrls = items.filter((i) => byUrl.get(i.url)?.etag !== i.etag).map((i) => i.url);
				deletedUrls = records.map((r) => r.url).filter((u) => !seen.has(u));
			};

			if (state.syncToken) {
				try {
					const ch = await client.changesSince(listUrl, state.syncToken);
					token = ch.token;
					// Eigene Uploads kommen mit bekanntem ETag zurück → nichts zu tun.
					changedUrls = ch.changed
						.filter((i) => byUrl.get(i.url)?.etag !== i.etag)
						.map((i) => i.url);
					deletedUrls = ch.deleted.filter((u) => byUrl.has(u));
				} catch (e) {
					if (!(e instanceof InvalidSyncToken)) throw e;
					await fullScan();
				}
			} else {
				await fullScan();
			}

			const fetched = (await client.fetchItems(listUrl, changedUrls!)).map((item) => ({
				...item,
				parsed: parseTodo(item.ics)
			}));
			// Fremde Aufgaben ohne eigenen Sortierschlüssel in ihrer bisherigen Reihenfolge einsortieren.
			fetched.sort(
				(a, b) =>
					(a.parsed.appleSort ?? a.parsed.created ?? 0) -
					(b.parsed.appleSort ?? b.parsed.created ?? 0)
			);
			for (const item of fetched) {
				report.conflicts += await applyRemote(pool, item.url, item.etag, item.ics, item.parsed);
				report.pulled++;
			}
			for (const url of deletedUrls!) {
				if (await applyRemoteDelete(byUrl.get(url)!)) report.deleted++;
			}

			// ---------- 2. Liste: Projekte, Name, Farbe ----------
			await syncListMeta(client, pool, listUrl);

			// ---------- 3. Senden ----------
			const pushed = await push(client, pool, listUrl);
			report.pushed += pushed.pushed;
			report.deleted += pushed.deleted;
			report.conflicts += pushed.conflicts;

			// Token vom Holen speichern (nicht danach!): so kann zwischen Holen und Senden
			// keine fremde Änderung verloren gehen. Eigene Uploads erkennt der nächste Lauf am ETag.
			await saveState(poolId, { syncToken: token, lastSync: now(), lastError: undefined });
			return report;
		} catch (e) {
			// Liste fehlt auf dem Server (z. B. auf einem anderen Gerät gelöscht): lokal bleibt
			// alles erhalten, der Nutzer entscheidet (Pool löschen oder neu verbinden).
			const err = e instanceof CaldavError && e.status === 404 ? new Error(LIST_GONE) : e;
			await saveState(poolId, { lastError: errorText(err) });
			throw err;
		}
	}

	/** Eine geänderte Aufgabe vom Server übernehmen. Liefert die Zahl neuer Konflikte. */
	async function applyRemote(
		pool: Pool,
		url: string,
		etag: string,
		ics: string,
		parsed: ReturnType<typeof parseTodo>
	): Promise<number> {
		return db.transaction('rw', db.tasks, db.syncRecords, db.conflicts, async () => {
			const remote = parsed.fields;
			const task = await db.tasks.get(parsed.uid);
			const record = await db.syncRecords.get(parsed.uid);

			// Fremde Aufgaben haben keinen eigenen Sortierschlüssel → lokalen behalten oder vergeben.
			if (!parsed.hasOwnSort) {
				remote.sortOrder =
					record?.base.sortOrder ||
					task?.sortOrder ||
					keyAtEnd(
						childrenOf(await db.tasks.where('poolId').equals(pool.id).toArray(), remote.parentId)
					);
			}

			const t = now();
			if (!task) {
				await db.tasks.add({
					...remote,
					id: parsed.uid,
					poolId: pool.id,
					collapsed: false,
					createdAt: parsed.created ?? t,
					updatedAt: t
				});
				await db.syncRecords.put({
					taskId: parsed.uid,
					poolId: pool.id,
					url,
					etag,
					ics,
					base: remote
				});
				return 0;
			}

			if (task.deletedAt && task.poolId === pool.id) {
				// Lokal gelöscht, auf dem Server aber weiterbearbeitet → nichts verlieren: wiederherstellen.
				await db.tasks.update(task.id, { ...remote, deletedAt: undefined, updatedAt: t });
				await db.syncRecords.put({
					taskId: task.id,
					poolId: pool.id,
					url,
					etag,
					ics,
					base: remote
				});
				return 0;
			}

			if (task.poolId !== pool.id) {
				// Lokal in einen anderen Pool verschoben, noch nicht hochgeladen → nicht zurückholen.
				return 0;
			}

			const local = pickSyncFields(task);
			const base = record?.base ?? local;
			const { merged, conflicts } = merge3(base, local, remote);
			// Nur schreiben, wenn sich lokal wirklich etwas ändert (sonst würde das einen neuen Sync auslösen).
			if (changedFields(local, merged).length) {
				await db.tasks.update(task.id, { ...merged, updatedAt: t });
			}
			await db.syncRecords.put({
				taskId: task.id,
				poolId: pool.id,
				url,
				etag,
				ics,
				base: remote,
				conflict: conflicts.length > 0
			});
			await db.conflicts.where('taskId').equals(task.id).delete();
			for (const c of conflicts) {
				await db.conflicts.add({
					id: `${task.id}:${c.field}`,
					taskId: task.id,
					...c,
					createdAt: t
				});
			}
			return conflicts.length;
		});
	}

	/** Auf dem Server gelöscht. Lokal geänderte Aufgaben bleiben erhalten (werden neu angelegt). */
	async function applyRemoteDelete(record: SyncRecord) {
		return db.transaction('rw', db.tasks, db.syncRecords, db.conflicts, async () => {
			const task = await db.tasks.get(record.taskId);
			await db.syncRecords.delete(record.taskId);
			await db.conflicts.where('taskId').equals(record.taskId).delete();
			if (task && !task.deletedAt && isDirty(task, record)) return false;
			await db.tasks.delete(record.taskId);
			return true;
		});
	}

	async function push(client: CaldavClient, pool: Pool, listUrl: string) {
		const result = { pushed: 0, deleted: 0, conflicts: 0 };
		const tasks = await db.tasks.where('poolId').equals(pool.id).toArray();
		const records = new Map(
			(await db.syncRecords.where('poolId').equals(pool.id).toArray()).map((r) => [r.taskId, r])
		);
		// Aufgaben, die in einen anderen Pool gewandert sind, hier löschen (dort werden sie neu angelegt).
		for (const rec of records.values()) {
			const task = tasks.find((t) => t.id === rec.taskId);
			if (task) continue;
			await client.deleteItem(rec.url, rec.etag).catch(ignorePrecondition);
			await db.syncRecords.delete(rec.taskId);
			result.deleted++;
		}

		// Eltern vor Kindern hochladen (für Clients, die das erwarten)
		const ordered = [...tasks].sort(
			(a, b) => depth(tasks, a) - depth(tasks, b) || bySortOrder(a, b)
		);
		for (const task of ordered) {
			let rec = records.get(task.id);
			if (task.deletedAt) {
				if (rec) {
					try {
						await client.deleteItem(rec.url, rec.etag);
					} catch (e) {
						if (e instanceof PreconditionFailed) continue; // inzwischen geändert → nächster Lauf
						throw e;
					}
					await db.syncRecords.delete(task.id);
					result.deleted++;
				}
				await db.tasks.delete(task.id);
				continue;
			}
			if (!rec) {
				// Stammt die Aufgabe aus einem anderen Pool? Dann dort auf dem Server löschen.
				const foreign = await db.syncRecords.get(task.id);
				if (foreign && foreign.poolId !== pool.id) {
					await deleteRemoteRecord(foreign);
					result.deleted++;
				}
			}
			if (rec?.conflict) continue;
			const fields = pickSyncFields(task);
			if (!rec) {
				const url = new URL(`${encodeURIComponent(task.id)}.ics`, listUrl).toString();
				const ics = writeTodo(task.id, fields);
				try {
					const etag = await client.putItem(url, ics, { create: true });
					await db.syncRecords.put({
						taskId: task.id,
						poolId: pool.id,
						url,
						etag,
						ics,
						base: fields
					});
					result.pushed++;
				} catch (e) {
					if (!(e instanceof PreconditionFailed)) throw e;
					// Gibt es schon (z. B. zweites Gerät) → laden, zusammenführen, nächster Lauf sendet.
					result.conflicts += await refetch(client, pool, listUrl, url);
				}
				continue;
			}
			if (!isDirty(task, rec)) continue;
			for (let attempt = 0; attempt < 2; attempt++) {
				const ics = writeTodo(task.id, fields, { previous: rec.ics, base: rec.base });
				try {
					const etag = await client.putItem(rec.url, ics, { etag: rec.etag });
					await db.syncRecords.put({ ...rec, etag, ics, base: fields });
					result.pushed++;
					break;
				} catch (e) {
					if (!(e instanceof PreconditionFailed)) throw e;
					// Jemand war schneller: neu laden, zusammenführen, nochmal versuchen.
					result.conflicts += await refetch(client, pool, listUrl, rec.url);
					rec = await db.syncRecords.get(task.id);
					const fresh = await db.tasks.get(task.id);
					if (!rec || rec.conflict || !fresh) break;
					Object.assign(fields, pickSyncFields(fresh));
				}
			}
		}
		return result;
	}

	async function deleteRemoteRecord(rec: SyncRecord) {
		const other = await db.pools.get(rec.poolId);
		const account = other?.caldav && (await db.accounts.get(other.caldav.accountId));
		if (account) await clientFor(account).deleteItem(rec.url, rec.etag).catch(ignorePrecondition);
		await db.syncRecords.delete(rec.taskId);
	}

	async function refetch(client: CaldavClient, pool: Pool, listUrl: string, url: string) {
		const [item] = await client.fetchItems(listUrl, [url]);
		if (!item) return 0;
		return applyRemote(pool, item.url, item.etag, item.ics, parseTodo(item.ics));
	}

	/** Projekte (als JSON-Eigenschaft der Liste) sowie Name und Farbe abgleichen. */
	async function syncListMeta(client: CaldavClient, pool: Pool, listUrl: string) {
		const info = await client.listInfo(listUrl);
		const remote = parseProjects(info.projects);
		const local = await db.projects.where('poolId').equals(pool.id).toArray();
		const merged = new Map<string, RemoteProject>();
		for (const p of [...remote, ...local]) {
			const prev = merged.get(p.id);
			if (!prev || p.updatedAt > prev.updatedAt) merged.set(p.id, pick(p));
		}
		const t = now();
		for (const p of merged.values()) {
			const l = local.find((x) => x.id === p.id);
			if (!l) await db.projects.add({ ...p, poolId: pool.id, createdAt: t });
			else if (p.updatedAt > l.updatedAt) await db.projects.update(p.id, p);
		}
		const all = [...merged.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
		const sortedRemote = [...remote].map(pick).sort((a, b) => (a.id < b.id ? -1 : 1));
		const metaPatch: { projects?: string; displayName?: string; color?: string } = {};
		if (!sameValue(all, sortedRemote)) metaPatch.projects = JSON.stringify(all);

		// Name/Farbe: wer seit dem letzten Abgleich geändert hat, gewinnt (lokal bei Gleichstand).
		const state = await db.syncState.get(pool.id);
		const last = state?.meta;
		const fresh = (await db.pools.get(pool.id))!;
		const localMeta = { name: fresh.name, color: fresh.color };
		const remoteMeta = { name: info.displayName, color: info.color };
		const localChanged = !last || last.name !== localMeta.name || last.color !== localMeta.color;
		const remoteChanged =
			!!last && (last.name !== remoteMeta.name || last.color !== remoteMeta.color);
		let meta = localMeta;
		if (remoteChanged && !localChanged) {
			meta = { name: remoteMeta.name || fresh.name, color: remoteMeta.color ?? fresh.color };
			await db.pools.update(pool.id, { name: meta.name, color: meta.color, updatedAt: t });
		} else if (localChanged) {
			if (remoteMeta.name !== localMeta.name) metaPatch.displayName = localMeta.name;
			if (remoteMeta.color !== localMeta.color) metaPatch.color = localMeta.color;
		}
		await client.updateList(listUrl, metaPatch);
		await saveState(pool.id, { meta });
	}

	/** Sync-Zustand ergänzen (immer frisch lesen, damit nichts überschrieben wird). */
	async function saveState(poolId: string, patch: Partial<SyncState>) {
		await db.syncState.put({ ...(await db.syncState.get(poolId)), ...patch, poolId });
	}

	return {
		syncPool,

		/** Konto anlegen: Zugangsdaten prüfen und das Verzeichnis der Listen finden. */
		async addAccount(data: {
			name?: string;
			serverUrl: string;
			username: string;
			password: string;
			proxy?: boolean;
			kind?: Account['kind'];
		}) {
			const serverUrl = data.serverUrl.endsWith('/') ? data.serverUrl : `${data.serverUrl}/`;
			const account: Account = {
				id: uuid(),
				name: data.name?.trim() || new URL(serverUrl).host,
				serverUrl,
				username: data.username,
				password: data.password,
				...(data.proxy ? { proxy: true } : {}),
				...(data.kind ? { kind: data.kind } : {}),
				createdAt: now()
			};
			const { homeUrl } = await clientFor(account).discover();
			account.homeUrl = homeUrl;
			await db.accounts.add(account);
			return account;
		},

		/** Neues Passwort eintragen (z. B. nach dem Wiederherstellen einer Sicherung ohne
		 *  Zugangsdaten) – wird vorher beim Server geprüft. */
		async setAccountPassword(accountId: string, password: string) {
			const account = await db.accounts.get(accountId);
			if (!account) throw new Error('Konto nicht gefunden');
			const next = { ...account, password };
			await clientFor(next).discover();
			await db.accounts.update(accountId, { password });
		},

		async removeAccount(accountId: string) {
			for (const p of await db.pools.toArray()) {
				if (p.caldav?.accountId === accountId) await this.unbindPool(p.id);
			}
			await db.accounts.delete(accountId);
		},

		/**
		 * Zugang prüfen, ohne etwas zu speichern – erst direkt, dann (falls der Browser wegen
		 * CORS blockt) über die Weiterleitung des eigenen Servers. Liefert, was geklappt hat.
		 */
		async probe(data: { serverUrl: string; username: string; password: string }) {
			const base = {
				id: 'probe',
				name: '',
				createdAt: 0,
				...data,
				serverUrl: data.serverUrl.endsWith('/') ? data.serverUrl : `${data.serverUrl}/`
			};
			try {
				return { proxy: false, ...(await clientFor(base).discover()) };
			} catch (e) {
				// TypeError = Netzwerk/CORS; nur dann lohnt der Umweg
				if (!(e instanceof TypeError)) throw e;
			}
			try {
				return { proxy: true, ...(await clientFor({ ...base, proxy: true }).discover()) };
			} catch (e) {
				if (e instanceof CaldavError && e.status === 401) throw e;
				const host = new URL(base.serverUrl).host;
				// Weiterleitung da, aber Ziel nicht erreichbar → eher die Adresse falsch
				if (e instanceof CaldavError && (e.status === 502 || e.status === 504))
					throw new Error(`${host} ist nicht erreichbar – stimmt die Adresse?`, { cause: e });
				if (e instanceof CaldavError && e.status === 404)
					throw new Error(
						`Unter dieser Adresse wurde kein CalDAV gefunden – ist es wirklich die Nextcloud-Adresse?`,
						{ cause: e }
					);
				throw new ProxyUnavailable(host);
			}
		},

		/** Kalender eines Kontos, in die Termine eingetragen werden können */
		async remoteCalendars(accountId: string) {
			const account = await db.accounts.get(accountId);
			if (!account) throw new Error('Konto fehlt');
			const client = clientFor(account);
			const homeUrl = account.homeUrl ?? (await client.discover()).homeUrl;
			return client.calendars(homeUrl);
		},

		/** Kalender für die Termine eines Pools wählen (oder abwählen) */
		async setPoolCalendar(poolId: string, target: Pool['settings']['calendar']) {
			const pool = await db.pools.get(poolId);
			if (!pool) return;
			const settings = { ...pool.settings };
			if (target) settings.calendar = target;
			else delete settings.calendar;
			await db.pools.update(poolId, { settings, updatedAt: now() });
		},

		/**
		 * Geplante Aufgaben als Termine eintragen – für alle Pools mit Kalender (und solche,
		 * die noch Termine haben, die weg müssen).
		 */
		async syncCalendars() {
			const withEvents = new Set((await db.eventRecords.toArray()).map((r) => r.poolId));
			const pools = (await db.pools.toArray()).filter(
				(p) => p.settings.calendar || withEvents.has(p.id)
			);
			const results: Record<string, CalendarReport | { error: string }> = {};
			for (const p of pools) {
				try {
					results[p.id] = await exclusive(`kalender-${p.id}`, () =>
						pushCalendar(db, p, clientFor, new Date(now()))
					);
				} catch (e) {
					results[p.id] = { error: errorText(e) };
				}
			}
			return results;
		},

		/** Listen eines Kontos (nur solche, die Aufgaben können). */
		async remoteLists(accountId: string) {
			const account = await db.accounts.get(accountId);
			if (!account) throw new Error('Konto fehlt');
			const client = clientFor(account);
			const homeUrl = account.homeUrl ?? (await client.discover()).homeUrl;
			return client.lists(homeUrl);
		},

		/**
		 * Pool mit einer Liste verbinden – einer vorhandenen (`listUrl`) oder einer neuen.
		 * Beim ersten Abgleich werden beide Seiten zusammengeführt, nichts geht verloren.
		 */
		async bindPool(poolId: string, accountId: string, listUrl?: string) {
			const pool = await db.pools.get(poolId);
			const account = await db.accounts.get(accountId);
			if (!pool || !account) throw new Error('Pool oder Konto fehlt');
			const client = clientFor(account);
			const homeUrl = account.homeUrl ?? (await client.discover()).homeUrl;
			const url = listUrl ?? (await client.createList(homeUrl, pool.name, pool.color));
			await this.unbindPool(poolId);
			await db.pools.update(poolId, {
				caldav: { accountId, collectionUrl: url },
				updatedAt: now()
			});
			await db.syncState.put({ poolId });
			return url;
		},

		/** Verbindung lösen. Die Aufgaben bleiben lokal, auf dem Server wird nichts gelöscht. */
		async unbindPool(poolId: string) {
			await db.transaction('rw', db.pools, db.syncRecords, db.syncState, db.conflicts, async () => {
				const records = await db.syncRecords.where('poolId').equals(poolId).toArray();
				for (const r of records) await db.conflicts.where('taskId').equals(r.taskId).delete();
				await db.syncRecords.where('poolId').equals(poolId).delete();
				await db.syncState.delete(poolId);
				await db.pools.update(poolId, { caldav: undefined });
			});
		},

		/**
		 * Liste eines Pools auf dem Server löschen (samt allen Aufgaben darin) und die
		 * Verbindung lösen. Lokal bleibt alles, bis der Pool selbst gelöscht wird.
		 */
		async deleteRemoteList(poolId: string) {
			const pool = await db.pools.get(poolId);
			if (!pool?.caldav) return;
			const account = await db.accounts.get(pool.caldav.accountId);
			if (!account) throw new Error('Konto fehlt');
			const url = pool.caldav.collectionUrl;
			await exclusive(poolId, () => clientFor(account).deleteList(url));
			await this.unbindPool(poolId);
		},

		/** Eine vorhandene Liste als neuen Pool übernehmen (z. B. auf dem zweiten Gerät). */
		async adoptList(accountId: string, list: { url: string; displayName: string; color?: string }) {
			const pools = (await db.pools.toArray()).sort(bySortOrder);
			const t = now();
			const id = uuid();
			await db.pools.add({
				id,
				kind: 'pool',
				name: list.displayName || 'Liste',
				color: list.color ?? '#0090ff',
				sortOrder: keyAtEnd(pools),
				archived: false,
				settings: structuredClone(DEFAULT_POOL_SETTINGS),
				createdAt: t,
				updatedAt: t
			});
			await this.bindPool(id, accountId, list.url);
			return id;
		},

		/** Alle verbundenen Pools abgleichen. Fehler eines Pools stoppen die anderen nicht. */
		async syncAll() {
			const pools = (await db.pools.toArray()).filter((p) => p.caldav);
			const results: Record<string, SyncReport | { error: string }> = {};
			for (const p of pools) {
				try {
					results[p.id] = await syncPool(p.id);
				} catch (e) {
					results[p.id] = { error: errorText(e) };
				}
			}
			return results;
		},

		/** Konflikt entscheiden: Wert vom Gerät oder vom Server übernehmen. */
		async resolveConflict(id: string, choice: 'local' | 'remote') {
			await db.transaction('rw', db.tasks, db.syncRecords, db.conflicts, async () => {
				const c = await db.conflicts.get(id);
				if (!c) return;
				if (choice === 'remote') {
					await db.tasks.update(c.taskId, {
						[c.field]: c.remote,
						updatedAt: now()
					} as Partial<Task>);
				}
				await db.conflicts.delete(id);
				if ((await db.conflicts.where('taskId').equals(c.taskId).count()) === 0) {
					await db.syncRecords.update(c.taskId, { conflict: false });
				}
			});
		}
	};
}

export type SyncEngine = ReturnType<typeof createSyncEngine>;

function parseProjects(json: string | undefined): RemoteProject[] {
	try {
		const v = json ? JSON.parse(json) : [];
		return Array.isArray(v) ? v : [];
	} catch {
		return [];
	}
}

function pick(p: RemoteProject): RemoteProject {
	return {
		id: p.id,
		name: p.name,
		color: p.color,
		icon: p.icon,
		sortOrder: p.sortOrder,
		archived: p.archived,
		updatedAt: p.updatedAt,
		deletedAt: p.deletedAt
	};
}

function depth(tasks: Task[], t: Task) {
	let d = 0;
	let cur: Task | undefined = t;
	while (cur?.parentId && d < 50) {
		cur = tasks.find((x) => x.id === cur!.parentId);
		d++;
	}
	return d;
}

const ignorePrecondition = (e: unknown) => {
	if (!(e instanceof PreconditionFailed)) throw e;
};

export const LIST_GONE =
	'Die Liste gibt es auf dem Server nicht mehr (auf einem anderen Gerät gelöscht?). Die Aufgaben sind hier noch vorhanden.';

/** Die Weiterleitung über den eigenen Ordo-Server ist für diesen Server nicht eingerichtet */
export class ProxyUnavailable extends Error {
	constructor(readonly host: string) {
		super(
			`Der Server ${host} erlaubt keine Anfragen direkt aus dem Browser (CORS), und die Weiterleitung über den Ordo-Server ist dafür nicht eingerichtet.`
		);
	}
}

export function errorText(e: unknown) {
	if (e instanceof TypeError)
		return 'Server nicht erreichbar – offline, oder der Server erlaubt keine Anfragen aus dem Browser (CORS).';
	return e instanceof Error ? e.message : String(e);
}
