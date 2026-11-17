import { expect, test, type Page } from '@playwright/test';
import { openPool, quickAdd, rowByTitle } from './helpers';

// Mittwoch, 18.11.2026, 10:00 – KW 47 (16.–22.11.)
test.beforeEach(async ({ page }) => {
	await page.clock.install({ time: new Date('2026-11-18T10:00:00') });
	await enableTimeTracking(page);
	await openPool(page, 'Arbeit');
	await quickAdd(page, 'Angebot schreiben');
	await quickAdd(page, 'Telefonat');
});

/** Zeiterfassungs-Modus in den Einstellungen einschalten (Standard: aus). */
async function enableTimeTracking(page: Page) {
	await page.goto('/einstellungen');
	await page.getByRole('switch', { name: /Zeiterfassungs-Modus/ }).check();
	await expect(page.getByRole('navigation').getByRole('link', { name: /Zeiten/ })).toBeVisible();
}

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
	await page
		.getByRole('navigation')
		.getByRole('link', { name: /Zeiten/ })
		.click();
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

	await page
		.getByRole('navigation')
		.getByRole('link', { name: /Zeiten/ })
		.click();
	await expect(page.getByRole('heading', { level: 1, name: 'Zeiten' })).toBeVisible();

	// Woche (Standard)
	await expect(page.getByTestId('period-label')).toHaveText('KW 47 · 16.11.–22.11.2026');
	await expect(page.getByTestId('report-total')).toHaveText('4:00');
	await expect(page.getByTestId('time-groups')).toContainText('Arbeit');
	const byTask = page.getByTestId('time-tasks').locator('.row');
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
	await page.getByTestId('day-row').first().getByRole('button', { name: 'Montag' }).click();
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

test('Modus ist standardmäßig aus und blendet alles aus; eigener Einstellungsbereich', async ({
	page
}) => {
	const nav = page.getByRole('navigation');
	const card = page.getByTestId('time-settings');

	// Eingeschaltet (beforeEach): Knöpfe da
	await openPool(page, 'Arbeit');
	await expect(page.getByTestId('timer-button')).toHaveCount(2);
	await expect(page.getByTestId('row-time')).toHaveCount(2);

	// Ausschalten: nichts mehr von der Zeiterfassung zu sehen
	await page.goto('/einstellungen');
	await card.getByRole('switch', { name: /Zeiterfassungs-Modus/ }).uncheck();
	await expect(card.getByText('Soll-Zeit je Wochentag')).toHaveCount(0);
	await expect(nav.getByRole('link', { name: /Zeiten/ })).toHaveCount(0);
	await openPool(page, 'Arbeit');
	await expect(page.getByTestId('timer-button')).toHaveCount(0);
	await expect(page.getByTestId('row-time')).toHaveCount(0);
	await (await rowByTitle(page, 'Telefonat')).getByRole('button', { name: 'Details' }).click();
	await expect(page.getByTestId('detail')).toBeVisible();
	await expect(page.getByTestId('time-section')).toHaveCount(0);
});

test('frische App: Zeiterfassung ist aus', async ({ browser }) => {
	const ctx = await browser.newContext();
	const fresh = await ctx.newPage();
	await fresh.goto('/inbox');
	await fresh.getByTestId('quick-add').fill('Neu');
	await fresh.getByTestId('quick-add').press('Enter');
	await expect(fresh.getByTestId('task-row')).toHaveCount(1);
	await expect(fresh.getByTestId('timer-button')).toHaveCount(0);
	await expect(fresh.getByRole('navigation').getByRole('link', { name: /Zeiten/ })).toHaveCount(0);
	await ctx.close();
});

