import { expect, test } from '@playwright/test';
import { openPool, quickAdd, rowByTitle } from './helpers';

test('Zurückschieben: bleibt sichtbar unter „Später“, ab dem 3. Mal Nachfrage', async ({
	page
}) => {
	await page.goto('/');
	await openPool(page, 'Privat');
	await quickAdd(page, 'Steuererklärung');

	const postponeTomorrow = async () => {
		const row = await rowByTitle(page, 'Steuererklärung');
		await row.getByRole('button', { name: 'Zurückschieben' }).click();
		await page.getByRole('menuitem', { name: /Morgen/ }).click();
	};

	await postponeTomorrow();
	await expect(page.getByRole('status')).toContainText('Verschoben auf morgen');
	const later = page.getByRole('button', { name: /Später/ });
	await expect(later).toContainText('1');
	const row = await rowByTitle(page, 'Steuererklärung');
	await expect(row).toContainText('→ morgen');
	await expect(row).toHaveAttribute('data-depth', '0');

	await postponeTomorrow();
	await expect(row).toContainText('2'); // Verschiebe-Zähler

	await postponeTomorrow();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toContainText('bereits 2-mal verschoben');
	await dialog.getByRole('button', { name: 'Irgendwann' }).click();

	await expect(page.getByRole('button', { name: /Später/ })).toHaveCount(0);
	await page.getByRole('button', { name: /Irgendwann/ }).click();
	await expect(await rowByTitle(page, 'Steuererklärung')).toBeVisible();
});

test('„Aufteilen“ legt direkt eine Unteraufgabe an', async ({ page }) => {
	await page.goto('/');
	await openPool(page, 'Arbeit');
	await quickAdd(page, 'Großes Projekt');
	for (let i = 0; i < 3; i++) {
		const row = await rowByTitle(page, 'Großes Projekt');
		await row.getByRole('button', { name: 'Zurückschieben' }).click();
		await page.getByRole('menuitem', { name: /Nächste Woche/ }).click();
	}
	await page.getByRole('dialog').getByRole('button', { name: 'Aufteilen' }).click();
	await page.keyboard.type('Erster Schritt');
	const rows = page.getByTestId('task-row');
	await expect(rows.nth(1)).toHaveAttribute('data-depth', '1');
	await expect(rows.nth(1).getByRole('textbox')).toHaveValue('Erster Schritt');
});
