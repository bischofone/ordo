import { expect, test, type Browser, type Page } from '@playwright/test';
import { openPool, outline, quickAdd, rowByTitle } from './helpers';

const SERVER = 'http://127.0.0.1:5390/';

async function addAccount(page: Page) {
	await page.goto('/einstellungen');
	const form = page.getByTestId('sync-settings');
	await form.getByLabel('Server-Adresse').fill(SERVER);
	await form.getByLabel('Benutzer').fill('test');
	await form.getByLabel('Passwort').fill('test');
	await form.getByRole('button', { name: 'Verbinden' }).click();
	await expect(form.getByTestId('account')).toBeVisible();
}

/** Sync anstoßen und warten, bis ein *neuer* Lauf fertig ist. */
async function syncAndWait(page: Page) {
	const status = page.getByTestId('sync-status');
	await expect(status).toHaveAttribute('data-running', 'false');
	const before = (await status.getAttribute('data-last-run')) ?? '';
	await status.click();
	await expect(status).not.toHaveAttribute('data-last-run', before);
	await expect(status).toHaveAttribute('data-running', 'false');
}

async function newDevice(browser: Browser) {
	const ctx = await browser.newContext({ locale: 'de-DE', timezoneId: 'Europe/Berlin' });
	return ctx.newPage();
}

test('zwei Geräte synchronisieren über CalDAV, Konflikt wird gelöst', async ({ browser }) => {
	const listName = `Privat-${Date.now()}`;

	// Gerät A: Konto, Pool umbenennen und mit neuer Liste verbinden, Aufgaben anlegen
	const a = await newDevice(browser);
	await addAccount(a);
	await openPool(a, 'Privat');
	await a.getByRole('button', { name: 'Pool bearbeiten' }).click();
	const name = a.getByTestId('editor').getByRole('textbox', { name: 'Name' });
	await name.fill(listName);
	await name.press('Enter');
	await expect(a.getByRole('heading', { level: 1, name: listName })).toBeVisible();

	await a.goto('/einstellungen');
	await a
		.getByRole('combobox', { name: `Sync ${listName}` })
		.selectOption({ label: 'Neue Liste in „127.0.0.1:5390“' });
	await expect(
		a.getByTestId('pool-binding').filter({ has: a.locator('.pool-name', { hasText: listName }) })
	).toContainText('vor');

	await openPool(a, listName);
	await quickAdd(a, 'Einkaufen !1');
	await a.getByRole('button', { name: 'Aufgabe hinzufügen', exact: true }).first().click();
	await a.keyboard.type('Bericht');
	await a.keyboard.press('Enter');
	await a.keyboard.press('Tab');
	await a.keyboard.type('Zahlen prüfen');
	await expect.poll(() => outline(a)).toEqual(['0:Einkaufen', '0:Bericht', '1:Zahlen prüfen']);
	await syncAndWait(a);

	// Gerät B: gleiches Konto, Liste übernehmen
	const b = await newDevice(browser);
	await addAccount(b);
	const card = b.getByTestId('account');
	await card
		.locator('.list-row')
		.filter({ hasText: listName })
		.getByRole('button', { name: 'Als Pool übernehmen' })
		.click();
	await openPool(b, listName);
	await expect.poll(() => outline(b)).toEqual(['0:Einkaufen', '0:Bericht', '1:Zahlen prüfen']);
	await expect(await rowByTitle(b, 'Einkaufen')).toContainText('!1');

	// Beide ändern denselben Titel → Konflikt auf dem zweiten Gerät
	const edit = async (page: Page, from: string, to: string) => {
		const input = (await rowByTitle(page, from)).getByRole('textbox');
		await input.fill(to);
		await input.blur();
	};
	// B ist offline (Funkloch) und ändert; A ändert dasselbe Feld und synchronisiert.
	await b.context().setOffline(true);
	await edit(b, 'Bericht', 'Bericht (Handy)');
	await edit(a, 'Bericht', 'Bericht (PC)');
	await syncAndWait(a);
	await b.context().setOffline(false);
	await syncAndWait(b);

	await b.getByRole('navigation').getByRole('link', { name: '1 Konflikt' }).click();
	const conflict = b.getByTestId('conflict');
	await expect(conflict).toContainText('Bericht (Handy)');
	await expect(conflict).toContainText('Bericht (PC)');
	await conflict.getByRole('button', { name: /Server/ }).click();
	await expect(b.getByText('Keine Konflikte')).toBeVisible();

	await openPool(b, listName);
	await expect(await rowByTitle(b, 'Bericht (PC)')).toBeVisible();

	// Erledigen auf B kommt auf A an
	await (await rowByTitle(b, 'Einkaufen')).getByRole('checkbox', { name: 'Erledigt' }).click();
	await syncAndWait(b);
	await syncAndWait(a);
	await expect.poll(() => outline(a)).toEqual(['0:Bericht (PC)', '1:Zahlen prüfen']);
});

test('nach dem Verbinden kehrt Ruhe ein (keine Sync-Schleife)', async ({ page }) => {
	let requests = 0;
	page.on('request', (r) => r.url().startsWith(SERVER) && requests++);
	await addAccount(page);
	await page
		.getByRole('combobox', { name: 'Sync Arbeit' })
		.selectOption({ label: 'Neue Liste in „127.0.0.1:5390“' });
	await expect(page.getByTestId('sync-status')).toHaveText(/Synchron/);
	const after = requests;
	await page.waitForTimeout(4000);
	expect(requests - after).toBeLessThan(10);
	await expect(page.getByTestId('sync-status')).toHaveText(/Synchron/);
});

test('falsches Passwort wird verständlich gemeldet', async ({ page }) => {
	await page.goto('/einstellungen');
	const form = page.getByTestId('sync-settings');
	await form.getByLabel('Server-Adresse').fill(SERVER);
	await form.getByLabel('Benutzer').fill('test');
	await form.getByLabel('Passwort').fill('falsch');
	await form.getByRole('button', { name: 'Verbinden' }).click();
	await expect(form.getByRole('alert')).toContainText('Anmeldung fehlgeschlagen');
});
