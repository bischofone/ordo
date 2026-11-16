import { expect, test } from '@playwright/test';
import { openPool, quickAdd, rowByTitle } from './helpers';

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await openPool(page, 'Privat');
	await quickAdd(page, 'Erste Aufgabe');
	await quickAdd(page, 'Zweite Aufgabe');
});

test('Klick auf eine Aufgabe öffnet die Details daneben, Tippen bleibt möglich', async ({
	page
}) => {
	const detail = page.getByTestId('detail');
	const first = await rowByTitle(page, 'Erste Aufgabe');

	// Klick in den Titel: Cursor sitzt im Titel UND die Details stehen rechts daneben (kein Abdunkeln)
	await first.getByRole('textbox', { name: 'Titel' }).click();
	await expect(detail).toBeVisible();
	await expect(detail.getByRole('textbox', { name: 'Titel' })).toHaveValue('Erste Aufgabe');
	await expect(first.getByRole('textbox', { name: 'Titel' })).toBeFocused();
	await expect(page.getByRole('button', { name: 'Schließen' })).toHaveCount(1); // nur das X, kein Hintergrund
	await page.keyboard.press('End');
	await page.keyboard.type(' (neu)');
	await expect(detail.getByRole('textbox', { name: 'Titel' })).toHaveValue('Erste Aufgabe (neu)');

	// Die Liste wird nicht verdeckt
	const rowBox = (await first.boundingBox())!;
	const detailBox = (await detail.boundingBox())!;
	expect(rowBox.x + rowBox.width).toBeLessThanOrEqual(detailBox.x);

	// Mit der Pfeiltaste zur nächsten Zeile → Details folgen
	await page.keyboard.press('ArrowDown');
	await expect(detail.getByRole('textbox', { name: 'Titel' })).toHaveValue('Zweite Aufgabe');

	// Klick auf die freie Fläche einer Zeile öffnet ebenfalls
	const box = (await first.boundingBox())!;
	await page.mouse.click(box.x + box.width * 0.6, box.y + box.height / 2);
	await expect(detail.getByRole('textbox', { name: 'Titel' })).toHaveValue('Erste Aufgabe (neu)');

	// Knöpfe der Zeile behalten ihre Funktion; Escape schließt
	await page.keyboard.press('Escape');
	await expect(detail).toHaveCount(0);
	await (
		await rowByTitle(page, 'Zweite Aufgabe')
	)
		.getByRole('checkbox', { name: 'Erledigt' })
		.click();
	await expect(detail).toHaveCount(0);
});

test('abschaltbar: dann öffnen nur die drei Punkte', async ({ page }) => {
	await page.goto('/einstellungen');
	await page.getByRole('switch', { name: /Details beim Anklicken öffnen/ }).uncheck();
	await openPool(page, 'Privat');
	const row = await rowByTitle(page, 'Erste Aufgabe');
	await row.getByRole('textbox', { name: 'Titel' }).click();
	await expect(page.getByTestId('detail')).toHaveCount(0);
	await row.getByRole('button', { name: 'Details' }).click();
	await expect(page.getByTestId('detail')).toBeVisible();
});
