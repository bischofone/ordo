/**
 * Nextcloud verbinden und geplante Aufgaben als Termine eintragen.
 * Nextcloud wird nachgebaut: Direkte Anfragen an https://cloud.test scheitern (wie bei CORS),
 * über die Weiterleitung /ext/cloud.test/… landen sie beim Test-Radicale.
 */
import { expect, test, type Page } from '@playwright/test';
import { openPool, quickAdd, rowByTitle } from './helpers';

const RADICALE = 'http://127.0.0.1:5390';
const AUTH = `Basic ${Buffer.from('test:test').toString('base64')}`;

async function fakeNextcloud(page: Page) {
	// Direkt: blockiert (so sieht CORS für die App aus)
	await page.route('https://cloud.test/**', (route) => route.abort('failed'));
	// Über den Ordo-Server: an Radicale weiterreichen („/remote.php/dav“ gibt es dort nicht)
	await page.route(/\/ext\/cloud\.test\//, async (route) => {
		const u = new URL(route.request().url());
		const path = u.pathname.replace(/^\/ext\/cloud\.test/, '').replace(/^\/remote\.php\/dav/, '');
		const res = await route.fetch({ url: `${RADICALE}${path || '/'}${u.search}` });
		const headers = { ...res.headers() };
		delete headers['www-authenticate'];
		await route.fulfill({ status: res.status(), headers, body: await res.body() });
	});
}

async function makeCalendar(name: string) {
	const url = `${RADICALE}/test/${crypto.randomUUID()}/`;
	const res = await fetch(url, {
		method: 'MKCALENDAR',
		headers: { Authorization: AUTH, 'Content-Type': 'application/xml' },
		body: `<?xml version="1.0"?><c:mkcalendar xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:set><d:prop><d:displayname>${name}</d:displayname><c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set></d:prop></d:set></c:mkcalendar>`
	});
	expect(res.status).toBe(201);
	return url;
}

async function eventsIn(url: string) {
	const res = await fetch(url, {
		method: 'REPORT',
		headers: { Authorization: AUTH, Depth: '1', 'Content-Type': 'application/xml' },
		body: `<?xml version="1.0"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"/></c:comp-filter></c:filter></c:calendar-query>`
	});
	return (await res.text()).replaceAll('&#13;', '').replace(/\r?\n /g, '');
}

async function connect(page: Page, password = 'test') {
	await page.goto('/einstellungen#sync');
	const nc = page.getByTestId('nextcloud-connect');
	await nc.getByLabel('Nextcloud-Adresse').fill('cloud.test');
	await nc.getByLabel('Benutzername').fill('test');
	await nc.getByLabel('App-Passwort').fill(password);
	await expect(
		nc.getByRole('link', { name: /App-Passwort in Nextcloud erstellen/ })
	).toHaveAttribute('href', 'https://cloud.test/index.php/settings/user/security');
	await nc.getByRole('button', { name: 'Verbinden' }).click();
}

test('Nextcloud: falsches App-Passwort wird verständlich gemeldet', async ({ page }) => {
	await fakeNextcloud(page);
	await connect(page, 'falsch');
	await expect(page.getByTestId('nextcloud-connect').getByRole('alert')).toHaveText(
		'Benutzername oder App-Passwort stimmt nicht.'
	);
});

test('Nextcloud: ohne Weiterleitung steht da, was zu tun ist', async ({ page }) => {
	await page.route('https://cloud.test/**', (route) => route.abort('failed'));
	await page.route(/\/ext\/cloud\.test\//, (route) => route.fulfill({ status: 403, body: 'nein' }));
	await connect(page);
	const alert = page.getByTestId('nextcloud-connect').getByRole('alert');
	await expect(alert).toContainText('erlaubt keine Anfragen direkt aus dem Browser (CORS)');
	await expect(alert).toContainText('ordo nextcloud cloud.test');
});

test('Nextcloud verbinden (über Ordo-Server) und Termine eintragen', async ({ page }) => {
	await fakeNextcloud(page);
	const calendarUrl = await makeCalendar('Termine (Test)');
	await connect(page);

	const account = page.getByTestId('account');
	await expect(account).toContainText('Nextcloud (cloud.test)');
	await expect(account).toContainText('über Ordo-Server');

	// Kalender im Pool wählen
	await openPool(page, 'Arbeit');
	await page.getByRole('button', { name: 'Pool bearbeiten' }).click();
	const cal = page.getByTestId('pool-calendar');
	await cal.getByRole('combobox').selectOption({ label: 'Termine (Test)' });
	await expect(cal).toContainText('Dauer aus der Zeitschätzung, sonst 0:30');

	// Aufgabe mit geplantem Datum und Uhrzeit, 90 Minuten geschätzt
	await quickAdd(page, 'Kundentermin Weber');
	await (
		await rowByTitle(page, 'Kundentermin Weber')
	)
		.getByRole('button', { name: 'Details' })
		.click();
	const detail = page.getByTestId('detail');
	await detail.getByLabel('Geplant', { exact: true }).fill('2026-12-01');
	await detail.getByLabel('Geplant Uhrzeit').fill('14:00');
	await detail.getByLabel('Zeitschätzung (Min.)').fill('90');
	await detail.getByLabel('Zeitschätzung (Min.)').press('Tab');

	// Im Kalender: 14:00 Berlin = 13:00 UTC, Ende nach 90 Minuten
	await expect
		.poll(() => eventsIn(calendarUrl), { timeout: 15_000 })
		.toContain('SUMMARY:Kundentermin Weber');
	const ics = await eventsIn(calendarUrl);
	expect(ics).toContain('DTSTART:20261201T130000Z');
	expect(ics).toContain('DTEND:20261201T143000Z');

	// Datum entfernen → Termin verschwindet
	await detail.getByLabel('Geplant', { exact: true }).fill('');
	await expect
		.poll(() => eventsIn(calendarUrl), { timeout: 15_000 })
		.not.toContain('Kundentermin Weber');
});
