<script lang="ts">
	import { daysFromToday, formatDateValue } from '#lib/domain/dates.ts';
	import type { Row } from '#lib/domain/tree.ts';
	import { isDone } from '#lib/domain/types.ts';
	import { isAged } from '#lib/domain/views.ts';
	import { m } from '#lib/i18n/index.ts';
	import { toggleDone } from '#lib/state/actions.ts';
	import { db, repo } from '#lib/state/app.ts';
	import { replayKeys, ui } from '#lib/state/ui.svelte.ts';
	import Icon from './Icon.svelte';
	import { swipe } from './swipe';
	import { syncValue } from './sync-value';

	let {
		row,
		progress,
		dim = false,
		showScheduled = false,
		agingDays,
		onkey
	}: {
		row: Row;
		progress: { done: number; total: number } | null;
		dim?: boolean;
		showScheduled?: boolean;
		/** Gesetzt in der Inbox: Einträge älter als so viele Tage werden markiert. */
		agingDays?: number;
		onkey: (e: KeyboardEvent & { currentTarget: HTMLInputElement }) => void;
	} = $props();

	const task = $derived(row.task);
	const done = $derived(isDone(task));
	const dueIn = $derived(task.due ? daysFromToday(task.due, ui.now) : null);
	const aged = $derived(
		agingDays !== undefined && row.depth === 0 && !done && isAged(task, ui.now, agingDays)
	);
	let input = $state<HTMLInputElement>();

	// Fokus-Anfragen (nach Enter, Tab, Pfeiltasten …) erfüllen, sobald die Zeile existiert.
	$effect(() => {
		const f = ui.focus;
		if (!f || f.id !== task.id || !input) return;
		input.focus();
		const len = input.value.length;
		const pos = f.caret === undefined || f.caret === 'end' ? len : Math.min(f.caret, len);
		input.setSelectionRange(pos, pos);
		ui.focus = null;
		replayKeys(input);
	});

	function onblur() {
		if (ui.editingId === task.id) ui.editingId = null;
		// Leere Zeilen ohne Unteraufgaben verschwinden beim Verlassen.
		if (input?.value.trim() || row.hasChildren) return;
		const id = task.id;
		setTimeout(async () => {
			if (document.activeElement === input) return;
			const t = await db.tasks.get(id);
			if (t && !t.deletedAt && !t.title.trim()) await repo.deleteTask(id);
		}, 200);
	}
</script>

<div
	class="row"
	class:dim
	class:done
	style:--depth={row.depth}
	data-testid="task-row"
	data-depth={row.depth}
	use:swipe={{
		onright: () => toggleDone(task),
		onleft: () => (ui.postponeId = task.id)
	}}
