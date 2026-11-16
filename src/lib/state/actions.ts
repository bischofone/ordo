/**
 * Aufgaben-Aktionen mit Rückfragen und „Rückgängig“.
 * Die eigentliche Datenänderung passiert im Repository, hier kommt nur die Nutzerführung dazu.
 */
import { formatDateValue } from '#lib/domain/dates.ts';
import { isOpen, type Pool, type Task } from '#lib/domain/types.ts';
import { errorText } from '#lib/sync/engine.ts';
import { m } from '#lib/i18n/index.ts';
import { db, repo } from './app';
import { sync } from './sync.svelte';
import { ask, beginKeyBuffer, requestFocus, toast, ui } from './ui.svelte';

export async function toggleDone(task: Task) {
	if (!isOpen(task)) return repo.setDone(task.id, false);
	const open = await repo.openDescendants(task.id);
	let withChildren = false;
	if (open.length) {
		const choice = await ask({
			title: m.confirm.openChildrenTitle,
			message: m.confirm.openChildrenText(open.length),
			actions: [
				{ id: 'all', label: m.confirm.completeAll, variant: 'primary' },
				{ id: 'only', label: m.confirm.completeOnly }
			]
		});
		if (!choice) return;
		withChildren = choice === 'all';
	}
	await repo.setDone(task.id, true, { withChildren });
}

export async function deleteTask(task: Task, hasChildren: boolean) {
	let withChildren = false;
	if (hasChildren) {
		const choice = await ask({
			title: m.confirm.deleteTitle,
			message: m.confirm.deleteText,
			actions: [
				{ id: 'all', label: m.confirm.deleteAll, variant: 'danger' },
				{ id: 'only', label: m.confirm.deleteOnly }
			]
		});
		if (!choice) return;
		withChildren = choice === 'all';
	}
	if (ui.detailId === task.id) ui.detailId = null;
	const ids = await repo.deleteTask(task.id, { withChildren });
	toast(m.confirm.deleted, { label: m.confirm.undo, run: () => repo.restoreTasks(ids) });
}

export async function postpone(task: Task, date: string, hasChildren: boolean) {
	ui.postponeId = null;
	const result = await repo.postpone(task.id, date);
	if (result === 'ok') {
		toast(m.postpone.movedTo(formatDateValue({ date }, ui.now)));
		return;
	}
	const choice = await ask({
		title: m.postpone.reviewTitle,
		message: m.postpone.reviewText(task.title, task.postponeCount),
		actions: [
			{ id: 'split', label: m.postpone.split, variant: 'primary' },
			{ id: 'someday', label: m.postpone.someday },
			{ id: 'delete', label: m.postpone.delete, variant: 'danger' },
			{ id: 'anyway', label: m.postpone.anyway }
		]
	});
	switch (choice) {
		case 'split': {
			// In kleinere Schritte zerlegen: erste Unteraufgabe anlegen und direkt tippen.
			beginKeyBuffer();
			await repo.updateTask(task.id, { collapsed: false });
			const id = await repo.createTask({ poolId: task.poolId, parentId: task.id, title: '' });
			requestFocus(id);
			break;
		}
		case 'someday':
			await repo.updateTask(task.id, { someday: true, scheduled: undefined });
			break;
		case 'delete':
			await deleteTask(task, hasChildren);
			break;
		case 'anyway':
			await repo.postpone(task.id, date, { force: true });
			toast(m.postpone.movedTo(formatDateValue({ date }, ui.now)));
			break;
	}
}

/**
 * Pool endgültig löschen (nach Rückfrage). Bei synchronisierten Pools wählt der Nutzer,
 * ob die Liste auf dem Server bleibt. Liefert true, wenn gelöscht wurde.
 */
export async function deletePool(pool: Pool): Promise<boolean> {
	const tasks = await db.tasks
		.where('poolId')
		.equals(pool.id)
		.filter((t) => !t.deletedAt)
		.count();
	const projects = await db.projects
		.where('poolId')
		.equals(pool.id)
		.filter((p) => !p.deletedAt)
		.count();
	const account = pool.caldav ? await db.accounts.get(pool.caldav.accountId) : undefined;
	const choice = await ask({
		title: m.pool.deleteTitle(pool.name),
		message:
			m.pool.deleteText(tasks, projects) + (account ? m.pool.deleteSyncedText(account.name) : ''),
		actions: account
			? [
					{ id: 'local', label: m.pool.deleteLocal, variant: 'danger' },
					{ id: 'everywhere', label: m.pool.deleteEverywhere, variant: 'danger' }
				]
			: [{ id: 'local', label: m.pool.delete, variant: 'danger' }]
	});
	if (!choice) return false;
	try {
		// Erst die Verbindung lösen bzw. die Liste entfernen – sonst würde der Sync die
		// Aufgaben einzeln vom Server löschen.
		if (choice === 'everywhere') await sync.deleteRemoteList(pool.id);
		else await sync.unbindPool(pool.id);
	} catch (e) {
		toast(errorText(e));
		return false;
	}
	await repo.deletePool(pool.id);
	toast(m.pool.deleted(pool.name));
	return true;
}
