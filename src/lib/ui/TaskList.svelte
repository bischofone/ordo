<script lang="ts">
	import { childrenMap, descendantIds, flattenTree, type Row } from '#lib/domain/tree.ts';
	import { totalsWithChildren } from '#lib/domain/time.ts';
	import { isDone, type Task } from '#lib/domain/types.ts';
	import { postpone, toggleDone } from '#lib/state/actions.ts';
	import { repo } from '#lib/state/app.ts';
	import { m } from '#lib/i18n/index.ts';
	import { beginKeyBuffer, requestFocus, toast, ui } from '#lib/state/ui.svelte.ts';
	import { registerDropList, startDrag } from './drag.svelte';
	import PostponeMenu from './PostponeMenu.svelte';
	import TaskRow from './TaskRow.svelte';

	let {
		tasks,
		roots,
		poolId,
		projectId,
		section,
		dim = false,
		showScheduled = false,
		agingDays
	}: {
		/** Alle (nicht gelöschten) Aufgaben des Pools – für Unteraufgaben und Fortschritt. */
		tasks: Task[];
		/** Wurzeln dieses Bereichs in Anzeige-Reihenfolge. */
		roots: Task[];
		poolId: string;
		projectId: string | null;
		/** Bereich der Liste. Drag & Drop geht nur zwischen Listen desselben Bereichs. */
		section: 'active' | 'later' | 'someday' | 'done';
		dim?: boolean;
		showScheduled?: boolean;
		agingDays?: number;
	} = $props();

	const rows = $derived(flattenTree(tasks, roots));
	/** Spalte zum Auf-/Zuklappen nur, wenn es hier Unteraufgaben gibt */
	const tree = $derived(rows.some((r) => r.hasChildren || r.depth > 0));
	const draggable = $derived(section === 'active' || section === 'someday');
	let listEl = $state<HTMLElement>();

	$effect(() => {
		if (!listEl || !draggable) return;
		return registerDropList({ el: listEl, poolId, projectId, section, rows: () => rows });
	});

	function dragStart(e: PointerEvent, row: Row) {
		startDrag(
			e,
			{ row, section, moving: [row.task.id, ...descendantIds(tasks, row.task.id)] },
			({ name }) => name && toast(m.task.moved(name))
		);
	}

	async function addSubtask(row: Row) {
		beginKeyBuffer();
		if (row.task.collapsed) await repo.updateTask(row.task.id, { collapsed: false });
		const id = await repo.createTask({ poolId: row.task.poolId, parentId: row.task.id, title: '' });
		requestFocus(id);
	}
	const kids = $derived(childrenMap(tasks));
	const minutes = $derived(totalsWithChildren(tasks));
	const progressOf = (id: string) => {
		const k = kids.get(id);
		return k ? { done: k.filter(isDone).length, total: k.length } : null;
	};

	/** Gliederungs-Bedienung: Enter, Tab/Shift+Tab, Backspace, Pfeiltasten, Alt+Pfeile, Strg+Enter. */
	async function onkey(e: KeyboardEvent & { currentTarget: HTMLInputElement }, id: string) {
		if (e.isComposing) return;
		const index = rows.findIndex((r) => r.task.id === id);
		const row = rows[index];
		if (!row) return;
		const t = row.task;
		const input = e.currentTarget;
		const value = input.value;
		const caret = input.selectionStart ?? value.length;

		switch (e.key) {
			case 'Enter': {
				e.preventDefault();
				if (e.ctrlKey || e.metaKey) return toggleDone(t);
				if (!value.trim()) {
					// Leere Zeile + Enter = eine Ebene zurück (wie in Outlinern üblich)
					if (row.depth > 0) {
						beginKeyBuffer();
						await repo.outdent(t.id);
						requestFocus(t.id);
					}
					return;
				}
				beginKeyBuffer();
				const inherit = {
					someday: t.parentId === null ? t.someday : false,
					scheduled: t.parentId === null ? t.scheduled : undefined
				};
				if (caret === 0) {
					// Enter am Zeilenanfang: leere Zeile darüber, Cursor bleibt hier
					await repo.createTask({ poolId: t.poolId, beforeId: t.id, title: '', ...inherit });
					requestFocus(t.id, 0);
					return;
				}
				// Text hinter dem Cursor wandert in die neue Zeile
				let rest = '';
				if (caret < value.length) {
					rest = value.slice(caret).trimStart();
					input.value = value.slice(0, caret).trimEnd();
					await repo.updateTask(t.id, { title: input.value });
				}
				const newId =
					row.hasChildren && !t.collapsed
						? await repo.createTask({ poolId: t.poolId, parentId: t.id, title: rest, first: true })
						: await repo.createTask({
								poolId: t.poolId,
								afterId: t.id,
								title: rest,
								...inherit
							});
				requestFocus(newId, 0);
				return;
			}
			case 'Tab': {
				e.preventDefault();
				beginKeyBuffer();
				if (e.shiftKey) await repo.outdent(t.id);
				else await repo.indent(t.id);
				requestFocus(t.id, caret);
				return;
			}
			case 'Backspace': {
				if (value !== '' || row.hasChildren) return;
				e.preventDefault();
				const prev = rows[index - 1];
				if (prev) beginKeyBuffer();
				await repo.deleteTask(t.id);
				if (prev) requestFocus(prev.task.id);
				return;
			}
			case 'ArrowUp':
			case 'ArrowDown': {
				const dir = e.key === 'ArrowUp' ? -1 : 1;
				e.preventDefault();
				if (e.altKey) {
					beginKeyBuffer();
					await repo.move(t.id, dir);
					requestFocus(t.id, caret);
				} else {
					const target = rows[index + dir];
					if (target) requestFocus(target.task.id, caret);
				}
				return;
			}
			case 'Escape':
				input.blur();
				return;
		}
	}
</script>

<ul class="list" bind:this={listEl} data-drop-list style:--twisty={tree ? '24px' : '0px'}>
	{#each rows as row (row.task.id)}
		<li style:--line-depth={row.depth}>
			<TaskRow
				{row}
				{tree}
				progress={progressOf(row.task.id)}
				minutes={minutes.get(row.task.id)}
				{dim}
				{showScheduled}
				{agingDays}
				onkey={(e) => onkey(e, row.task.id)}
				ondragstart={draggable ? (e) => dragStart(e, row) : undefined}
				onaddsubtask={section === 'active' || section === 'someday'
					? () => addSubtask(row)
					: undefined}
			/>
			{#if ui.postponeId === row.task.id}
				<div style:padding-left="calc({row.depth} * var(--indent) + var(--gutter) + var(--twisty))">
					<PostponeMenu
						onpick={(d) => postpone(row.task, d, row.hasChildren)}
						onclose={() => (ui.postponeId = null)}
					/>
				</div>
			{/if}
		</li>
	{/each}
</ul>

<style>
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	/* Dezente Trennlinie zwischen Aufgaben, eingerückt wie die Aufgabe selbst.
	   Die Zeile beim Drüberfahren deckt ihre Linie mit dem Hintergrund ab. */
	li {
		position: relative;
	}
	li + li::before {
		content: '';
		position: absolute;
		top: 0;
		left: calc(var(--line-depth) * var(--indent) + var(--gutter) + var(--twisty));
		right: 8px;
		height: 1px;
		background: color-mix(in srgb, var(--border) 65%, transparent);
		pointer-events: none;
	}
	/* Leere Listen beim Ziehen als Ziel erreichbar machen */
	:global(body.is-dragging) .list {
		min-height: 36px;
	}
</style>
