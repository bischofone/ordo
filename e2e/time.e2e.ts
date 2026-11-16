import { expect, test, type Page } from '@playwright/test';
import { openPool, quickAdd, rowByTitle } from './helpers';

// Mittwoch, 18.11.2026, 10:00 – KW 47 (16.–22.11.)
test.beforeEach(async ({ page }) => {
	await page.clock.install({ time: new Date('2026-11-18T10:00:00') });
	await page.goto('/');
	await openPool(page, 'Arbeit');
	await quickAdd(page, 'Angebot schreiben');
	await quickAdd(page, 'Telefonat');
});

const play = async (page: Page, title: string) =>
	(await rowByTitle(page, title)).getByTestId('timer-button');

async function openDetail(page: Page, title: string) {
	await (await rowByTitle(page, title)).getByRole('button', { name: 'Details' }).click();
	return page.getByTestId('time-section');
}

async function logTime(page: Page, duration: string, date?: string) {
	const section = page.getByTestId('time-section');
	await section.getByRole('textbox', { name: 'Dauer' }).first().fill(duration);
	if (date) await section.getByLabel('Datum').first().fill(date);
	await section.getByRole('button', { name: 'Erfassen' }).click();
}

test('Timer: Play/Stop in der Zeile, oben sichtbar, nur einer läuft, übersteht Neuladen', async ({
	page
}) => {
	const bar = page.getByTestId('timer-bar');
	await (await play(page, 'Angebot schreiben')).click();
	await expect(bar).toContainText('Angebot schreiben');
	await expect(await play(page, 'Angebot schreiben')).toHaveAttribute('aria-pressed', 'true');

	// 20 Minuten später: Anzeige zählt mit, auch nach dem Neuladen
	await page.clock.fastForward('20:00');
	await expect(page.getByTestId('timer-elapsed')).toHaveText('0:20:00');
	await page.reload();
	await expect(bar).toContainText('Angebot schreiben');
	await page.clock.fastForward('05:00');
	await expect(page.getByTestId('timer-elapsed')).toHaveText('0:25:00');

	// Wechsel auf eine andere Aufgabe stoppt die erste und erfasst sie
	await (await play(page, 'Telefonat')).click();
	await expect(bar).toContainText('Telefonat');
	await expect((await rowByTitle(page, 'Angebot schreiben')).getByTestId('row-time')).toHaveValue(
		'0:25'
	);
	await expect(page.getByRole('button', { name: 'Timer stoppen' })).toHaveCount(2); // Zeile + Leiste

	// Stoppen über die Leiste
	await page.clock.fastForward('10:00');
	await bar.getByRole('button', { name: 'Timer stoppen' }).click();
	await expect(page.getByRole('status').filter({ hasText: 'erfasst' })).toContainText(
		'0:10 erfasst'
	);
	await expect(bar).toHaveCount(0);
	await expect((await rowByTitle(page, 'Telefonat')).getByTestId('row-time')).toHaveValue('0:10');

	// Versehentlicher Klick (unter 30 Sekunden) wird nicht erfasst
	await (await play(page, 'Telefonat')).click();
	await page.clock.fastForward('00:10');
	await (await play(page, 'Telefonat')).click();
	await expect(page.getByText('Unter 30 Sekunden – nicht erfasst')).toBeVisible();
	await expect((await rowByTitle(page, 'Telefonat')).getByTestId('row-time')).toHaveValue('0:10');
});

