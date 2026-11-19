/**
 * KI-Funktionen im Browser – mit nachgebautem OpenRouter (keine echten Anfragen, keine Kosten).
 * Prüft nebenbei, dass jede Anfrage nur Daten des einen Pools enthält.
 */
import { expect, test, type Page, type Route } from '@playwright/test';
import { openPool, outline, quickAdd, rowByTitle } from './helpers';

/** Antworten je nach Art der Anfrage (erkannt am JSON-Schema-Namen bzw. am Text) */
function reply(body: {
	messages: { content: string }[];
	response_format?: { json_schema?: { name: string } };
}) {
	const schema = body.response_format?.json_schema?.name;
	const user = body.messages.at(-1)?.content ?? '';
	if (schema === 'pool') return { pool: 'Arbeit', reason: 'Kunde, also beruflich' };
	if (schema === 'tagesplan')
		return {
			summary: 'Erst das Angebot, dann der Rest.',
			items: [
				{ ref: 'a1', reason: 'Höchste Priorität', minutes: 90, priority: 3 },
				{ ref: 'a2', reason: 'Kurz zwischendurch', minutes: 17, priority: 2 }
			]
		};
	if (schema === 'aufgaben' && user.includes('Text:'))
		return {
			tasks: [
				{ title: 'Eiche und Buche vergleichen', priority: 1, due: '2026-11-20', children: [] },
				{ title: 'TÜV Transporter', priority: null, due: null, children: [] }
			]
		};
	if (schema === 'aufgaben')
		return {
			tasks: [
				{ title: 'Maße aufnehmen', children: [{ title: 'Wasseranschluss prüfen', children: [] }] },
				{ title: 'Material kalkulieren', children: [] },
				{ title: 'Unnötiger Vorschlag', children: [] }
			]
		};
	return '- Erst die Maße vor Ort nehmen.\n- Varianten anbieten.';
}

async function fakeOpenRouter(page: Page) {
	const sent: string[] = [];
	await page.route('https://openrouter.ai/api/v1/**', async (route: Route) => {
		const req = route.request();
		if (req.url().endsWith('/key'))
			return route.fulfill({ json: { data: { label: 'test', usage: 0.0123, limit: 5 } } });
		const body = req.postDataJSON();
		sent.push(JSON.stringify(body.messages));
		const r = reply(body);
		await route.fulfill({
			json: {
				model: body.model,
				choices: [{ message: { content: typeof r === 'string' ? r : JSON.stringify(r) } }],
				usage: { cost: 0.00009, prompt_tokens: 200, completion_tokens: 300 }
			}
		});
	});
	return sent;
}

async function setup(page: Page) {
	const sent = await fakeOpenRouter(page);
	await page.goto('/einstellungen#ki');
	const card = page.getByTestId('ai-settings');
	await card.getByLabel('API-Schlüssel').fill('sk-or-v1-nur-ein-test');
	await card.getByLabel('API-Schlüssel').press('Tab');
	await card.getByRole('button', { name: 'Prüfen' }).click();
	await expect(card.getByRole('status')).toContainText('Schlüssel gültig');

	// Privat: Daten, die nie in einer Anfrage für „Arbeit“ auftauchen dürfen
	await openPool(page, 'Privat');
	await quickAdd(page, 'GEHEIM Arzttermin');

	await openPool(page, 'Arbeit');
	await quickAdd(page, 'Angebot Küche Weber !1');
	await page.getByRole('button', { name: 'Pool bearbeiten' }).click();
	const poolAi = page.getByTestId('pool-ai');
	await poolAi.getByRole('switch').check();
	await poolAi.getByLabel('Kontext für die KI').fill('Ich bin Schreiner.');
	await poolAi.getByLabel('Kontext für die KI').press('Tab');
	return sent;
}

