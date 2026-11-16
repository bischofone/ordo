import { expect, test } from '@playwright/test';
import { openPool } from './helpers';

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
	expect(await bg()).toBe('rgb(20, 20, 19)');
	await page
		.getByRole('radiogroup', { name: 'Farbschema' })
		.getByRole('radio', { name: 'Hell' })
		.click();
	expect(await bg()).toBe('rgb(244, 244, 241)');
	await page.reload();
	expect(await bg()).toBe('rgb(244, 244, 241)');
});

test('Darstellung anpassen: Akzentfarbe, Dichte, Schriftgröße, farbige Gruppen', async ({
	page
}) => {
	await page.goto('/einstellungen');
	const card = page.getByTestId('appearance');
	const css = (name: string) =>
		page.evaluate(
			(n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
			name
		);
	const rootFont = () => page.evaluate(() => getComputedStyle(document.documentElement).fontSize);

	expect(await css('--row-h')).toBe('40px');
	await card
		.getByRole('radiogroup', { name: 'Dichte' })
		.getByRole('radio', { name: 'Kompakt' })
		.click();
	expect(await css('--row-h')).toBe('32px');

	expect(await rootFont()).toBe('16px');
	await card
		.getByRole('radiogroup', { name: 'Schriftgröße' })
		.getByRole('radio', { name: 'Groß' })
		.click();
	expect(await rootFont()).toBe('18px');

	// Akzentfarbe: ein Knopf, Auswahl im Aufklappfenster; helle Farbe → dunkle Schrift
	await card.getByRole('button', { name: 'Farbe wählen' }).click();
	await page.getByRole('radio', { name: '#ffc53d' }).click();
	expect(await css('--accent')).toBe('#ffc53d');
	expect(await css('--accent-contrast')).toBe('#111111');

	await card.getByRole('switch', { name: /Farbige Gruppen/ }).uncheck();
	await expect(page.locator('html')).toHaveAttribute('data-tint', 'off');

	// Bleibt nach dem Neuladen (und wirkt schon vor dem ersten Rendern)
	await page.reload();
	expect(await css('--row-h')).toBe('32px');
	expect(await rootFont()).toBe('18px');
	expect(await css('--accent')).toBe('#ffc53d');
	await expect(
		card.getByRole('radiogroup', { name: 'Dichte' }).getByRole('radio', { name: 'Kompakt' })
	).toHaveAttribute('aria-checked', 'true');

	// Zeilen sind im Pool wirklich niedriger
	await page.goto('/inbox');
	await page.getByTestId('quick-add').fill('Zeile');
	await page.getByTestId('quick-add').press('Enter');
	const h = (await page.getByTestId('task-row').first().boundingBox())!.height;
	expect(h).toBeLessThan(40);

	// Zurücksetzen stellt alles wieder her
	await page.goto('/einstellungen');
	await card.getByRole('button', { name: 'Darstellung zurücksetzen' }).click();
	expect(await css('--row-h')).toBe('40px');
	expect(await rootFont()).toBe('16px');
	await expect(page.locator('html')).toHaveAttribute('data-tint', 'on');
});

test('Gruppen stehen in Karten, Projekte in ihrer Farbe', async ({ page }) => {
	await page.goto('/');
	await openPool(page, 'Privat');
	await page.getByRole('button', { name: 'Neues Projekt' }).click();
	await page.getByRole('textbox', { name: 'Name des neuen Projekts' }).fill('Umzug');
	await page.keyboard.press('Enter');
	const project = page.getByTestId('project-group');
	await expect(project).toBeVisible();
	// Aufgaben direkt im Pool stehen in einer schlichten Karte ohne Kopfzeile
	await expect(page.getByTestId('group-card')).not.toContainText('Ohne Projekt');
	await expect(page.getByTestId('group-card').locator('.group-head')).toHaveCount(0);
	// Kein farbiger Seitenrand; die Farbe steckt nur dezent in der Kopfzeile (abschaltbar)
	const border = () => project.evaluate((el) => getComputedStyle(el).borderLeftWidth);
	const headBg = () =>
		project.locator('.group-head').evaluate((el) => getComputedStyle(el).backgroundColor);
	expect(await border()).toBe('1px');
	const tinted = await headBg();
	await page.evaluate(() => (document.documentElement.dataset.tint = 'off'));
	expect(await headBg()).not.toBe(tinted);
});