test('Zeit von Hand erfassen: Formate, Datum, ändern, löschen', async ({ page }) => {
	const section = await openDetail(page, 'Angebot schreiben');
	const input = section.getByRole('textbox', { name: 'Dauer' }).first();
	const add = section.getByRole('button', { name: 'Erfassen' });

	// Live-Anzeige, was verstanden wurde
	await input.fill('0,5h');
	await expect(section).toContainText('= 0:30 Std.');
	await input.fill('quatsch');
	await expect(section).toContainText('Zeitangabe nicht verstanden');
	await expect(add).toBeDisabled();

	// Standard: heute. Zweiter Eintrag rückwirkend für Montag.
	await logTime(page, '0,5h');
	await logTime(page, '1:15', '2026-11-16');
	await logTime(page, '45min');
	await expect(section.getByTestId('time-total')).toContainText('2:30');
	const entries = section.getByTestId('time-entry');
	await expect(entries).toHaveCount(3);
	await expect(entries.last().getByLabel('Datum')).toHaveValue('2026-11-16');
	await expect(entries.first().getByLabel('Datum')).toHaveValue('2026-11-18');

	// Eintrag ändern (anderes Format) und löschen
	const monday = entries.last().getByRole('textbox', { name: 'Dauer' });
	await monday.fill('2h');
	await monday.blur();
	await expect(monday).toHaveValue('2:00');
	await expect(section.getByTestId('time-total')).toContainText('3:15');
	await entries.first().getByRole('button', { name: 'Eintrag löschen' }).click();
	await expect(entries).toHaveCount(2);

	// Bleibt gespeichert und steht in der Zeile
	await page.reload();
	await expect((await rowByTitle(page, 'Angebot schreiben')).getByTestId('row-time')).toHaveValue(
		/2:30|2:45/
	);
});

test('Zeit direkt in der Liste sehen, eintippen und überschreiben', async ({ page }) => {
	const row = await rowByTitle(page, 'Angebot schreiben');
	const field = row.getByRole('textbox', { name: 'Erfasste Zeit' });
	const detail = page.getByTestId('detail');

	// Leer: Platzhalter 0:00. Eintippen in beliebigem Format, Enter übernimmt.
	await expect(field).toHaveValue('');
	await expect(field).toHaveAttribute('placeholder', '0:00');
	await field.click();
	await expect(detail).toHaveCount(0); // Klick ins Zeitfeld öffnet nicht die Details
	await field.fill('0,5h');
	await field.press('Enter');
	await expect(field).toHaveValue('0:30');
	await expect(field).not.toBeFocused();

	// Überschreiben, dazuzählen, abziehen
	await field.fill('1:30');
	await field.press('Enter');
	await expect(field).toHaveValue('1:30');
	await field.fill('+15');
	await field.press('Tab');
	await expect(field).toHaveValue('1:45');
	await field.fill('-0:45');
	await field.press('Enter');
	await expect(field).toHaveValue('1:00');

	// Unverständliches und Escape ändern nichts
	await field.fill('quatsch');
	await field.press('Enter');
	await expect(field).toHaveValue('1:00');
	await field.fill('9:99');
	await field.press('Escape');
	await expect(field).toHaveValue('1:00');

	// Die Zeit zählt für heute und steht genauso in den Details und in der Auswertung
	await row.getByRole('button', { name: 'Details' }).click();
	const entries = page.getByTestId('time-entry');
	await expect(entries).toHaveCount(1);
	await expect(entries.getByLabel('Datum')).toHaveValue('2026-11-18');
	await expect(page.getByTestId('time-total')).toContainText('1:00');
	await page.keyboard.press('Escape');

	// Unteraufgabe mit eigener Zeit → Summe am Elternteil
	await row.hover();
	await row.getByRole('button', { name: 'Unteraufgabe hinzufügen' }).click();
	await page.keyboard.type('Kalkulation');
	const child = await rowByTitle(page, 'Kalkulation');
	await child.getByRole('textbox', { name: 'Erfasste Zeit' }).fill('20');
	await child.getByRole('textbox', { name: 'Erfasste Zeit' }).press('Enter');
	await expect(row.getByTestId('row-sum')).toHaveText('Σ 1:20');
	await expect(field).toHaveValue('1:00');

	// Leeren löscht die Zeit; bleibt nach dem Neuladen
	await field.fill('');
	await field.press('Enter');
	await expect(field).toHaveValue('');
	await page.reload();
	await expect(
		(await rowByTitle(page, 'Kalkulation')).getByRole('textbox', { name: 'Erfasste Zeit' })
	).toHaveValue('0:20');
	await page.getByRole('navigation').getByRole('link', { name: 'Zeiten' }).click();
	await expect(page.getByTestId('report-total')).toHaveText('0:20');
});

