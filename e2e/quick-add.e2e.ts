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

	await page.getByRole('button', { name: 'Datum' }).click();
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
