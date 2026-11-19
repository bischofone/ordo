/**
 * Update mit vorhandenen Daten: Im Browser liegt eine Datenbank einer FRÜHEREN Ordo-Version
 * (echte Daten aus src/lib/db/fixtures). Die aktuelle App öffnet sie, übernimmt alles und
 * zeigt es richtig an – Pools, Unteraufgaben, Inbox, Heute, Einstellungen.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { openPool, outline } from './helpers';

interface Fixture {
	commit: string;
	verno: number;
	tables: Record<string, { schema: string; rows: unknown[] }>;
}
const DIR = 'src/lib/db/fixtures';
const fixtures = readdirSync(DIR)
	.filter((f) => /^v\d+\.json$/.test(f))
	.map((f) => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8')) as Fixture)
	.sort((a, b) => a.verno - b.verno);

test.use({ serviceWorkers: 'block' });

/** Legt die alte Datenbank mit der rohen IndexedDB-API an – so wie Dexie sie damals schrieb. */
async function seed(page: Page, fx: Fixture) {
	await page.goto('/manifest.webmanifest'); // gleiche Herkunft, ohne dass die App startet
	await page.evaluate(async (fx) => {
		await new Promise<void>((resolve, reject) => {
			// Dexie speichert Version n als IndexedDB-Version n × 10
			const req = indexedDB.open('tasks-app', fx.verno * 10);
			req.onupgradeneeded = () => {
				const idb = req.result;
				for (const [name, { schema }] of Object.entries(fx.tables)) {
					const [pk, ...idx] = schema.split(',').map((s) => s.trim());
					const store = idb.createObjectStore(name, { keyPath: pk });
					for (const i of idx) store.createIndex(i, i);
				}
			};
			req.onsuccess = () => {
				const idb = req.result;
				const tx = idb.transaction(Object.keys(fx.tables), 'readwrite');
				for (const [name, { rows }] of Object.entries(fx.tables))
					for (const r of rows) tx.objectStore(name).add(r);
				tx.oncomplete = () => (idb.close(), resolve());
				tx.onerror = () => reject(tx.error);
			};
			req.onerror = () => reject(req.error);
		});
	}, fx);
}

for (const fx of fixtures) {
	test(`Daten aus Version v${fx.verno} (${fx.commit}) erscheinen richtig`, async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await seed(page, fx);
		await page.goto('/');

		// Pools aus der alten Datenbank, keine doppelten Standard-Pools
		const nav = page.getByRole('navigation');
		await expect(nav.getByRole('link', { name: /^Kunden/ })).toBeVisible();
		await expect(nav.getByRole('link', { name: /^Arbeit/ })).toHaveCount(1);

		// Unteraufgaben in der richtigen Ordnung
		await openPool(page, 'Arbeit');
		const tree = (await outline(page)).join('|');
		expect(tree).toContain('0:Angebot schreiben|1:Preise prüfen|2:Feinschliff|1:Text formulieren');

		// Inbox
		await page.goto('/inbox');
		await expect(page.locator('input.title').first()).toHaveValue('Idee: Podcast hören');

		// Heute: die am 15.10. geplante Aufgabe ist überfällig und steht dort
		await page.goto('/heute');
		await expect(page.getByText('Angebot schreiben').first()).toBeVisible();

		// Einstellungen der alten Version gelten weiter
		await page.goto('/einstellungen#inbox');
		await expect(page.getByLabel('Einträge markieren nach (Tagen)')).toHaveValue('5');
		if (fx.tables.accounts) {
			await page.goto('/einstellungen#sync');
			await expect(page.getByTestId('account')).toContainText('Mein Server');
		}
		expect(errors).toEqual([]);
	});
}
