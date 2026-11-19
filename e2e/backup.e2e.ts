/**
 * Sicherung: verschlüsselt herunterladen, auf einem „neuen Gerät“ (frischer Browser)
 * wiederherstellen, falsches Passwort, Datei ohne Passwort enthält keine Zugangsdaten,
 * Wiederherstellung rückgängig machen.
 */
import { readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { openPool, quickAdd, rowByTitle } from './helpers';

test.use({ serviceWorkers: 'block' });
test.setTimeout(60_000);

async function makeData(page: Page) {
	await page.goto('/');
	await openPool(page, 'Arbeit');
	await quickAdd(page, 'Gesicherte Aufgabe');
	await page.evaluate(async () => {
		// Konto und KI-Schlüssel direkt anlegen (ohne echten Server)
		const req = indexedDB.open('tasks-app');
		await new Promise((r) => (req.onsuccess = r));
		const tx = req.result.transaction(['accounts', 'settings'], 'readwrite');
		tx.objectStore('accounts').put({
			id: 'acc1',
			name: 'Mein Server',
			serverUrl: 'https://dav.example.invalid/',
			username: 'alex',
			password: 'server-geheim',
			createdAt: 1
		});
		tx.objectStore('settings').put({ key: 'aiSettings', value: { apiKey: 'sk-or-v1-GEHEIM' } });
		await new Promise((r) => (tx.oncomplete = r));
		req.result.close();
	});
}

/** Klicken und warten, bis die Seite wirklich neu geladen ist (Wiederherstellen lädt neu) */
async function clickAndReload(page: Page, button: Locator) {
	await page.evaluate(() => ((window as unknown as { alt?: boolean }).alt = true));
	await button.click();
	await page.waitForFunction(() => !(window as unknown as { alt?: boolean }).alt, null, {
		timeout: 20_000
	});
	await page.waitForLoadState('load');
}

async function download(page: Page, password?: string) {
	await page.goto('/einstellungen#sicherung');
	const card = page.getByTestId('backup-create');
	if (password) {
		await card.getByLabel('Passwort für die Datei').fill(password);
		await card.getByLabel('Passwort wiederholen').fill(password);
	}
	const dl = page.waitForEvent('download');
	await card.getByRole('button', { name: 'Sicherung herunterladen' }).click();
	const file = await dl;
	const path = await file.path();
	return { name: file.suggestedFilename(), path, text: await readFile(path, 'utf8') };
}

test('ohne Passwort: lesbare Datei, aber ohne Zugangsdaten', async ({ page }) => {
	await makeData(page);
	const f = await download(page);
	expect(f.name).toMatch(/^ordo-sicherung-\d{4}-\d{2}-\d{2}_\d{4}\.json$/);
	expect(f.text).toContain('Gesicherte Aufgabe');
	expect(f.text).not.toContain('server-geheim');
	expect(f.text).not.toContain('sk-or-v1-GEHEIM');
	await expect(page.getByTestId('backup-create')).toContainText('Letzte Sicherung:');
});

test('mit Passwort verschlüsselt, auf neuem Gerät wiederherstellen, rückgängig', async ({
	page,
	browser
}) => {
	await makeData(page);
	const f = await download(page, 'sehr-geheim-123');
	expect(f.name).toContain('-verschluesselt');
	expect(f.text).not.toContain('Gesicherte Aufgabe');
	expect(f.text).not.toContain('server-geheim');

	// Neues Gerät: eigener Browser-Kontext, leere Daten
	const ctx = await browser.newContext({ serviceWorkers: 'block' });
	const other = await ctx.newPage();
	await other.goto('/');
	await openPool(other, 'Arbeit');
	await quickAdd(other, 'Nur auf dem neuen Gerät');
	await other.goto('/einstellungen#sicherung');
	const card = other.getByTestId('backup-restore');
	await card.locator('input[type=file]').setInputFiles(f.path);
	await expect(card).toContainText('Diese Sicherung ist verschlüsselt.');

	// Falsches Passwort
	await card.getByLabel('Passwort für die Datei').fill('falsch');
	await card.getByRole('button', { name: 'Öffnen' }).click();
	await expect(card.getByRole('alert')).toContainText('Falsches Passwort');

	// Richtiges Passwort → Zusammenfassung
	await card.getByLabel('Passwort für die Datei').fill('sehr-geheim-123');
	await card.getByRole('button', { name: 'Öffnen' }).click();
	const summary = other.getByTestId('backup-summary');
	await expect(summary).toContainText('3 Pools');
	await expect(summary).toContainText('1 Konten');
	await expect(summary).toContainText('mit Zugangsdaten');

	// Ersetzen (mit Rückfrage) → Seite lädt neu
	await summary.getByRole('button', { name: 'Alle Daten ersetzen' }).click();
	await clickAndReload(
		other,
		other.getByRole('dialog').getByRole('button', { name: 'Alle Daten ersetzen' })
	);
	await openPool(other, 'Arbeit');
	await rowByTitle(other, 'Gesicherte Aufgabe');
	await expect(other.locator('input.title[value="Nur auf dem neuen Gerät"]')).toHaveCount(0);
	await other.goto('/einstellungen#sync');
	await expect(other.getByTestId('account')).toContainText('Mein Server');
	await expect(other.getByTestId('account-password')).toHaveCount(0); // Passwort ist da

	// Rückgängig: Stand des neuen Geräts kommt zurück
	await other.goto('/einstellungen#sicherung');
	await other.getByTestId('backup-undo').getByRole('button', { name: 'Zurückholen' }).click();
	await clickAndReload(
		other,
		other.getByRole('dialog').getByRole('button', { name: 'Zurückholen' })
	);
	await openPool(other, 'Arbeit');
	await rowByTitle(other, 'Nur auf dem neuen Gerät');
	await ctx.close();
});

test('Sicherung ohne Zugangsdaten auf neuem Gerät: Passwort lässt sich nachtragen', async ({
	page,
	browser
}) => {
	await makeData(page);
	const f = await download(page);
	const ctx = await browser.newContext({ serviceWorkers: 'block' });
	const other = await ctx.newPage();
	await other.goto('/einstellungen#sicherung');
	await other.getByTestId('backup-restore').locator('input[type=file]').setInputFiles(f.path);
	await expect(other.getByTestId('backup-summary')).toContainText('ohne Zugangsdaten');
	await other
		.getByTestId('backup-summary')
		.getByRole('button', { name: 'Alle Daten ersetzen' })
		.click();
	await clickAndReload(
		other,
		other.getByRole('dialog').getByRole('button', { name: 'Alle Daten ersetzen' })
	);
	await other.goto('/einstellungen#sync');
	await expect(other.getByTestId('account-password')).toContainText('Passwort fehlt');
	await ctx.close();
});

test('fremde Datei wird verständlich abgelehnt', async ({ page }) => {
	await page.goto('/einstellungen#sicherung');
	const card = page.getByTestId('backup-restore');
	await card.locator('input[type=file]').setInputFiles({
		name: 'irgendwas.json',
		mimeType: 'application/json',
		buffer: Buffer.from('{"hallo":1}')
	});
	await expect(card.getByRole('alert')).toHaveText('Das ist keine Ordo-Sicherung.');
});
