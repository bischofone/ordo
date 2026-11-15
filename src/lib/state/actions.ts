/**
 * Aufgaben-Aktionen mit Rückfragen und „Rückgängig“.
 * Die eigentliche Datenänderung passiert im Repository, hier kommt nur die Nutzerführung dazu.
 */
import { formatDateValue } from '#lib/domain/dates.ts';
import { isOpen, type Task } from '#lib/domain/types.ts';
import { m } from '#lib/i18n/index.ts';
import { repo } from './app';
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
