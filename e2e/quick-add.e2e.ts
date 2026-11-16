import { expect, test } from '@playwright/test';
import { openPool, quickAdd, rowByTitle } from './helpers';

test('Kürzel werden live als Chips angezeigt und sind entfernbar', async ({ page }) => {
	await page.goto('/inbox');
	const input = page.getByTestId('quick-add');
	await input.fill('Rechnung zahlen morgen !1 #privat');

	const chips = page.getByTestId('chip');
	await expect(chips).toHaveCount(3);
	await expect(chips.nth(0)).toContainText('morgen');
	await expect(chips.nth(1)).toContainText('Priorität 1');
	await expect(chips.nth(2)).toContainText('Privat');

	// Datum-Chip entfernen → „morgen“ bleibt normaler Text im Titel
	await page.getByRole('button', { name: 'Entfernen: morgen' }).click();
	await expect(chips).toHaveCount(2);

	await input.press('Enter');
	await expect(page.getByRole('status')).toContainText('In „Privat“ angelegt');

	await openPool(page, 'Privat');
	const row = await rowByTitle(page, 'Rechnung zahlen morgen');
	await expect(row).toContainText('!1');
});

test('Datum per Button-Leiste und unbekannter Pool', async ({ page }) => {
	await page.goto('/inbox');
	const input = page.getByTestId('quick-add');
	await input.fill('Idee #projekte');
	await expect(page.getByTestId('chip')).toContainText('Unbekannter Pool');

	// Pool direkt aus dem Chip anlegen
	await page.getByRole('button', { name: 'anlegen' }).click();
	await expect(page.getByTestId('chip')).toHaveText(/projekte/);
	await expect(page.getByRole('navigation')).toContainText('projekte');

	await page.getByRole('button', { name: 'Heute' }).click();
	await input.press('Enter');

	await openPool(page, 'projekte');
	await expect(await rowByTitle(page, 'Idee')).toContainText('heute');
});

test('ohne Pool landet die Aufgabe in der Inbox, Badge zählt mit', async ({ page }) => {
	await page.goto('/inbox');
	await quickAdd(page, 'Milch kaufen');
	await quickAdd(page, 'Zahnarzt anrufen');
	await expect(page.getByTestId('inbox-badge')).toHaveText('2');
	await expect(page.getByTestId('task-row')).toHaveCount(2);
});

test('Leiste: Datum, Priorität und Ziel mit je einem Klick', async ({ page }) => {
	await page.goto('/');
	await openPool(page, 'Privat');
	await page.getByRole('button', { name: 'Neues Projekt' }).click();
	await page.getByRole('textbox', { name: 'Name des neuen Projekts' }).fill('Umzug');
	await page.keyboard.press('Enter');
	await expect(page.getByTestId('project-group').filter({ hasText: 'Umzug' })).toBeVisible();

	await page.goto('/inbox');
	const input = page.getByTestId('quick-add');
	await input.fill('Kartons besorgen');
	const morgen = page.getByRole('button', { name: 'Morgen', exact: true });
	await morgen.click();
	await expect(morgen).toHaveAttribute('aria-pressed', 'true');
	await page.getByRole('button', { name: '!2' }).click();
	await expect(page.getByRole('button', { name: '!2' })).toHaveAttribute('aria-pressed', 'true');
	await page
		.getByRole('combobox', { name: 'Pool / Projekt' })
		.selectOption({ label: '  Privat › Umzug' });
	await input.press('Enter');
	await expect(page.getByRole('status')).toContainText('In „Privat › Umzug“ angelegt');
	// Leiste ist wieder zurückgesetzt
	await expect(morgen).toHaveAttribute('aria-pressed', 'false');

	await page.getByRole('navigation').getByRole('link', { name: /Umzug/ }).click();
	const row = await rowByTitle(page, 'Kartons besorgen');
	await expect(row).toContainText('!2');
	await expect(row).toContainText('morgen');
});

test('Kürzel „#projekt“ und Leisten-Status folgen der Eingabe', async ({ page }) => {
	await page.goto('/');
	await openPool(page, 'Arbeit');
	await page.getByRole('button', { name: 'Neues Projekt' }).click();
	await page.getByRole('textbox', { name: 'Name des neuen Projekts' }).fill('Website');
	await page.keyboard.press('Enter');
	await expect(page.getByTestId('project-group').filter({ hasText: 'Website' })).toBeVisible();

	await page.goto('/inbox');
	await page.getByTestId('quick-add').fill('Logo tauschen heute !1 #web');
	await expect(page.getByRole('button', { name: 'Heute', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(page.getByRole('button', { name: '!1', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(page.getByTestId('chip').nth(2)).toContainText('Arbeit › Website');
	// Leiste überschreibt das Kürzel: „heute“ wird wieder normaler Text
	await page.getByRole('button', { name: 'Heute', exact: true }).click();
	await expect(page.getByTestId('chip')).toHaveCount(2);
	await page.getByTestId('quick-add').press('Enter');
	await page
		.getByRole('navigation')
		.getByRole('link', { name: /Website/ })
		.click();
	await expect(await rowByTitle(page, 'Logo tauschen heute')).toBeVisible();
});
