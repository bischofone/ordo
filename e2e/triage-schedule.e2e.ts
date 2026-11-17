import { expect, test, type Page } from '@playwright/test';
import { openPool, quickAdd } from './helpers';

// Dienstag, 17.11.2026, 8:50
test.beforeEach(async ({ page }) => {
	await page.clock.install({ time: new Date('2026-11-17T08:50:00') });
	await page.goto('/inbox');
	await quickAdd(page, 'Eins');
	await quickAdd(page, 'Zwei');
});

async function setMode(page: Page, mode: 'Aus' | 'Vorschlagen' | 'Erzwingen') {
	await page.goto('/einstellungen#inbox');
	const card = page.getByTestId('triage-settings');
	await card
		.getByRole('radiogroup', { name: 'Aufräumen' })
		.getByRole('radio', { name: mode })
		.click();
	return card;
}

test('Vorschlagen zur eingestellten Uhrzeit: Hinweis, später, ausblenden', async ({ page }) => {
	const card = await setMode(page, 'Vorschlagen');
	// Standard: Mo–Fr 9:00 – eine zweite Zeit dazu, nur dienstags 12:00
	await card.getByRole('button', { name: 'Zeit hinzufügen' }).click();
	const second = card.getByTestId('triage-time').nth(1);
	await second.getByLabel('Uhrzeit 2').first().fill('12:00');
	for (const d of ['Mo', 'Mi', 'Do', 'Fr'])
		await second.getByRole('button', { name: `${d} ` }).click();

	await page.goto('/inbox');
	const banner = page.getByTestId('triage-banner');
	await expect(banner).toHaveCount(0);

	// 9:00 → Hinweis
	await page.clock.fastForward('11:00');
	await expect(banner).toContainText('Zeit zum Aufräumen: 2 Einträge in der Inbox');
	await expect(banner).toContainText('geplant um 09:00');

	// Später (15 Min.) → weg, danach wieder da
	await banner.getByRole('button', { name: '15 Min. später' }).click();
	await expect(banner).toHaveCount(0);
	await page.clock.fastForward('16:00');
	await expect(banner).toBeVisible();

	// Ausblenden → bis zur nächsten Zeit (12:00) Ruhe
	await banner.getByRole('button', { name: 'Für jetzt ausblenden' }).click();
	await expect(banner).toHaveCount(0);
	await page.clock.fastForward('02:50:00');
	await expect(banner).toContainText('geplant um 12:00');

	// „Aufräumen“ öffnet den Modus; danach ist Ruhe
	await banner.getByRole('link', { name: 'Aufräumen' }).click();
	const title = page.getByTestId('triage-card').getByRole('textbox', { name: 'Titel' });
	await expect(title).toHaveValue('Eins');
	await page.getByRole('button', { name: /Arbeit/ }).click();
	await expect(title).toHaveValue('Zwei');
	await page.getByRole('button', { name: /Privat/ }).click();
	await expect(page.getByText('Fertig aufgeräumt!')).toBeVisible();
	await page.goto('/');
	await expect(banner).toHaveCount(0);
});

test('Regel: ab 3 Einträgen vorschlagen', async ({ page }) => {
	const card = await setMode(page, 'Vorschlagen');
	await card.getByRole('button', { name: 'Zeit entfernen' }).click();
	await card.getByRole('checkbox').first().check();
	await card.getByRole('spinbutton', { name: /wenn mindestens/ }).fill('3');
	await card.getByRole('spinbutton', { name: /wenn mindestens/ }).blur();

	await page.goto('/inbox');
	await expect(page.getByTestId('triage-banner')).toHaveCount(0);
	await quickAdd(page, 'Drei');
	await expect(page.getByTestId('triage-banner')).toContainText('viele Einträge');
});

test('Erzwingen: App öffnet das Aufräumen und lässt erst danach weiter', async ({ page }) => {
	await setMode(page, 'Erzwingen');
	await openPool(page, 'Arbeit');

	// 9:00 → Weiterleitung ins Aufräumen, ohne Zurück und ohne Überspringen
	await page.clock.fastForward('11:00');
	await expect(page).toHaveURL(/\/inbox\/aufraeumen/);
	const forced = page.getByTestId('triage-forced');
	await expect(forced).toContainText('Noch 2 Einträge');
	await expect(page.getByRole('link', { name: 'Zurück zur Inbox' })).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Überspringen' })).toHaveCount(0);

	// Wegnavigieren geht nicht
	await page
		.getByRole('navigation')
		.getByRole('link', { name: /^Privat/ })
		.click();
	await expect(page).toHaveURL(/\/inbox\/aufraeumen/);

	// Einmal aufschieben ist erlaubt …
	await forced.getByRole('button', { name: '15 Min. später' }).click();
	await page
		.getByRole('navigation')
		.getByRole('link', { name: /^Privat/ })
		.click();
	await expect(page.getByRole('heading', { level: 1, name: 'Privat' })).toBeVisible();
	// … danach geht es zurück – und kein zweites Mal
	await page.clock.fastForward('16:00');
	await expect(page).toHaveURL(/\/inbox\/aufraeumen/);
	await expect(forced.getByRole('button', { name: /später/ })).toHaveCount(0);

	// Leer räumen → frei
	const title = page.getByTestId('triage-card').getByRole('textbox', { name: 'Titel' });
	await page.getByRole('button', { name: /Arbeit/ }).click();
	await expect(title).toHaveValue('Zwei');
	await page.keyboard.press('Delete');
	await expect(page.getByText('Fertig aufgeräumt!')).toBeVisible();
	await page
		.getByRole('navigation')
		.getByRole('link', { name: /^Privat/ })
		.click();
	await expect(page.getByRole('heading', { level: 1, name: 'Privat' })).toBeVisible();
});
