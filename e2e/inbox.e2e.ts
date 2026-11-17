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

test('Karte mit Daten versehen und auf ein Projekt ziehen', async ({ page }) => {
	await page.goto('/');
	await openPool(page, 'Privat');
	await page.getByRole('button', { name: 'Neues Projekt' }).click();
	await page.getByRole('textbox', { name: 'Name des neuen Projekts' }).fill('Umzug');
	await page.keyboard.press('Enter');
	await expect(page.getByTestId('project-group')).toBeVisible();

	await page.goto('/inbox');
	await quickAdd(page, 'Kartons');
	await quickAdd(page, 'Weg damit');
	await quickAdd(page, 'Nachdenken');
	await page.getByRole('link', { name: 'Aufräumen' }).click();
	const card = page.getByTestId('triage-card');

	// Daten direkt auf der Karte: Titel, Notiz, morgen, Priorität 1
	const title = card.getByRole('textbox', { name: 'Titel' });
	await title.fill('Kartons besorgen');
	await title.blur();
	await card.getByRole('textbox', { name: 'Notizen' }).fill('beim Baumarkt');
	await card.getByRole('textbox', { name: 'Notizen' }).blur();
	await card.getByRole('button', { name: 'Morgen' }).click();
	await card.getByRole('button', { name: '!1' }).click();
	await expect(card.getByRole('button', { name: '!1' })).toHaveAttribute('aria-pressed', 'true');

	// Karte mit der Maus auf das Projekt „Umzug“ ziehen
	const drag = async (to: string) => {
		const box = (await card.locator('.meta').boundingBox())!;
		const target = (await page.locator(`[data-triage-target="${to}"]`).boundingBox())!;
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		await page.mouse.down();
		await page.mouse.move(box.x + box.width / 2 + 10, box.y + box.height / 2 + 10, { steps: 3 });
		await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 10 });
		await expect(page.locator(`[data-triage-target="${to}"]`)).toHaveClass(/over/);
		await page.mouse.up();
	};
	const projectKey = await page
		.locator('[data-triage-target^="project:"]')
		.first()
		.getAttribute('data-triage-target');
	await drag(projectKey!);
	await expect(page.getByRole('status')).toContainText('Nach „Umzug“ verschoben');
	await expect(title).toHaveValue('Weg damit');

	// Auf den Papierkorb ziehen
	await drag('trash');
	await expect(title).toHaveValue('Nachdenken');

	// Nach links wischen (ziehen ohne Ziel) = löschen, dann ist die Inbox leer
	const box = (await card.locator('.meta').boundingBox())!;
	await page.mouse.move(box.x + 40, box.y + 5);
	await page.mouse.down();
	await page.mouse.move(box.x - 200, box.y + 5, { steps: 10 });
	await expect(card.getByText('Löschen')).toBeVisible(); // Stempel
	await page.mouse.up();
	await expect(page.getByText('Fertig aufgeräumt!')).toBeVisible();

	// Aufgabe ist mit allen Daten im Projekt angekommen
	await page.getByRole('navigation').getByRole('link', { name: 'Umzug' }).click();
	const row = page.getByTestId('task-row').first();
	await expect(row.getByRole('textbox', { name: 'Titel' })).toHaveValue('Kartons besorgen');
	await expect(row).toContainText('!1');
	await expect(row).toContainText('morgen');
});
