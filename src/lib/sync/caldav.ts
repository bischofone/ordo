/**
 * Schlanker CalDAV-Client – genau das, was der Sync braucht.
 * Die HTTP-Schicht ist austauschbar (`Transport`): fetch im Browser, später native
 * Requests in der Android-App (ohne CORS) oder in Tauri.
 */
import { uuid } from '#lib/domain/id.ts';
import { XMLParser } from 'fast-xml-parser';

// ---------- Transport ----------

export interface HttpRequest {
	method: string;
	url: string;
	headers: Record<string, string>;
	body?: string;
}

export interface HttpResponse {
	status: number;
	/** Header-Namen in Kleinbuchstaben */
	headers: Record<string, string>;
	body: string;
}

export type Transport = (req: HttpRequest) => Promise<HttpResponse>;

export const fetchTransport: Transport = async (req) => {
	const res = await fetch(req.url, {
		method: req.method,
		headers: req.headers,
		body: req.body,
		cache: 'no-store',
		credentials: 'omit'
	});
	const headers: Record<string, string> = {};
	res.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
	return { status: res.status, headers, body: await res.text() };
};

// ---------- Fehler ----------

export class CaldavError extends Error {
	constructor(
		message: string,
		readonly status: number
	) {
		super(message);
	}
}
/** sync-token ist abgelaufen → vollständiger Abgleich nötig */
export class InvalidSyncToken extends Error {}
/** ETag passt nicht mehr – jemand anderes hat zwischenzeitlich geändert */
export class PreconditionFailed extends CaldavError {}

// ---------- XML ----------

const xml = new XMLParser({
	removeNSPrefix: true,
	ignoreAttributes: false,
	attributeNamePrefix: '@',
	parseTagValue: false,
	trimValues: true,
	isArray: (name) => ['response', 'propstat', 'comp', 'href'].includes(name)
});

type Xml = Record<string, unknown>;

interface DavResponse {
	href: string;
	status?: number;
	props: Xml;
}

const statusCode = (s: unknown) => Number(String(s ?? '').split(' ')[1]) || undefined;

function text(v: unknown): string | undefined {
	if (v === undefined || v === null) return undefined;
	if (typeof v === 'string') return v;
	if (typeof v === 'object' && '#text' in (v as Xml)) return String((v as Xml)['#text']);
	return undefined;
}

function parseMultistatus(body: string): DavResponse[] {
	const doc = xml.parse(body) as Xml;
	const ms = doc.multistatus as Xml | undefined;
	if (!ms) return [];
	const responses = (ms.response as Xml[] | undefined) ?? [];
	return responses.map((r) => {
		const props: Xml = {};
		for (const ps of (r.propstat as Xml[] | undefined) ?? []) {
			if (statusCode(ps.status) !== 200) continue;
			Object.assign(props, (ps.prop as Xml) ?? {});
		}
		return {
			href: decodeURI(String((r.href as string[])[0])),
			status: statusCode(r.status),
			props
		};
	});
}

const syncTokenOf = (body: string) => {
	const ms = (xml.parse(body) as Xml).multistatus as Xml | undefined;
	return text(ms?.['sync-token']);
};

const hrefOf = (v: unknown) => {
	const h = (v as Xml | undefined)?.href as string[] | undefined;
	return h?.[0];
};

const esc = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------- Client ----------

export interface Account {
	serverUrl: string;
	username: string;
	password: string;
}

export interface TodoList {
	url: string;
	displayName: string;
	color?: string;
	ctag?: string;
	syncToken?: string;
	/** JSON mit Projekten (eigene Eigenschaft der Liste) */
	projects?: string;
}

export interface RemoteItem {
	url: string;
	etag: string;
}

const NS = `xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/" xmlns:a="http://apple.com/ns/ical/" xmlns:t="urn:tasks-app:"`;

const LIST_PROPS = `<d:displayname/><d:resourcetype/><c:supported-calendar-component-set/><cs:getctag/><d:sync-token/><a:calendar-color/><t:projects/>`;

function base64(s: string) {
	const bytes = new TextEncoder().encode(s);
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin);
}

