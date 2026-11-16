import { expect, test } from '@playwright/test';
import { openPool, quickAdd } from './helpers';

test('Pool löschen: Rückfrage mit Anzahl, danach ist er samt Aufgaben weg', async ({ page }) => {
	await page.goto('/');
	await openPool(page, 'Privat');
	await quickAdd(page, 'Eins');
	await quickAdd(page, 'Zwei');
	await page.getByRole('button', { name: 'Neues Projekt' }).click();
	await page.getByRole('textbox', { name: 'Name des neuen Projekts' }).fill('Umzug');
	await page.keyboard.press('Enter');
	await expect(page.getByTestId('project-group')).toBeVisible();

	await page.getByRole('button', { name: 'Pool bearbeiten' }).click();
	const del = page.getByTestId('editor').getByRole('button', { name: 'Löschen' });

	// Abbrechen ändert nichts
	await del.click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toContainText('Pool „Privat“ löschen?');
	await expect(dialog).toContainText('2 Aufgaben und 1 Projekt werden endgültig gelöscht');
	await dialog.getByRole('button', { name: 'Abbrechen' }).click();
	await expect(page.getByTestId('task-row')).toHaveCount(2);

	await del.click();
	await dialog.getByRole('button', { name: 'Pool löschen' }).click();
	await expect(page.getByRole('status')).toContainText('Pool „Privat“ gelöscht');
	await expect(page.getByRole('heading', { level: 1, name: 'Alle Pools' })).toBeVisible();
	const nav = page.getByRole('navigation');
	await expect(nav.getByRole('link', { name: /^Privat/ })).toHaveCount(0);
	await expect(nav.getByRole('link', { name: 'Umzug' })).toHaveCount(0);
	await expect(page.getByTestId('task-row')).toHaveCount(0);

	// Bleibt auch nach dem Neuladen weg; die Inbox hat keinen Löschen-Knopf
	await page.reload();
	await expect(nav.getByRole('link', { name: /^Arbeit/ })).toBeVisible();
	await expect(nav.getByRole('link', { name: /^Privat/ })).toHaveCount(0);
	await page.goto('/einstellungen');
	await expect(page.getByTestId('editor').getByRole('button', { name: 'Löschen' })).toHaveCount(1);
});
