/**
 * Neue Version auf dem Server: Die App zeigt einen Hinweis und lädt auf Wunsch neu.
 * Der Server wird dafür nachgestellt – _app/version.json meldet eine andere Version.
 */
import { expect, test } from '@playwright/test';

// Sonst holt der Service Worker version.json am Test vorbei
test.use({ serviceWorkers: 'block' });

test('Version steht in den Einstellungen, „Suchen“ meldet: aktuell', async ({ page }) => {
	await page.goto('/einstellungen#sync');
	const v = page.getByTestId('app-version');
	await expect(v).toContainText(/Ordo \d+\.\d+\.\d+/);
	await v.getByRole('button', { name: 'Nach neuer Version suchen' }).click();
	await expect(v).toContainText('Ordo ist aktuell.');
	await expect(page.getByTestId('update-banner')).toHaveCount(0);
});

test('Neue Version: Hinweis erscheint, „Neu laden“ lädt die Seite neu', async ({ page }) => {
	await page.goto('/einstellungen#sync');
	await expect(page.getByTestId('app-version')).toBeVisible();
	await page.route('**/_app/version.json', (route) =>
		route.fulfill({ json: { version: '99.0.0-neu' } })
	);
	await page.getByRole('button', { name: 'Nach neuer Version suchen' }).click();

	const banner = page.getByTestId('update-banner');
	await expect(banner).toContainText('Neue Version von Ordo ist da');

	// „Später“ blendet ihn aus
	await banner.getByRole('button', { name: 'Später' }).click();
	await expect(banner).toHaveCount(0);

	// Nächster Seitenwechsel lädt vollständig neu (statt alte und neue Dateien zu mischen)
	await page.evaluate(() => ((window as unknown as { marker: number }).marker = 1));
	await page.getByRole('link', { name: 'Inbox' }).first().click();
	await expect(page).toHaveURL(/\/inbox/);
	expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(
		undefined
	);
});