test('Auswertung: Woche, Tag, zurückblättern, nach Pool und Aufgabe', async ({ page }) => {
	await openDetail(page, 'Angebot schreiben');
	await logTime(page, '2h'); // Mittwoch
	await logTime(page, '1:30', '2026-11-16'); // Montag
	await logTime(page, '0:45', '2026-11-10'); // Vorwoche
	await page.keyboard.press('Escape');
	await openDetail(page, 'Telefonat');
	await logTime(page, '30');
	await page.keyboard.press('Escape');

	await page.getByRole('navigation').getByRole('link', { name: 'Zeiten' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Zeiten' })).toBeVisible();

	// Woche (Standard)
	await expect(page.getByTestId('period-label')).toHaveText('KW 47 · 16.11.–22.11.2026');
	await expect(page.getByTestId('report-total')).toHaveText('4:00');
	await expect(page.getByTestId('time-groups')).toContainText('Arbeit');
	const byTask = page.getByTestId('time-tasks').locator('.line');
	await expect(byTask.first()).toContainText('Angebot schreiben');
	await expect(byTask.first()).toContainText('3:30');
	await expect(byTask.nth(1)).toContainText('Telefonat');
	await expect(page.getByTestId('report-entry')).toHaveCount(3);

	// Vorwoche
	await page.getByRole('button', { name: 'Zurück' }).click();
	await expect(page.getByTestId('period-label')).toHaveText('KW 46 · 9.11.–15.11.2026');
	await expect(page.getByTestId('report-total')).toHaveText('0:45');
	await page.getByRole('button', { name: 'Heute' }).click();

	// Klick auf den Montagsbalken → Tagesansicht
	await page.getByRole('button', { name: /Montag, 16\. November: 1:30/ }).click();
	await expect(page.getByTestId('period-label')).toHaveText('Montag, 16. November 2026');
	await expect(page.getByTestId('report-total')).toHaveText('1:30');

	// Monat: alles zusammen; Eintrag direkt in der Auswertung ändern
	await page.getByRole('radio', { name: 'Monat' }).click();
	await expect(page.getByTestId('period-label')).toHaveText('November 2026');
	await expect(page.getByTestId('report-total')).toHaveText('4:45');
	const entry = page.getByTestId('report-entry').filter({ hasText: 'Telefonat' });
	await entry.getByRole('textbox', { name: 'Dauer' }).fill('1h');
	await entry.getByRole('textbox', { name: 'Dauer' }).blur();
	await expect(page.getByTestId('report-total')).toHaveText('5:15');

	// Leerer Zeitraum
	await page.getByRole('button', { name: 'Zurück' }).click();
	await expect(page.getByText('In diesem Zeitraum wurde keine Zeit erfasst.')).toBeVisible();
});

test('Zeiterfassung lässt sich ausblenden', async ({ page }) => {
	await expect(page.getByTestId('timer-button')).toHaveCount(2);
	await page.goto('/einstellungen');
	await page.getByRole('switch', { name: /Zeiterfassung/ }).uncheck();
	await expect(page.getByRole('navigation').getByRole('link', { name: 'Zeiten' })).toHaveCount(0);
	await openPool(page, 'Arbeit');
	await expect(page.getByTestId('timer-button')).toHaveCount(0);
	await (await rowByTitle(page, 'Telefonat')).getByRole('button', { name: 'Details' }).click();
	await expect(page.getByTestId('detail')).toBeVisible();
	await expect(page.getByTestId('time-section')).toHaveCount(0);
});
