import { expect, type Page } from '@playwright/test';

/** Öffnet einen Pool über die Seitenleiste. */
export async function openPool(page: Page, name: string) {
	await page
		.getByRole('navigation')
		.getByRole('link', { name: new RegExp(`^${name}`) })
		.click();
	await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

/** Gliederung der sichtbaren Zeilen eines Bereichs als „Ebene:Titel“. */
export async function outline(page: Page, scope = page.getByTestId('pool-section').first()) {
	return scope
		.getByTestId('task-row')
		.evaluateAll((rows) =>
			rows.map(
				(r) =>
					`${(r as HTMLElement).dataset.depth}:${(r.querySelector('input.title') as HTMLInputElement).value}`
			)
		);
}

/** Zeile anhand des Titels (Eingabefelder haben den Titel nur als Wert, nicht als Text). */
export async function rowByTitle(page: Page, title: string) {
	const rows = page.getByTestId('task-row');
	await expect
		.poll(() =>
			rows.evaluateAll(
				(els, t) =>
					els.some((r) => (r.querySelector('input.title') as HTMLInputElement).value === t),
				title
			)
		)
		.toBe(true);
	const idx = await rows.evaluateAll(
		(els, t) =>
			els.findIndex((r) => (r.querySelector('input.title') as HTMLInputElement).value === t),
		title
	);
	return rows.nth(idx);
}

export async function quickAdd(page: Page, text: string) {
	const input = page.getByTestId('quick-add');
	await input.fill(text);
	await input.press('Enter');
	await expect(input).toHaveValue('');
}