test('Aufgabe zerlegen: Vorschlag prüfen, abwählen, übernehmen, rückgängig', async ({ page }) => {
	const sent = await setup(page);
	await (
		await rowByTitle(page, 'Angebot Küche Weber')
	)
		.getByRole('button', { name: 'Details' })
		.click();
	await page.getByTestId('detail-ai').getByRole('button', { name: 'Zerlegen' }).click();

	const panel = page.getByTestId('ai-panel');
	await expect(panel.getByTestId('ai-tree')).toBeVisible();
	await expect(panel).toContainText('Cent · GLM 5.3 Flash');
	await panel.getByRole('checkbox', { name: 'Unnötiger Vorschlag' }).uncheck();
	await panel.getByRole('button', { name: '3 Aufgaben übernehmen' }).click();
	await expect(panel).toBeHidden();

	await expect
		.poll(() => outline(page))
		.toEqual([
			'0:Angebot Küche Weber',
			'1:Maße aufnehmen',
			'2:Wasseranschluss prüfen',
			'1:Material kalkulieren'
		]);

	// Die Anfrage enthielt den Pool-Kontext – und nichts aus „Privat“
	expect(sent.at(-1)).toContain('Ich bin Schreiner.');
	expect(sent.join()).not.toContain('GEHEIM');

	// Rückgängig
	await page.getByRole('button', { name: 'Rückgängig' }).click();
	await expect.poll(() => outline(page)).toEqual(['0:Angebot Küche Weber']);
});

test('Tipps in die Notizen übernehmen', async ({ page }) => {
	await setup(page);
	await (
		await rowByTitle(page, 'Angebot Küche Weber')
	)
		.getByRole('button', { name: 'Details' })
		.click();
	await page.getByTestId('detail-ai').getByRole('button', { name: 'Tipps' }).click();
	const panel = page.getByTestId('ai-panel');
	await expect(panel.getByTestId('ai-text')).toContainText('Varianten anbieten');
	await panel.getByRole('button', { name: 'In Notizen übernehmen' }).click();
	await expect(page.getByTestId('detail')).toContainText('Varianten anbieten');
});

test('Aus Text erstellen, Tagesplan, Kosten werden gezählt', async ({ page }) => {
	const sent = await setup(page);
	await page.getByRole('button', { name: 'KI' }).click();
	await page.getByRole('menuitem', { name: 'Aus Text erstellen' }).click();
	const panel = page.getByTestId('ai-panel');
	await panel
		.getByRole('textbox')
		.fill('Weber will bis Freitag wissen: Eiche oder Buche? Nächste Woche TÜV.');
	await panel.getByRole('button', { name: 'Los' }).click();
	await expect(panel.getByTestId('ai-tree')).toContainText('20.11.2026');
	await panel.getByRole('button', { name: '2 Aufgaben übernehmen' }).click();
	await rowByTitle(page, 'Eiche und Buche vergleichen');
	await rowByTitle(page, 'TÜV Transporter');
	expect(sent.at(-1)).toContain('Eiche oder Buche');

	await page.getByRole('button', { name: 'KI' }).click();
	await page.getByRole('menuitem', { name: 'Tagesplan' }).click();
	await expect(panel.getByTestId('ai-plan')).toContainText('Angebot Küche Weber');
	await expect(panel.getByTestId('ai-plan')).toContainText('Höchste Priorität');
	// Klick auf den Titel öffnet die Aufgabe
	await panel.getByRole('button', { name: 'Angebot Küche Weber' }).click();
	await expect(page.getByTestId('detail').getByRole('textbox', { name: 'Titel' })).toHaveValue(
		'Angebot Küche Weber'
	);
	expect(sent.join()).not.toContain('GEHEIM');

	await page.goto('/einstellungen#ki');
	await expect(page.getByTestId('ai-usage')).toContainText('2 Aufrufe');
});

test('Inbox aufräumen: KI schlägt einen Pool vor und sieht nur den Eintrag', async ({ page }) => {
	const sent = await setup(page);
	await page.goto('/inbox');
	await quickAdd(page, 'Kostenvoranschlag Schmidt nachfassen');
	await page.getByRole('button', { name: 'Inbox bearbeiten' }).click();
	await page.getByTestId('pool-ai').getByRole('switch').check();

	await page.getByRole('link', { name: 'Aufräumen' }).click();
	await page.getByRole('button', { name: 'Pool vorschlagen' }).click();
	await expect(page.getByTestId('ai-suggestion')).toContainText('KI-Vorschlag: Arbeit');
	await expect(page.locator('.tile.suggested')).toContainText('Arbeit');

	const request = sent.at(-1)!;
	expect(request).toContain('Kostenvoranschlag Schmidt nachfassen');
	expect(request).not.toContain('Angebot Küche Weber'); // keine Aufgaben aus Pools
	expect(request).not.toContain('Schreiner'); // keine Kontext-Notizen von Pools
});

