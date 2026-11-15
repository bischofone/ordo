import { expect, test } from '@playwright/test';

test('App ist installierbar und startet offline', async ({ page, context }) => {
	await page.goto('/inbox');
	const manifest = await page.request.get('/manifest.webmanifest');
	expect(manifest.ok()).toBe(true);
	expect((await manifest.json()).icons.length).toBeGreaterThan(1);

	// Warten, bis der Service Worker die Seite kontrolliert
	await page.evaluate(() => navigator.serviceWorker.ready);
	await page.reload();
	await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

	await context.setOffline(true);
	await page.goto('/einstellungen');
	await expect(page.getByRole('heading', { level: 1, name: 'Einstellungen' })).toBeVisible();
	await page.goto('/inbox');
	await expect(page.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible();
	await context.setOffline(false);
});

test('Dark Mode folgt dem System und lässt sich umstellen', async ({ page }) => {
	await page.emulateMedia({ colorScheme: 'dark' });
	await page.goto('/einstellungen');
	const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
	expect(await bg()).toBe('rgb(22, 22, 21)');
	await page.getByRole('combobox', { name: 'Farbschema' }).selectOption('light');
	expect(await bg()).toBe('rgb(251, 251, 250)');
	await page.reload();
	expect(await bg()).toBe('rgb(251, 251, 250)');
});
