import { expect, test } from '@playwright/test';
import { openPool, outline, quickAdd } from './helpers';

test('Projekt anlegen, Farbe und Icon wählen, bearbeiten und löschen', async ({ page }) => {
	await page.goto('/');
	await openPool(page, 'Privat');
	await quickAdd(page, 'Lose Aufgabe');

	await page.getByRole('button', { name: 'Neues Projekt' }).click();
	await page.getByRole('textbox', { name: 'Name des neuen Projekts' }).fill('Garten');
	await page.keyboard.press('Enter');

	// Projekt erscheint in der Seitenleiste und als Gruppe im Pool
	const nav = page.getByRole('navigation');
	await expect(nav.getByRole('link', { name: 'Garten' })).toBeVisible();
	await page
		.getByTestId('project-group')
		.getByRole('button', { name: 'Aufgabe hinzufügen', exact: true })
		.click();
	await page.keyboard.type('Rasen mähen');
	await expect
		.poll(() => outline(page, page.getByTestId('project-group')))
		.toEqual(['0:Rasen mähen']);

	// Projektseite: bearbeiten
	await nav.getByRole('link', { name: 'Garten' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Garten' })).toBeVisible();
	await page.getByRole('button', { name: 'Projekt bearbeiten' }).click();

	await page.getByRole('button', { name: 'Icon wählen' }).click();
	await page.getByRole('radio', { name: 'leaf' }).click();
	await page.getByRole('button', { name: 'Farbe wählen' }).click();
	await page.getByRole('radio', { name: '#46a758' }).click();
	await expect(page.getByRole('radio', { name: 'leaf' })).toHaveCount(0); // Popover zu

	await page.getByRole('button', { name: 'Icon wählen' }).click();
	await expect(page.getByRole('radio', { name: 'leaf' })).toHaveAttribute('aria-checked', 'true');
	await page.keyboard.press('Escape');

	// Löschen: Aufgaben bleiben im Pool
	await page.getByRole('button', { name: 'Löschen' }).click();
	await expect(page.getByRole('dialog')).toContainText('Das Projekt enthält 1 Aufgabe');
	await page.getByRole('dialog').getByRole('button', { name: 'Aufgaben behalten' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Privat' })).toBeVisible();
	await expect(nav.getByRole('link', { name: 'Garten' })).toHaveCount(0);
	await expect.poll(() => outline(page)).toEqual(['0:Lose Aufgabe', '0:Rasen mähen']);
});

test('Pool-Farbe und Icon über einen Knopf', async ({ page }) => {
	await page.goto('/');
	await openPool(page, 'Arbeit');
	await page.getByRole('button', { name: 'Pool bearbeiten' }).click();
	await page.getByRole('button', { name: 'Icon wählen' }).click();
	await page.getByRole('radio', { name: 'briefcase' }).click();
	// Icon steht jetzt auch in der Seitenleiste
	await expect(
		page
			.getByRole('navigation')
			.getByRole('link', { name: /^Arbeit/ })
			.locator('svg')
	).toBeVisible();
	await page.getByRole('button', { name: 'Farbe wählen' }).click();
	await expect(page.getByRole('radio', { name: '#e5484d' })).toBeVisible();
	await page.getByRole('radio', { name: '#e5484d' }).click();
	await expect(page.getByRole('button', { name: 'Farbe wählen' })).toHaveCSS(
		'background-color',
		'rgb(229, 72, 77)'
	);
});

test('Projekt direkt im Pool und in den Einstellungen löschen', async ({ page }) => {
	await page.goto('/');
	await openPool(page, 'Privat');
	await quickAdd(page, 'Bleibt im Pool');
	for (const name of ['Umzug', 'Leer']) {
		await page.getByRole('button', { name: 'Neues Projekt' }).click();
		await page.getByRole('textbox', { name: 'Name des neuen Projekts' }).fill(name);
		await page.keyboard.press('Enter');
		await expect(page.getByTestId('project-group').filter({ hasText: name })).toBeVisible();
	}
	const umzug = page.getByTestId('project-group').filter({ hasText: 'Umzug' });
	await umzug.getByRole('button', { name: 'Aufgabe hinzufügen', exact: true }).click();
	await page.keyboard.type('Kisten');
	await page.keyboard.press('Enter');
	await page.keyboard.press('Tab');
	await page.keyboard.type('Kartons');
	await expect.poll(() => outline(page, umzug)).toEqual(['0:Kisten', '1:Kartons']);

	// Im Pool: Stift am Projekt → Löschen → mit Aufgaben
	await page.getByRole('button', { name: 'Projekt bearbeiten: Umzug' }).click();
	await umzug.getByTestId('editor').getByRole('button', { name: 'Löschen' }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toContainText('Projekt „Umzug“ löschen?');
	await expect(dialog).toContainText('2 Aufgaben');
	await dialog.getByRole('button', { name: 'Mit Aufgaben löschen' }).click();
	await expect(page.getByRole('status')).toContainText('Projekt „Umzug“ gelöscht');
	await expect(page.getByTestId('project-group')).toHaveCount(1);
	await expect.poll(() => outline(page)).toEqual(['0:Bleibt im Pool']);

	// In den Einstellungen: leeres Projekt löschen (keine Frage nach Aufgaben)
	await page.goto('/einstellungen#pools');
	const row = page.getByTestId('editor').filter({ has: page.locator('input[aria-label="Name"]') });
	const leer = row.nth(2); // Inbox, Privat, Leer, Arbeit
	await expect(leer.getByRole('textbox', { name: 'Name' })).toHaveValue('Leer');
	await leer.getByRole('button', { name: 'Löschen' }).click();
	await expect(dialog).toContainText('keine Aufgaben');
	await dialog.getByRole('button', { name: 'Projekt löschen' }).click();
	await expect(page.getByRole('navigation').getByRole('link', { name: 'Leer' })).toHaveCount(0);
});