test('ohne Freigabe im Pool gibt es keine KI-Knöpfe', async ({ page }) => {
	await fakeOpenRouter(page);
	await page.goto('/');
	await openPool(page, 'Privat');
	await quickAdd(page, 'Einkaufen');
	await (await rowByTitle(page, 'Einkaufen')).getByRole('button', { name: 'Details' }).click();
	await expect(page.getByTestId('detail-ai')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'KI', exact: true })).toHaveCount(0);
});

test('Tagesplan: anpassen und mit Uhrzeit, Dauer und Priorität einplanen, rückgängig', async ({
	page
}) => {
	await page.clock.setFixedTime(new Date(2026, 10, 20, 8, 52));
	await setup(page);
	await quickAdd(page, 'Rückruf Müller');
	await page.getByRole('button', { name: 'KI' }).click();
	await page.getByRole('menuitem', { name: 'Tagesplan' }).click();
	const panel = page.getByTestId('ai-panel');
	const rows = panel.getByTestId('plan-row');
	await expect(rows).toHaveCount(2);

	// Vorschläge: eigene Priorität (!1) bleibt, KI-Dauer gerundet (17 → 15 Min.)
	await expect(panel.getByLabel('Priorität: Angebot Küche Weber')).toHaveValue('1');
	await expect(panel.getByLabel('Dauer: Angebot Küche Weber')).toHaveValue('1:30');
	await expect(panel.getByLabel('Dauer: Rückruf Müller')).toHaveValue('0:15');
	await expect(panel.getByLabel('Beginn')).toHaveValue('09:00');
	await expect(rows.nth(0)).toContainText('09:00–10:30');
	await expect(rows.nth(1)).toContainText('10:30–10:45');

	// Anpassen: anderer Beginn, kürzere Dauer, andere Priorität
	await panel.getByLabel('Beginn').fill('13:00');
	await panel.getByLabel('Dauer: Angebot Küche Weber').fill('1h');
	await panel.getByLabel('Dauer: Angebot Küche Weber').blur();
	await expect(panel.getByLabel('Dauer: Angebot Küche Weber')).toHaveValue('1:00');
	await panel.getByLabel('Priorität: Rückruf Müller').selectOption('1');
	await expect(rows.nth(1)).toContainText('14:00–14:15');
	await expect(panel).toContainText('Zusammen 1:15, fertig etwa 14:15');

	await panel.getByRole('button', { name: '2 Aufgaben für heute einplanen' }).click();
	await expect(page.getByRole('status').filter({ hasText: 'eingeplant' })).toContainText(
		'2 Aufgaben für heute eingeplant'
	);

	const task = (title: string) =>
		page.evaluate(async (t) => {
			const req = indexedDB.open('tasks-app');
			await new Promise((r) => (req.onsuccess = r));
			const all: { title: string }[] = await new Promise((r) => {
				const g = req.result.transaction('tasks').objectStore('tasks').getAll();
				g.onsuccess = () => r(g.result);
			});
			req.result.close();
			return all.find((x) => x.title === t) as Record<string, unknown>;
		}, title);
	await expect
		.poll(async () => (await task('Angebot Küche Weber')).scheduled)
		.toEqual({
			date: '2026-11-20',
			time: '13:00'
		});
	expect((await task('Angebot Küche Weber')).estimateMin).toBe(60);
	expect(await task('Rückruf Müller')).toMatchObject({
		scheduled: { date: '2026-11-20', time: '14:00' },
		estimateMin: 15,
		priority: 1
	});

	await page.getByRole('button', { name: 'Rückgängig' }).click();
	await expect.poll(async () => (await task('Rückruf Müller')).scheduled).toBeUndefined();
	expect((await task('Rückruf Müller')).priority).toBe(null);
	expect((await task('Angebot Küche Weber')).estimateMin).toBeUndefined();
});
