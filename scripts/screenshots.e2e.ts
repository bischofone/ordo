/**
 * Erzeugt die Screenshots für README und Doku (docs/screenshots/).
 * Läuft NICHT mit den normalen Tests, sondern gezielt:
 *
 *   pnpm screenshots
 *
 * Legt in einer frischen App Beispieldaten über die Oberfläche an und fotografiert dann
 * die wichtigsten Ansichten (dunkles Farbschema, PC und Handy).
 */
import { expect, test, type Page } from '@playwright/test';
import { openPool as openPoolDesktop, quickAdd, rowByTitle } from '../e2e/helpers';

const OUT = 'docs/screenshots';

async function dark(page: Page) {
	await page.goto('/einstellungen#darstellung');
	await page
		.getByRole('radiogroup', { name: 'Farbschema' })
		.getByRole('radio', { name: 'Dunkel' })
		.click();
}

/** Pool öffnen – am Handy erst das Menü aufklappen. */
async function openPool(page: Page, name: string) {
	if (test.info().project.name === 'mobile') {
		await page.getByRole('button', { name: 'Menü' }).click();
		await page.waitForTimeout(400); // Menü fährt ein
	}
	await openPoolDesktop(page, name);
}

/** Schnelleingabe und warten, bis die Zeile da ist (sonst überholt das Skript die App). */
async function add(page: Page, text: string) {
	await quickAdd(page, text);
	await rowByTitle(page, text.replace(/ (morgen|Freitag|9:00|!\d|#\w+)/g, ''));
}

async function project(page: Page, name: string, tasks: string[]) {
	await page.getByRole('button', { name: 'Neues Projekt' }).click();
	await page.getByRole('textbox', { name: 'Name des neuen Projekts' }).fill(name);
	await page.keyboard.press('Enter');
	await expect(page.getByRole('navigation').getByRole('link', { name })).toBeVisible();
	const group = page.getByTestId('project-group').filter({ hasText: name });
	await group.getByRole('button', { name: 'Aufgabe hinzufügen', exact: true }).click();
	for (const [i, t] of tasks.entries()) {
		await page.keyboard.type(t);
		if (i < tasks.length - 1) await page.keyboard.press('Enter');
	}
	await page.keyboard.press('Escape');
	await rowByTitle(page, tasks.at(-1)!);
}

async function seed(page: Page) {
	await dark(page);
	await page.goto('/einstellungen#zeit');
	await page.getByRole('switch', { name: /Zeiterfassungs-Modus/ }).check();
	await page.waitForTimeout(500); // Einstellung landet in IndexedDB

	await page.goto('/');
	await openPool(page, 'Arbeit');
	await add(page, 'Angebot für Kunde Weber schreiben morgen !1 #arbeit');
	await add(page, 'Rechnungen Oktober prüfen #arbeit');
	await add(page, 'Team-Meeting vorbereiten Freitag 9:00 #arbeit');
	await project(page, 'Website-Relaunch', ['Texte für Startseite', 'Bilder auswählen']);

	await openPool(page, 'Privat');
	await add(page, 'Steuererklärung abgeben !2 #privat');
	await add(page, 'Geburtstagsgeschenk für Lena #privat');
	await project(page, 'Umzug', ['Kartons besorgen', 'Umzugswagen reservieren', 'Nachsendeauftrag']);

	// Zeiten direkt in der Liste eintragen (das Zeitfeld gibt es nur in der breiten Ansicht)
	if (test.info().project.name !== 'mobile') await addTimes(page);

	// Inbox
	await page.goto('/inbox');
	for (const t of ['Zahnarzt anrufen', 'Idee: Newsletter starten', 'Reifenwechsel buchen'])
		await add(page, t);
}

async function addTimes(page: Page) {
	await openPool(page, 'Arbeit');
	for (const [title, time] of [
		['Angebot für Kunde Weber schreiben', '1:30'],
		['Rechnungen Oktober prüfen', '0:45'],
		['Texte für Startseite', '2:15']
	]) {
		const field = (await rowByTitle(page, title)).getByRole('textbox', { name: 'Erfasste Zeit' });
		await field.fill(time);
		await field.press('Enter');
		await expect(field).toHaveValue(time);
	}
}

test('Screenshots', async ({ page, browserName }, info) => {
	test.skip(browserName !== 'chromium');
	test.setTimeout(120_000);
	await seed(page);
	const mobile = info.project.name === 'mobile';
	const shot = (name: string) =>
		page.screenshot({ path: `${OUT}/${name}${mobile ? '-handy' : ''}.png` });

	await page.goto('/');
	await expect(page.getByText('Website-Relaunch').first()).toBeVisible();
	await shot('alle-pools');

	await page.goto('/inbox/aufraeumen');
	await expect(page.getByTestId('triage-card').first()).toBeVisible();
	await shot('aufraeumen');

	// Heute: zwei Vorschläge einplanen
	await page.goto('/heute');
	const next = page.getByTestId('next-card');
	for (let i = 0; i < 2; i++) await next.getByRole('button', { name: 'Für heute' }).first().click();
	await expect(page.getByTestId('today-list').getByTestId('plan-row')).toHaveCount(2);
	await shot('heute');

	if (!mobile) {
		await page.goto('/zeiten');
		await expect(page.getByTestId('time-tasks')).toBeVisible();
		await shot('zeiten');

		await page.goto('/einstellungen#inbox');
		await expect(page.getByTestId('triage-settings')).toBeVisible();
		await shot('einstellungen');

		await openPool(page, 'Arbeit');
		await page.getByTestId('quick-add').fill('Kunde zurückrufen morgen 14:00 !1 #arbeit');
		await shot('schnelleingabe');
		await page.getByTestId('quick-add').fill('');

		await aiShots(page, shot);
	}
});

/** KI: Einstellungen und das Vorschlagsfenster – mit nachgebautem OpenRouter (keine Kosten) */
async function aiShots(page: Page, shot: (name: string) => Promise<unknown>) {
	const breakdown = {
		tasks: [
			{
				title: 'Maße vor Ort aufnehmen',
				children: [
					{ title: 'Anschlüsse für Wasser und Strom prüfen', children: [] },
					{ title: 'Raumaufmaß dokumentieren', children: [] }
				]
			},
			{ title: 'Wünsche und Budget mit Kunde Weber klären', children: [] },
			{ title: 'Material und Beschläge einpreisen', children: [] },
			{ title: 'Arbeitszeit inkl. Montage kalkulieren', children: [] },
			{ title: 'Angebot schreiben und senden', children: [] }
		]
	};
	await page.route('https://openrouter.ai/api/v1/**', (route) =>
		route.request().url().endsWith('/key')
			? route.fulfill({ json: { data: { usage: 0.0021, limit: 5 } } })
			: route.fulfill({
					json: {
						model: 'z-ai/glm-5.3-flash',
						choices: [{ message: { content: JSON.stringify(breakdown) } }],
						usage: { cost: 0.000088 }
					}
				})
	);
	await page.goto('/einstellungen#ki');
	const card = page.getByTestId('ai-settings');
	await card.getByLabel('API-Schlüssel').fill('sk-or-v1-0000000000000000000000000000');
	await card.getByLabel('API-Schlüssel').press('Tab');
	await card.getByRole('button', { name: 'Prüfen' }).click();
	await expect(card.getByRole('status')).toBeVisible();
	await shot('einstellungen-ki');

	await openPool(page, 'Arbeit');
	await page.getByRole('button', { name: 'Pool bearbeiten' }).click();
	await page.getByTestId('pool-ai').getByRole('switch').check();
	await page.getByRole('button', { name: 'Pool bearbeiten' }).click();
	await (
		await rowByTitle(page, 'Angebot für Kunde Weber schreiben')
	)
		.getByRole('button', { name: 'Details' })
		.click();
	await page.getByTestId('detail-ai').getByRole('button', { name: 'Zerlegen' }).click();
	await expect(page.getByTestId('ai-tree')).toBeVisible();
	await page
		.getByTestId('ai-panel')
		.getByRole('checkbox', { name: 'Arbeitszeit inkl. Montage kalkulieren' })
		.uncheck();
	await shot('ki-zerlegen');
}
