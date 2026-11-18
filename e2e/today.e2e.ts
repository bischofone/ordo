/**
 * Heute, „Was als Nächstes?“, Morgen-Ablauf und Wochenrückblick.
 * Fest eingestellte Zeit: Dienstag, 17.11.2026, 9:00.
 */
import { expect, test, type Page } from '@playwright/test';
import { openPool, quickAdd } from './helpers';

test.beforeEach(async ({ page }) => {
	// Am Samstag eine Aufgabe für Sonntag anlegen – am Dienstag ist sie dann überfällig
	await page.clock.install({ time: new Date('2026-11-14T09:00:00') });
	await page.goto('/');
	await openPool(page, 'Arbeit');
	await quickAdd(page, 'Rechnung prüfen morgen');
	await page.clock.setSystemTime(new Date('2026-11-17T09:00:00'));
	await page.reload();
	await openPool(page, 'Arbeit');
	await quickAdd(page, 'Angebot Weber morgen !1');
	await quickAdd(page, 'Ablage sortieren');
	await openPool(page, 'Privat');
	await quickAdd(page, 'Geschenk kaufen heute');
});

const rows = (page: Page, testid: string) =>
	page.getByTestId(testid).getByTestId('plan-row').locator('.title');

test('Heute: überfällig, heute fällig, einplanen, Zeitsumme, nicht heute', async ({ page }) => {
	await page
		.getByRole('navigation')
		.getByRole('link', { name: /^Heute/ })
		.click();
	await expect(page.getByRole('heading', { level: 1, name: 'Heute' })).toBeVisible();
	await expect(page.getByTestId('today-badge')).toHaveText('2');

	await expect(rows(page, 'today-overdue')).toHaveText(['Rechnung prüfen']);
	await expect(rows(page, 'today-list')).toHaveText(['Geschenk kaufen']);

	// „Was als Nächstes?“ – mit Begründung, ohne das, was oben schon steht
	const next = page.getByTestId('next-card');
	await expect(next.getByTestId('plan-row').first()).toContainText('Angebot Weber');
	await expect(next.getByTestId('plan-row').first()).toContainText('Priorität 1 · morgen fällig');
	await expect(next).not.toContainText('Geschenk kaufen');

	// Einplanen → wandert nach „Für heute“
	await next
		.getByTestId('plan-row')
		.filter({ hasText: 'Angebot Weber' })
		.getByRole('button', { name: 'Für heute' })
		.click();
	await expect(rows(page, 'today-list')).toHaveText(['Angebot Weber', 'Geschenk kaufen']);

	// Verfügbare Zeit für heute ändern
	const avail = page.getByTestId('capacity').getByLabel('Verfügbar heute');
	await avail.fill('2h');
	await avail.press('Enter');
	await expect(avail).toHaveValue('2:00');
	await expect(page.getByTestId('capacity')).toContainText('von 2:00 verfügbar');

	// Nicht heute → wieder raus
	await page
		.getByTestId('today-list')
		.getByTestId('plan-row')
		.filter({ hasText: 'Angebot Weber' })
		.getByRole('button', { name: 'Nicht heute' })
		.click();
	await expect(rows(page, 'today-list')).toHaveText(['Geschenk kaufen']);
});

test('Was als Nächstes: Zeit und Energie wählen', async ({ page }) => {
	await page.goto('/heute');
	const next = page.getByTestId('next-card');
	const first = next.getByTestId('plan-row').first();
	await next.getByRole('radio', { name: '15 min' }).click();
	// Aufgaben ohne Schätzung bleiben dabei (sie könnten ja passen)
	await expect(first).toContainText('Angebot Weber');
	await next.getByRole('radio', { name: 'beliebig' }).click();
	await next.getByRole('radio', { name: 'niedrig' }).click();
	await expect(first).toContainText('Angebot Weber');
	await expect(next.getByRole('radio', { name: 'niedrig' })).toHaveAttribute(
		'aria-checked',
		'true'
	);
});

test('Gewichtung „aus“ in den Einstellungen wirkt sofort', async ({ page }) => {
	await page.goto('/einstellungen#planung');
	const card = page.getByTestId('planning-settings');
	await card
		.getByRole('radiogroup', { name: 'Priorität' })
		.getByRole('radio', { name: 'aus' })
		.click();
	await page.goto('/heute');
	await expect(page.getByTestId('next-card').getByTestId('plan-row').first()).toContainText(
		'morgen fällig'
	);
	await expect(page.getByTestId('next-card')).not.toContainText('Priorität 1');
});

test('Morgen-Ablauf: überfällig einplanen, Inbox, auswählen, fertig', async ({ page }) => {
	await page.goto('/inbox');
	await quickAdd(page, 'Zahnarzt anrufen');
	await page.goto('/heute');
	await expect(page.getByTestId('plan-banner')).toBeVisible();
	await page.getByTestId('plan-banner').getByRole('link', { name: 'Tag planen' }).click();

	// 1. Überfällig
	const s0 = page.getByTestId('plan-step-0');
	await expect(s0).toContainText('Rechnung prüfen');
	await s0.getByRole('button', { name: 'Heute', exact: true }).click();
	await expect(s0).toContainText('eingeplant');
	await page.getByRole('button', { name: 'Weiter' }).click();

	// 2. Inbox → Aufräumen und zurück
	await expect(page.getByTestId('plan-step-1')).toContainText('1 Eintrag wartet in der Inbox.');
	await page.getByRole('link', { name: 'Jetzt aufräumen' }).click();
	await page.getByRole('button', { name: /Privat/ }).click();
	await page.getByRole('link', { name: 'Weiter' }).click();
	await expect(page.getByTestId('plan-step-2')).toBeVisible();

	// 3. Auswählen
	const s2 = page.getByTestId('plan-step-2');
	await s2.getByRole('checkbox', { name: /Angebot Weber/ }).check();
	await expect(page.getByTestId('plan-sum')).toBeVisible();
	await page.getByRole('button', { name: 'Weiter' }).click();

	// 4. Fertig – geplante + eingeplantes Überfälliges zählen
	await expect(page.getByTestId('plan-step-3')).toContainText('3 Aufgaben');
	await page.getByRole('link', { name: 'Zu „Heute“' }).click();
	await expect(page.getByTestId('plan-banner')).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'Neu planen' })).toBeVisible();
	await expect(rows(page, 'today-list')).toContainText(['Angebot Weber']);
});

test('Wochenrückblick: erledigt und verschoben je Pool', async ({ page }) => {
	await page.goto('/heute');
	await page
		.getByTestId('today-list')
		.getByTestId('plan-row')
		.filter({ hasText: 'Geschenk kaufen' })
		.getByRole('checkbox')
		.click();
	await page.getByRole('link', { name: 'Wochenrückblick' }).click();
	const privat = page.getByTestId('review-pool').filter({ hasText: 'Privat' });
	await expect(privat).toContainText('Geschenk kaufen');
	await expect(privat.locator('.stat').first()).toContainText('1');
});