>
	<button
		class="twisty"
		class:open={!task.collapsed}
		class:hidden={!row.hasChildren}
		tabindex="-1"
		aria-label={task.collapsed ? m.task.expand : m.task.collapse}
		onclick={() => repo.updateTask(task.id, { collapsed: !task.collapsed })}
	>
		<Icon name="chevron" size={14} />
	</button>

	<button
		class="check prio-{task.priority ?? 0}"
		role="checkbox"
		aria-checked={done}
		aria-label={m.task.done}
		tabindex="-1"
		onclick={() => toggleDone(task)}
	>
		{#if done}<Icon name="check" size={14} />{/if}
	</button>

	<input
		bind:this={input}
		class="title"
		use:syncValue={task.title}
		placeholder={m.task.newPlaceholder}
		aria-label={m.task.title}
		enterkeyhint="next"
		autocomplete="off"
		oninput={(e) => repo.updateTask(task.id, { title: e.currentTarget.value })}
		onkeydown={onkey}
		onfocus={() => (ui.editingId = task.id)}
		{onblur}
	/>

	<span class="meta">
		{#if aged}
			<span class="aged" data-testid="aged">{m.inbox.agedBadge}</span>
		{/if}
		{#if progress}
			<span class="progress" title="Unteraufgaben">{progress.done}/{progress.total}</span>
		{/if}
		{#if task.priority}
			<span class="prio prio-{task.priority}">!{task.priority}</span>
		{/if}
		{#if task.due}
			<span class="due" class:overdue={!done && dueIn! < 0} class:today={!done && dueIn === 0}>
				{formatDateValue(task.due, ui.now)}
			</span>
		{/if}
		{#if showScheduled && task.scheduled}
			<span class="sched">→ {formatDateValue(task.scheduled, ui.now)}</span>
		{/if}
		{#if task.postponeCount > 0}
			<span class="count" title={m.task.postponedTimes(task.postponeCount)}>
				<Icon name="repeat" size={12} />{task.postponeCount}
			</span>
		{/if}
	</span>

	<span class="actions">
		{#if !done}
			<button
				class="icon-btn"
				aria-label={m.task.postpone}
				title={m.task.postpone}
				onclick={() => (ui.postponeId = ui.postponeId === task.id ? null : task.id)}
			>
				<Icon name="clock" size={16} />
			</button>
		{/if}
		<button
			class="icon-btn"
			aria-label={m.task.details}
			title={m.task.details}
			onclick={() => (ui.detailId = task.id)}
		>
			<Icon name="more" size={16} />
		</button>
	</span>
</div>

<style>
	.row {
		display: flex;
		align-items: center;
		gap: 4px;
		min-height: var(--row-h);
		padding-left: calc(var(--depth) * var(--indent));
		padding-right: 4px;
		border-radius: 8px;
		touch-action: pan-y;
		background: var(--bg);
		position: relative;
	}
	.row:hover,
	.row:focus-within {
		background: var(--bg-hover);
	}
	.row:global([data-swipe='right']) {
		box-shadow: inset 4px 0 0 var(--ok);
	}
	.row:global([data-swipe='left']) {
		box-shadow: inset -4px 0 0 var(--warn);
	}
	.dim .title,
	.done .title {
		color: var(--text-muted);
	}
	.done .title {
		text-decoration: line-through;
	}
	.twisty {
		width: 20px;
		height: 28px;
		display: grid;
		place-items: center;
		color: var(--text-faint);
		flex: none;
		transition: transform 120ms;
	}
	.twisty.open :global(svg) {
		transform: rotate(90deg);
	}
	.twisty.hidden {
		visibility: hidden;
	}
	.check {
		width: 20px;
		height: 20px;
		flex: none;
		display: grid;
		place-items: center;
		border-radius: 50%;
		border: 2px solid var(--text-faint);
		color: var(--accent-contrast);
	}
	.check.prio-1 {
		border-color: var(--prio-1);
	}
	.check.prio-2 {
		border-color: var(--prio-2);
	}
	.check.prio-3 {
		border-color: var(--prio-3);
	}
	.done .check {
		background: var(--text-faint);
		border-color: var(--text-faint);
	}
	.title {
		flex: 1;
		min-width: 0;
		border: 0;
		background: transparent;
		padding: 8px 6px;
		outline: none;
	}
	.meta {
		display: flex;
		gap: 6px;
		align-items: center;
		font-size: 12px;
		color: var(--text-muted);
		flex: none;
	}
	.progress {
		font-variant-numeric: tabular-nums;
	}
	.prio {
		font-weight: 600;
	}
	.prio-1 {
		color: var(--prio-1);
	}
	.prio-2 {
		color: var(--prio-2);
	}
	.prio-3 {
		color: var(--prio-3);
	}
	.due.today {
		color: var(--accent);
		font-weight: 600;
	}
	.due.overdue {
		color: var(--danger);
		font-weight: 600;
	}
	.aged {
		padding: 1px 6px;
		border-radius: 6px;
		background: color-mix(in srgb, var(--warn) 18%, transparent);
		color: var(--warn);
		font-weight: 600;
	}
	.count {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		color: var(--warn);
	}
	.actions {
		display: flex;
		opacity: 0;
		flex: none;
	}
	.row:hover .actions,
	.row:focus-within .actions {
		opacity: 1;
	}
	@media (pointer: coarse) {
		.actions {
			opacity: 1;
		}
	}
	@media (max-width: 520px) {
		.meta .sched,
		.meta .count {
			display: none;
		}
	}
</style>