export function createClient(account: Account, transport: Transport = fetchTransport) {
	const auth = `Basic ${base64(`${account.username}:${account.password}`)}`;
	const abs = (href: string) => new URL(href, account.serverUrl).toString();

	async function request(
		method: string,
		url: string,
		opts: { body?: string; headers?: Record<string, string>; ok?: number[] } = {}
	) {
		const headers: Record<string, string> = { Authorization: auth, ...opts.headers };
		if (opts.body) headers['Content-Type'] ??= 'application/xml; charset=utf-8';
		const res = await transport({ method, url, headers, body: opts.body });
		const ok = opts.ok ?? [200, 201, 204, 207];
		if (!ok.includes(res.status)) {
			if (res.status === 412) throw new PreconditionFailed(`${method} ${url}: 412`, 412);
			if (res.status === 401) throw new CaldavError('Anmeldung fehlgeschlagen (401)', 401);
			throw new CaldavError(`${method} ${url}: HTTP ${res.status}`, res.status);
		}
		return res;
	}

	const propfind = async (url: string, props: string, depth: '0' | '1') =>
		parseMultistatus(
			(
				await request('PROPFIND', url, {
					headers: { Depth: depth },
					body: `<?xml version="1.0" encoding="utf-8"?><d:propfind ${NS}><d:prop>${props}</d:prop></d:propfind>`
				})
			).body
		);

	function toList(r: DavResponse): TodoList | undefined {
		const rt = r.props.resourcetype as Xml | undefined;
		if (!rt || !('calendar' in rt)) return undefined;
		const comps = ((r.props['supported-calendar-component-set'] as Xml | undefined)?.comp ??
			[]) as Xml[];
		// Ohne Angabe unterstützt die Liste alle Komponenten.
		if (comps.length && !comps.some((c) => String(c['@name']).toUpperCase() === 'VTODO')) {
			return undefined;
		}
		const color = text(r.props['calendar-color']);
		return {
			url: abs(r.href),
			displayName: text(r.props.displayname) ?? r.href.split('/').filter(Boolean).pop() ?? '',
			color: color ? color.slice(0, 7) : undefined,
			ctag: text(r.props.getctag),
			syncToken: text(r.props['sync-token']),
			projects: text(r.props.projects)
		};
	}

	const client = {
		account,

		/** Prüft die Zugangsdaten und findet das Verzeichnis mit den Kalendern/Listen. */
		async discover(): Promise<{ homeUrl: string; lists: TodoList[] }> {
			let principal = account.serverUrl;
			for (const start of [account.serverUrl, abs('/.well-known/caldav')]) {
				try {
					const [r] = await propfind(start, '<d:current-user-principal/>', '0');
					const p = hrefOf(r?.props['current-user-principal']);
					if (p) {
						principal = abs(p);
						break;
					}
				} catch (e) {
					if (e instanceof CaldavError && e.status === 401) throw e;
				}
			}
			const [pr] = await propfind(principal, '<c:calendar-home-set/>', '0');
			const home = hrefOf(pr?.props['calendar-home-set']);
			const homeUrl = home ? abs(home) : principal;
			return { homeUrl, lists: await client.lists(homeUrl) };
		},

		async lists(homeUrl: string): Promise<TodoList[]> {
			const res = await propfind(homeUrl, LIST_PROPS, '1');
			return res.map(toList).filter((l): l is TodoList => !!l);
		},

		async listInfo(listUrl: string): Promise<TodoList> {
			const [r] = await propfind(listUrl, LIST_PROPS, '0');
			const list = r && toList(r);
			if (!list) throw new CaldavError('Aufgabenliste nicht gefunden', 404);
			return list;
		},

		/** Legt eine neue Aufgabenliste (nur VTODO) im Home-Verzeichnis an. */
		async createList(homeUrl: string, name: string, color?: string): Promise<string> {
			const slug = `${uuid()}/`;
			const url = new URL(slug, homeUrl.endsWith('/') ? homeUrl : `${homeUrl}/`).toString();
			await request('MKCALENDAR', url, {
				ok: [201],
				body: `<?xml version="1.0" encoding="utf-8"?><c:mkcalendar ${NS}><d:set><d:prop>
<d:displayname>${esc(name)}</d:displayname>
${color ? `<a:calendar-color>${esc(color)}</a:calendar-color>` : ''}
<c:supported-calendar-component-set><c:comp name="VTODO"/></c:supported-calendar-component-set>
</d:prop></d:set></c:mkcalendar>`
			});
			return url;
		},

		/** Name, Farbe und Projekte der Liste setzen (nur angegebene Werte). */
		async updateList(
			listUrl: string,
			props: { displayName?: string; color?: string; projects?: string }
		) {
			const parts = [
				props.displayName !== undefined &&
					`<d:displayname>${esc(props.displayName)}</d:displayname>`,
				props.color !== undefined && `<a:calendar-color>${esc(props.color)}</a:calendar-color>`,
				props.projects !== undefined && `<t:projects>${esc(props.projects)}</t:projects>`
			].filter(Boolean);
			if (!parts.length) return;
			await request('PROPPATCH', listUrl, {
				body: `<?xml version="1.0" encoding="utf-8"?><d:propertyupdate ${NS}><d:set><d:prop>${parts.join('')}</d:prop></d:set></d:propertyupdate>`
			});
		},

		/** Alle Aufgaben der Liste mit ETag (für den vollständigen Abgleich). */
		async listItems(listUrl: string): Promise<RemoteItem[]> {
			const res = await request('REPORT', listUrl, {
				headers: { Depth: '1' },
				body: `<?xml version="1.0" encoding="utf-8"?><c:calendar-query ${NS}><d:prop><d:getetag/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VTODO"/></c:comp-filter></c:filter></c:calendar-query>`
			});
			return parseMultistatus(res.body)
				.filter((r) => text(r.props.getetag))
				.map((r) => ({ url: abs(r.href), etag: text(r.props.getetag)! }));
		},

		/** Änderungen seit `token` (RFC 6578). */
		async changesSince(
			listUrl: string,
			token: string
		): Promise<{ changed: RemoteItem[]; deleted: string[]; token?: string }> {
			let res: HttpResponse;
			try {
				res = await request('REPORT', listUrl, {
					headers: { Depth: '1' },
					body: `<?xml version="1.0" encoding="utf-8"?><d:sync-collection ${NS}><d:sync-token>${esc(token)}</d:sync-token><d:sync-level>1</d:sync-level><d:prop><d:getetag/></d:prop></d:sync-collection>`
				});
			} catch (e) {
				if (e instanceof CaldavError && [403, 409, 400].includes(e.status)) {
					throw new InvalidSyncToken();
				}
				throw e;
			}
			const changed: RemoteItem[] = [];
			const deleted: string[] = [];
			for (const r of parseMultistatus(res.body)) {
				const url = abs(r.href);
				if (url === listUrl) continue;
				if (r.status === 404) deleted.push(url);
				else if (text(r.props.getetag)) changed.push({ url, etag: text(r.props.getetag)! });
			}
			return { changed, deleted, token: syncTokenOf(res.body) };
		},

		/** Lädt mehrere Aufgaben auf einmal. */
		async fetchItems(listUrl: string, urls: string[]) {
			if (!urls.length) return [];
			const hrefs = urls.map((u) => `<d:href>${esc(new URL(u).pathname)}</d:href>`).join('');
			const res = await request('REPORT', listUrl, {
				headers: { Depth: '1' },
				body: `<?xml version="1.0" encoding="utf-8"?><c:calendar-multiget ${NS}><d:prop><d:getetag/><c:calendar-data/></d:prop>${hrefs}</c:calendar-multiget>`
			});
			return parseMultistatus(res.body)
				.filter((r) => text(r.props['calendar-data']))
				.map((r) => ({
					url: abs(r.href),
					etag: text(r.props.getetag) ?? '',
					ics: text(r.props['calendar-data'])!
				}));
		},

		/** Speichert eine Aufgabe. Liefert den neuen ETag. */
		async putItem(
			url: string,
			ics: string,
			cond: { etag?: string; create?: boolean }
		): Promise<string> {
			const headers: Record<string, string> = { 'Content-Type': 'text/calendar; charset=utf-8' };
			if (cond.create) headers['If-None-Match'] = '*';
			else if (cond.etag) headers['If-Match'] = cond.etag;
			const res = await request('PUT', url, { body: ics, headers, ok: [200, 201, 204] });
			if (res.headers.etag) return res.headers.etag;
			const [r] = await propfind(url, '<d:getetag/>', '0');
			return text(r?.props.getetag) ?? '';
		},

		/** Löscht eine ganze Aufgabenliste samt Inhalt auf dem Server. */
		async deleteList(listUrl: string) {
			await request('DELETE', listUrl, { ok: [200, 204, 404] });
		},

		async deleteItem(url: string, etag?: string) {
			await request('DELETE', url, {
				headers: etag ? { 'If-Match': etag } : {},
				ok: [200, 204, 404]
			});
		}
	};
	return client;
}

export type CaldavClient = ReturnType<typeof createClient>;
