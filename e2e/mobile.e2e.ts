import { expect, test } from '@playwright/test';
import { outline } from './helpers';

test('Handy: Menü, Leiste über der Tastatur, Wischen zum Abhaken', async ({ page }) => {
	await page.goto('/inbox');

	// Seitenleiste ist eingeklappt und per Menü erreichbar
	await page.getByRole('button', { name: 'Menü' }).click();
	await page
		.getByRole('navigation')
		.getByRole('link', { name: /Privat/ })
		.click();
	await expect(page.getByRole('heading', { level: 1, name: 'Privat' })).toBeVisible();

	await page.getByRole('button', { name: 'Aufgabe hinzufügen', exact: true }).tap();
	await page.keyboard.type('Einkauf');
	await page.keyboard.press('Enter');
	await page.keyboard.type('Brot');

	const toolbar = page.getByRole('toolbar', { name: 'Gliederung' });
	await expect(toolbar).toBeVisible();
	await toolbar.getByRole('button', { name: 'Einrücken' }).tap();
	await expect.poll(() => outline(page)).toEqual(['0:Einkauf', '1:Brot']);
	await toolbar.getByRole('button', { name: 'Ausrücken' }).tap();
	await expect.poll(() => outline(page)).toEqual(['0:Einkauf', '0:Brot']);

	// Nach rechts wischen = erledigt
	await toolbar.getByRole('button', { name: 'Tastatur ausblenden' }).tap();
	const row = page.getByTestId('task-row').nth(1);
	const box = (await row.boundingBox())!;
	const y = box.y + box.height / 2;
	await row.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: box.x + 40, clientY: y });
	for (let x = 60; x <= 200; x += 20) {
		await row.dispatchEvent('pointermove', {
			pointerType: 'touch',
			clientX: box.x + x,
			clientY: y
		});
	}
	await row.dispatchEvent('pointerup', { pointerType: 'touch', clientX: box.x + 200, clientY: y });
	await expect(page.getByRole('button', { name: /Erledigt/ })).toContainText('1');
	await expect.poll(() => outline(page)).toEqual(['0:Einkauf']);
});

test('Handy: Aufgabe mit dem Finger am Griff verschieben', async ({ page }) => {
	await page.goto('/inbox');
	for (const t of ['Erste', 'Zweite']) {
		const input = page.getByTestId('quick-add');
		await input.fill(t);
		await input.press('Enter');
		await expect(input).toHaveValue('');
	}
	await expect.poll(() => outline(page)).toEqual(['0:Erste', '0:Zweite']);

	const grip = page
		.getByTestId('task-row')
		.nth(1)
		.getByRole('button', { name: 'Ziehen zum Verschieben' });
	const g = (await grip.boundingBox())!;
	const first = (await page.getByTestId('task-row').first().boundingBox())!;
	const cdp = await page.context().newCDPSession(page);
	const touch = (type: string, x: number, y: number) =>
		cdp.send('Input.dispatchTouchEvent', {
			type,
			touchPoints: type === 'touchEnd' ? [] : [{ x, y }]
		});
	const x = g.x + g.width / 2;
	await touch('touchStart', x, g.y + g.height / 2);
	for (let y = g.y + g.height / 2; y >= first.y + 4; y -= 6) await touch('touchMove', x, y);
	await touch('touchEnd', x, first.y + 4);

	await expect.poll(() => outline(page)).toEqual(['0:Zweite', '0:Erste']);
});
