import { expect, test } from '@playwright/test';
import { openPool, outline, quickAdd } from './helpers';

test('Aufräum-Modus: zuweisen, Irgendwann, löschen, überspringen', async ({ page }) => {
	await page.goto('/inbox');
	for (const t of ['Angebot prüfen', 'Sprache lernen', 'Altes Zeug', 'Später ansehen']) {
		await quickAdd(page, t);
	}
	await expect(page.getByTestId('inbox-badge')).toHaveText('4');

	await page.getByRole('link', { name: 'Aufräumen' }).click();
	const card = page.getByTestId('triage-card');
	const title = card.getByRole('textbox', { name: 'Titel' });

	await expect(title).toHaveValue('Angebot prüfen');
	await expect(page.getByText('1 von 4')).toBeVisible();
	await page.getByRole('button', { name: /Arbeit/ }).click();

	await expect(title).toHaveValue('Sprache lernen');
	await page.getByRole('button', { name: 'Irgendwann' }).click();
	await expect(page.getByText('Irgendwann – in welchen Pool?')).toBeVisible();
	await page.getByRole('button', { name: /Privat/ }).click();

	await expect(title).toHaveValue('Altes Zeug');
	await page.keyboard.press('Delete'); // Tastenkürzel
	await expect(title).toHaveValue('Später ansehen');
	await page.getByRole('button', { name: 'Überspringen' }).click();

	await expect(page.getByText('Fertig aufgeräumt!')).toBeVisible();
	await expect(page.getByTestId('inbox-badge')).toHaveText('1'); // übersprungener Eintrag

	await openPool(page, 'Arbeit');
	expect(await outline(page)).toEqual(['0:Angebot prüfen']);

	await openPool(page, 'Privat');
	await expect(page.getByTestId('task-row')).toHaveCount(0);
	await page.getByRole('button', { name: /Irgendwann/ }).click();
	expect(await outline(page)).toEqual(['0:Sprache lernen']);
});

test('alte Inbox-Einträge werden markiert', async ({ page }) => {
	await page.clock.install({ time: new Date('2026-03-01T09:00:00') });
	await page.goto('/inbox');
	await quickAdd(page, 'Uralt');
	await page.clock.setSystemTime(new Date('2026-03-10T09:00:00'));
	await page.reload();
	await expect(page.getByTestId('aged')).toBeVisible();
	await expect(page.getByText('schon länger hier')).toBeVisible();
});
