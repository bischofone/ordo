import { expect, test, type Locator, type Page } from '@playwright/test';
import { openPool, outline, quickAdd, rowByTitle } from './helpers';

/**
 * Zieht eine Zeile am Griff. `y` = Zielhöhe, `dx` = waagrechte Verschiebung ab dem Griff
 * (je ~22 px eine Ebene nach rechts/links). Ohne `dx` bleibt die Ebene, wie sie sich ergibt.
 */
async function dragRow(
	page: Page,
	row: Locator,
	to: { y: number; dx?: number } | { x: number; y: number }
) {
	await row.hover();
	const grip = row.getByRole('button', { name: 'Ziehen zum Verschieben' });
	const box = (await grip.boundingBox())!;
	const sx = box.x + box.width / 2;
	const sy = box.y + box.height / 2;
	const tx = 'x' in to ? to.x : sx + (to.dx ?? 0);
	await page.mouse.move(sx, sy);
	await page.mouse.down();
	await page.mouse.move(sx, sy + 6, { steps: 2 });
	await page.mouse.move(tx, to.y, { steps: 8 });
	await expect(page.getByTestId('drop-indicator').or(page.locator('.drop-over'))).toBeVisible();
	await page.mouse.up();
}

const below = async (row: Locator, dx = 0) => {
	const b = (await row.boundingBox())!;
	return { y: b.y + b.height - 4, dx };
};
const above = async (row: Locator) => {
	const b = (await row.boundingBox())!;
	return { y: b.y + 4 };
};

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await openPool(page, 'Privat');
	for (const t of ['Eins', 'Zwei', 'Drei']) await quickAdd(page, t);
	await expect.poll(() => outline(page)).toEqual(['0:Eins', '0:Zwei', '0:Drei']);
});

test('umsortieren, einrücken und ausrücken per Drag & Drop', async ({ page }) => {
	// „Drei“ ganz nach oben
	await dragRow(page, await rowByTitle(page, 'Drei'), await above(await rowByTitle(page, 'Eins')));
	await expect.poll(() => outline(page)).toEqual(['0:Drei', '0:Eins', '0:Zwei']);

	// „Zwei“ nach rechts unter „Eins“ → Unteraufgabe
	await dragRow(
		page,
		await rowByTitle(page, 'Zwei'),
		await below(await rowByTitle(page, 'Eins'), 30)
	);
	await expect.poll(() => outline(page)).toEqual(['0:Drei', '0:Eins', '1:Zwei']);
	await expect((await rowByTitle(page, 'Eins')).getByTitle('Unteraufgaben')).toHaveText('0/1');

	// „Eins“ samt Unteraufgabe unter „Drei“ hängen
	await dragRow(
		page,
		await rowByTitle(page, 'Eins'),
		await below(await rowByTitle(page, 'Drei'), 30)
	);
	await expect.poll(() => outline(page)).toEqual(['0:Drei', '1:Eins', '2:Zwei']);

	// „Zwei“ ganz nach links ans Ende → wieder oberste Ebene
	await dragRow(
		page,
		await rowByTitle(page, 'Zwei'),
		await below(await rowByTitle(page, 'Zwei'), -80)
	);
	await expect.poll(() => outline(page)).toEqual(['0:Drei', '1:Eins', '0:Zwei']);

	await page.reload();
	await expect.poll(() => outline(page)).toEqual(['0:Drei', '1:Eins', '0:Zwei']);
});

test('in ein Projekt und auf einen anderen Pool ziehen', async ({ page }) => {
	await page.getByRole('button', { name: 'Neues Projekt' }).click();
	await page.getByRole('textbox', { name: 'Name des neuen Projekts' }).fill('Umzug');
	await page.keyboard.press('Enter');
	const project = page.getByTestId('project-group').filter({ hasText: 'Umzug' });
	await expect(project).toBeVisible();

	// In die (leere) Projektliste ziehen
	const list = project.locator('[data-drop-list]').first();
	const lb = (await list.boundingBox())!;
	await dragRow(page, await rowByTitle(page, 'Zwei'), { x: lb.x + 120, y: lb.y + 10 });
	await expect.poll(() => outline(page, project)).toEqual(['0:Zwei']);

	// Auf „Arbeit“ in der Seitenleiste ziehen
	const arbeit = page.getByRole('navigation').getByRole('link', { name: /^Arbeit/ });
	const ab = (await arbeit.boundingBox())!;
	await dragRow(page, await rowByTitle(page, 'Eins'), { x: ab.x + 40, y: ab.y + ab.height / 2 });
	await expect(page.getByRole('status')).toContainText('Nach „Arbeit“ verschoben');
	await expect.poll(() => outline(page)).toEqual(['0:Drei', '0:Zwei']);

	await openPool(page, 'Arbeit');
	expect(await outline(page)).toEqual(['0:Eins']);
});

test('Unteraufgabe per Knopf anlegen', async ({ page }) => {
	const row = await rowByTitle(page, 'Zwei');
	await row.hover();
	await row.getByRole('button', { name: 'Unteraufgabe hinzufügen' }).click();
	await page.keyboard.type('Teil A');
	await page.keyboard.press('Enter');
	await page.keyboard.type('Teil B');
	await expect
		.poll(() => outline(page))
		.toEqual(['0:Eins', '0:Zwei', '1:Teil A', '1:Teil B', '0:Drei']);
});
