/**
 * Geplante Aufgaben als Termine – gegen echten Radicale (Kalender mit VEVENT).
 * Dazu die Weiterleitung über den eigenen Server (gegen CORS) mit nachgebautem Netz.
 */
import 'fake-indexeddb/auto';
import ICAL from 'ical.js';
import { afterEach, describe, expect, inject, it } from 'vitest';
import { TasksDB } from '#lib/db/db.ts';
import { createRepo } from '#lib/db/repo.ts';
import { createClient, fetchTransport, toProxyUrl, type Transport } from './caldav';
import { CALENDAR_SETTINGS_KEY } from './calendar';
import { createSyncEngine, ProxyUnavailable } from './engine';

const serverUrl = inject('radicaleUrl');
const creds = () => ({ serverUrl, username: 'test', password: 'test' });
const dbs: TasksDB[] = [];
afterEach(async () => {
	for (const d of dbs.splice(0)) await d.delete();
});

/** Kalender für Termine anlegen (wie in Nextcloud: nur VEVENT) */
async function makeCalendar(name: string) {
	const c = createClient(creds());
	const { homeUrl } = await c.discover();
	const url = `${homeUrl}${crypto.randomUUID()}/`;
	const res = await fetch(url, {
		method: 'MKCALENDAR',
		headers: {
			Authorization: `Basic ${btoa('test:test')}`,
			'Content-Type': 'application/xml'
		},
		body: `<?xml version="1.0"?><c:mkcalendar xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:set><d:prop><d:displayname>${name}</d:displayname><c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set></d:prop></d:set></c:mkcalendar>`
	});
	expect(res.status).toBe(201);
	return url;
}

async function events(calendarUrl: string) {
	const c = createClient(creds());
	const items = await c.listItems(calendarUrl, 'VEVENT');
	const full = items.length
		? await c.fetchItems(
				calendarUrl,
				items.map((i) => i.url)
			)
		: [];
	return full.map((i) => {
		const ev = new ICAL.Component(ICAL.parse(i.ics)).getFirstSubcomponent('vevent')!;
		return {
			url: i.url,
			summary: String(ev.getFirstPropertyValue('summary')),
			start: String(ev.getFirstPropertyValue('dtstart')),
			end: String(ev.getFirstPropertyValue('dtend'))
		};
	});
}

async function setup() {
	const db = new TasksDB(`cal-${crypto.randomUUID()}`);
	dbs.push(db);
	const repo = createRepo(db);
	const sync = createSyncEngine(db);
	await repo.ensureDefaults();
	const account = await sync.addAccount(creds());
	const pool = (await db.pools.toArray()).find((p) => p.name === 'Arbeit')!;
	return { db, repo, sync, account, pool };
}

