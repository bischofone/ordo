import { expect, test } from '@playwright/test';
import { openPool, outline, rowByTitle } from './helpers';

test('Aufgabenbaum nur mit der Tastatur anlegen, Fortschritt, Neuladen', async ({ page }) => {
	await page.goto('/');
	await openPool(page, 'Privat');

	await page.getByRole('button', { name: 'Aufgabe hinzufügen', exact: true }).click();
	// Schnell hintereinander tippen – der Tastenpuffer darf nichts verlieren.
	const kb = page.keyboard;
	await kb.type('Urlaub');
	await kb.press('Enter');
	await kb.press('Tab');
	await kb.type('Packen');
	await kb.press('Enter');
	await kb.press('Tab');
	await kb.type('Kleidung');
	await kb.press('Enter');
	await kb.type('Ladekabel');
	await kb.press('Enter');
	await kb.press('Shift+Tab');
	await kb.type('Unterkunft buchen');
	await kb.press('Enter');
	await kb.press('Shift+Tab');
	await kb.type('Steuer');

	const expected = [
		'0:Urlaub',
		'1:Packen',
		'2:Kleidung',
		'2:Ladekabel',
		'1:Unterkunft buchen',
		'0:Steuer'
	];
	await expect.poll(() => outline(page)).toEqual(expected);
	await expect((await rowByTitle(page, 'Urlaub')).getByTitle('Unteraufgaben')).toHaveText('0/2');

	// Strg+Enter hakt ab → Fortschritt am Elternteil
	await (await rowByTitle(page, 'Kleidung')).getByRole('textbox', { name: 'Titel' }).click();
	await kb.press('Control+Enter');
	await expect((await rowByTitle(page, 'Packen')).getByTitle('Unteraufgaben')).toHaveText('1/2');

	// Alt+↑ verschiebt innerhalb der Ebene
	await (await rowByTitle(page, 'Ladekabel')).getByRole('textbox', { name: 'Titel' }).click();
	await kb.press('Alt+ArrowUp');
	await expect
		.poll(() => outline(page))
		.toEqual([
			'0:Urlaub',
			'1:Packen',
			'2:Ladekabel',
			'2:Kleidung',
			'1:Unterkunft buchen',
			'0:Steuer'
		]);

	// Einklappen versteckt Unteraufgaben
	await (await rowByTitle(page, 'Packen')).getByRole('button', { name: 'Einklappen' }).click();
	await expect
		.poll(() => outline(page))
		.toEqual(['0:Urlaub', '1:Packen', '1:Unterkunft buchen', '0:Steuer']);

	// Alles bleibt nach dem Neuladen erhalten (IndexedDB)
	await page.reload();
	await expect
		.poll(() => outline(page))
		.toEqual(['0:Urlaub', '1:Packen', '1:Unterkunft buchen', '0:Steuer']);
});

test('Text hinter dem Cursor wandert mit Enter in die neue Zeile; Backspace löscht leere Zeile', async ({
	page
}) => {
	await page.goto('/');
	await openPool(page, 'Arbeit');
	await page.getByRole('button', { name: 'Aufgabe hinzufügen', exact: true }).click();
	await page.keyboard.type('Bericht schreiben');
	for (let i = 0; i < ' schreiben'.length; i++) await page.keyboard.press('ArrowLeft');
	await page.keyboard.press('Enter');
	await expect.poll(() => outline(page)).toEqual(['0:Bericht', '0:schreiben']);

	// Cursor steht am Anfang von „schreiben“ → Enter fügt eine leere Zeile darüber ein
	await page.keyboard.press('Enter');
	await expect.poll(() => outline(page)).toEqual(['0:Bericht', '0:', '0:schreiben']);
	await page.keyboard.press('ArrowUp');
	await page.keyboard.press('Backspace');
	await expect.poll(() => outline(page)).toEqual(['0:Bericht', '0:schreiben']);
	await expect(
		page.getByTestId('task-row').first().getByRole('textbox', { name: 'Titel' })
	).toBeFocused();
});

test('Löschen mit Unteraufgaben fragt nach und lässt sich rückgängig machen', async ({ page }) => {
	await page.goto('/');
	await openPool(page, 'Privat');
	await page.getByRole('button', { name: 'Aufgabe hinzufügen', exact: true }).click();
	await page.keyboard.type('Eltern');
	await page.keyboard.press('Enter');
	await page.keyboard.press('Tab');
	await page.keyboard.type('Kind');
	await expect.poll(() => outline(page)).toEqual(['0:Eltern', '1:Kind']);

	await (await rowByTitle(page, 'Eltern')).getByRole('button', { name: 'Details' }).click();
	await page.getByRole('complementary').getByRole('button', { name: 'Löschen' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Mit Unteraufgaben löschen' }).click();
	await expect(page.getByTestId('task-row')).toHaveCount(0);

	await page.getByRole('status').getByRole('button', { name: 'Rückgängig' }).click();
	await expect.poll(() => outline(page)).toEqual(['0:Eltern', '1:Kind']);
});