test('Soll, gearbeitet und getrackt: sehen, was zugeordnet ist und was fehlt', async ({ page }) => {
	// Soll-Zeiten einstellen: Mittwoch 6:00, Freitag frei
	await page.goto('/einstellungen');
	const card = page.getByTestId('time-settings');
	await expect(card.getByTestId('week-target')).toContainText('40:00');
	const wed = card.getByRole('textbox', { name: 'Soll-Zeit je Wochentag Mi' });
	await wed.fill('6h');
	await wed.blur();
	await expect(wed).toHaveValue('6:00');
	const fri = card.getByRole('textbox', { name: 'Soll-Zeit je Wochentag Fr' });
	await fri.fill('0');
	await fri.blur();
	await expect(card.getByTestId('week-target')).toContainText('30:00');

	// Zeit tracken: heute (Mi) 2:00, Montag 5:00
	await openPool(page, 'Arbeit');
	await openDetail(page, 'Angebot schreiben');
	await logTime(page, '2h');
	await logTime(page, '5h', '2026-11-16');
	await page.keyboard.press('Escape');

	// Seitenleiste: heute getrackt / Soll
	await expect(page.getByTestId('today-time')).toHaveText('2:00 / 6:00');

	// Tagesansicht heute: Soll 6:00, getrackt 2:00, fehlt 4:00
	await page
		.getByRole('navigation')
		.getByRole('link', { name: /Zeiten/ })
		.click();
	await page.getByRole('radio', { name: 'Tag' }).click();
	await expect(page.getByTestId('stat-target')).toHaveText('6:00');
	await expect(page.getByTestId('report-total')).toHaveText('2:00');
	await expect(page.getByTestId('stat-missing')).toHaveText('4:00');
	await expect(page.getByText('Arbeitszeit nicht eingetragen')).toBeVisible();

	// Tatsächliche Arbeitszeit eintragen: 5:30 → 3:30 nicht zugeordnet, 0:30 fehlt aufs Soll
	const worked = page.getByRole('textbox', { name: /Gearbeitet am Mittwoch/ });
	await worked.fill('5,5h');
	await worked.blur();
	await expect(worked).toHaveValue('5:30');
	await expect(page.getByTestId('stat-unassigned')).toHaveText('3:30');
	await expect(page.getByTestId('stat-missing')).toHaveText('0:30');
	await expect(page.getByTestId('stat-saldo')).toHaveText('−0:30');

	// Wochenansicht: Montag in der Tabelle nachtragen
	await page.getByRole('radio', { name: 'Woche' }).click();
	const monday = page.getByTestId('day-row').first();
	await expect(monday).toContainText('8:00'); // Soll
	await expect(monday).toContainText('5:00'); // getrackt
	await monday.getByRole('textbox', { name: /Gearbeitet am Montag/ }).fill('8:30');
	await monday.getByRole('textbox', { name: /Gearbeitet am Montag/ }).blur();
	await expect(monday).toContainText('3:30'); // nicht zugeordnet

	// Woche gesamt: Soll 30:00; gearbeitet 8:30 + 5:30; getrackt 7:00; nicht zugeordnet 7:00
	await expect(page.getByTestId('stat-target')).toHaveText('30:00');
	await expect(page.getByTestId('stat-worked')).toHaveText('14:00');
	await expect(page.getByTestId('report-total')).toHaveText('7:00');
	await expect(page.getByTestId('stat-unassigned')).toHaveText('7:00');
	// Saldo bis heute: Mo +0:30, Di −8:00, Mi −0:30
	await expect(page.getByTestId('stat-saldo')).toHaveText('−8:00');
	// Künftige Tage lassen sich noch nicht eintragen
	await expect(
		page
			.getByTestId('day-row')
			.nth(3)
			.getByRole('textbox', { name: /Gearbeitet am Donnerstag/ })
	).toBeDisabled();

	// Eintrag bleibt nach dem Neuladen; leeren entfernt ihn
	await page.reload();
	const again = page
		.getByTestId('day-row')
		.first()
		.getByRole('textbox', { name: /Gearbeitet am Montag/ });
	await expect(again).toHaveValue('8:30');
	await again.fill('');
	await again.blur();
	await expect(page.getByTestId('stat-worked')).toHaveText('10:30');
});