describe.skipIf(!serverUrl)('Geplante Aufgaben als Termine (Radicale)', () => {
	it('findet nur Kalender, die Termine können', async () => {
		const { sync, account } = await setup();
		const calUrl = await makeCalendar('Termine');
		const cals = await sync.remoteCalendars(account.id);
		expect(cals.map((c) => c.url)).toContain(calUrl);
		const lists = await sync.remoteLists(account.id);
		expect(lists.map((l) => l.url)).not.toContain(calUrl);
	});

	it('anlegen, Dauer aus Schätzung, ändern, Datum entfernen, erledigt bleibt', async () => {
		const { db, repo, sync, account, pool } = await setup();
		const calUrl = await makeCalendar('Arbeit');
		await sync.setPoolCalendar(pool.id, { accountId: account.id, url: calUrl, name: 'Arbeit' });
		await repo.setSetting(CALENDAR_SETTINGS_KEY, { durationMin: 30, allDay: true });

		const a = await repo.createTask({ poolId: pool.id, title: 'Angebot Weber' });
		await repo.updateTask(a, { scheduled: { date: '2026-11-20', time: '14:00' } });
		const b = await repo.createTask({ poolId: pool.id, title: 'Werkstatt' });
		await repo.updateTask(b, {
			scheduled: { date: '2026-11-21', time: '09:00' },
			estimateMin: 120
		});
		const c = await repo.createTask({ poolId: pool.id, title: 'Ohne Datum' });

		let res = await sync.syncCalendars();
		expect(res[pool.id]).toEqual({ written: 2, deleted: 0 });
		let evs = await events(calUrl);
		expect(evs.map((e) => [e.summary, e.start, e.end]).sort()).toEqual([
			['Angebot Weber', '2026-11-20T13:00:00Z', '2026-11-20T13:30:00Z'],
			['Werkstatt', '2026-11-21T08:00:00Z', '2026-11-21T10:00:00Z']
		]);

		// Nichts geändert → nichts geschrieben
		expect((await sync.syncCalendars())[pool.id]).toEqual({ written: 0, deleted: 0 });

		// Uhrzeit ändern, Datum entfernen, erledigen
		await repo.updateTask(a, { scheduled: { date: '2026-11-20', time: '15:30' } });
		await repo.updateTask(b, { scheduled: undefined });
		await repo.updateTask(c, { scheduled: { date: '2026-11-22' } });
		res = await sync.syncCalendars();
		expect(res[pool.id]).toEqual({ written: 2, deleted: 1 });
		evs = await events(calUrl);
		expect(evs.map((e) => [e.summary, e.start]).sort()).toEqual([
			['Angebot Weber', '2026-11-20T14:30:00Z'],
			['Ohne Datum', '2026-11-22']
		]);

		await repo.setDone(a, true);
		expect((await sync.syncCalendars())[pool.id]).toEqual({ written: 0, deleted: 0 });
		expect((await events(calUrl)).map((e) => e.summary).sort()).toEqual([
			'Angebot Weber',
			'Ohne Datum'
		]);

		// Aufgabe löschen → Termin weg
		await repo.deleteTask(c);
		await sync.syncCalendars();
		expect((await events(calUrl)).map((e) => e.summary)).toEqual(['Angebot Weber']);
		expect(await db.eventRecords.count()).toBe(1);
	});

	it('im Kalender geändert → Ordo stellt seinen Stand wieder her', async () => {
		const { repo, sync, account, pool } = await setup();
		const calUrl = await makeCalendar('Arbeit');
		await sync.setPoolCalendar(pool.id, { accountId: account.id, url: calUrl, name: 'Arbeit' });
		const a = await repo.createTask({ poolId: pool.id, title: 'Meeting' });
		await repo.updateTask(a, { scheduled: { date: '2026-11-20', time: '10:00' } });
		await sync.syncCalendars();

		// Jemand verschiebt den Termin in Nextcloud (neuer ETag)
		const [ev] = await events(calUrl);
		const c = createClient(creds());
		const [item] = await c.fetchItems(calUrl, [ev.url]);
		await c.putItem(ev.url, item.ics.replace('SUMMARY:Meeting', 'SUMMARY:Verschoben'), {});

		// Ordo ändert die Aufgabe → überschreibt trotz anderem ETag
		await repo.updateTask(a, { title: 'Meeting mit Weber' });
		await sync.syncCalendars();
		expect((await events(calUrl)).map((e) => e.summary)).toEqual(['Meeting mit Weber']);
	});

	it('anderer Kalender gewählt → Termine ziehen um; abgewählt → Termine weg', async () => {
		const { repo, sync, account, pool } = await setup();
		const one = await makeCalendar('Eins');
		const two = await makeCalendar('Zwei');
		await sync.setPoolCalendar(pool.id, { accountId: account.id, url: one, name: 'Eins' });
		const a = await repo.createTask({ poolId: pool.id, title: 'Termin' });
		await repo.updateTask(a, { scheduled: { date: '2026-11-20', time: '10:00' } });
		await sync.syncCalendars();
		expect(await events(one)).toHaveLength(1);

		await sync.setPoolCalendar(pool.id, { accountId: account.id, url: two, name: 'Zwei' });
		await sync.syncCalendars();
		expect(await events(one)).toHaveLength(0);
		expect(await events(two)).toHaveLength(1);

		await sync.setPoolCalendar(pool.id, undefined);
		await sync.syncCalendars();
		expect(await events(two)).toHaveLength(0);
	});
});

describe('Weiterleitung über den eigenen Server (gegen CORS)', () => {
	it('schreibt https-Adressen um, lässt andere in Ruhe', () => {
		expect(
			toProxyUrl(
				'https://cloud.example.com/remote.php/dav/calendars/alex/',
				'http://localhost:5173'
			)
		).toBe('http://localhost:5173/ext/cloud.example.com/remote.php/dav/calendars/alex/');
		expect(toProxyUrl('http://127.0.0.1:5232/test/', 'https://ordo.example.de')).toBe(
			'http://127.0.0.1:5232/test/'
		);
	});

	it.skipIf(!serverUrl)(
		'probe: direkt blockiert (CORS) → klappt über die Weiterleitung',
		async () => {
			// Nachgebaut: „cloud.test“ ist direkt nicht erreichbar, über /ext/cloud.test/ landet man bei Radicale
			const radicale = new URL(serverUrl!);
			const transport: Transport = (req) => {
				const u = new URL(req.url);
				if (u.host === 'cloud.test') return Promise.reject(new TypeError('Failed to fetch'));
				if (u.host === 'ordo.local' && u.pathname.startsWith('/ext/cloud.test/')) {
					const path = u.pathname.slice('/ext/cloud.test'.length);
					return fetchTransport({ ...req, url: `${radicale.origin}${path}${u.search}` });
				}
				return Promise.reject(new TypeError('unerwartet: ' + req.url));
			};
			const db = new TasksDB(`proxy-${crypto.randomUUID()}`);
			dbs.push(db);
			const sync = createSyncEngine(db, { transport, proxyOrigin: 'http://ordo.local' });
			const res = await sync.probe({
				serverUrl: 'https://cloud.test/',
				username: 'test',
				password: 'test'
			});
			expect(res.proxy).toBe(true);
			expect(res.homeUrl).toBe('https://cloud.test/test/');
		}
	);

	it('probe: ohne eingerichtete Weiterleitung → verständlicher Fehler', async () => {
		const transport: Transport = () => Promise.reject(new TypeError('Failed to fetch'));
		const db = new TasksDB(`proxy-${crypto.randomUUID()}`);
		dbs.push(db);
		const sync = createSyncEngine(db, { transport, proxyOrigin: 'http://ordo.local' });
		await expect(
			sync.probe({ serverUrl: 'https://cloud.test/', username: 'a', password: 'b' })
		).rejects.toBeInstanceOf(ProxyUnavailable);
	});
});
