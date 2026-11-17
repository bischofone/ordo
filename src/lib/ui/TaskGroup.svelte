<script lang="ts">
	/** Aufgaben einer Gruppe (Pool ohne Projekt oder ein Projekt): aktiv, Später, Irgendwann, Erledigt. */
	import type { Task } from '#lib/domain/types.ts';
	import { sectionRoots } from '#lib/domain/views.ts';
	import { m } from '#lib/i18n/index.ts';
	import { repo } from '#lib/state/app.ts';
	import { beginKeyBuffer, requestFocus, ui } from '#lib/state/ui.svelte.ts';
	import Icon from './Icon.svelte';
	import TaskList from './TaskList.svelte';

	let {
		poolId,
		projectId,
		tasks,
		agingDays,
		emptyText = m.sections.empty
	}: {
		poolId: string;
		projectId: string | null;
		/** Alle Aufgaben des Pools (für Unteraufgaben); eingeteilt werden nur die Wurzeln dieser Gruppe. */
		tasks: Task[];
		agingDays?: number;
		emptyText?: string;
	} = $props();

	const s = $derived(
		sectionRoots(
			tasks.filter((t) => t.parentId !== null || t.projectId === projectId),
			ui.now
		)
	);
	let open = $state({ later: true, someday: false, done: false });

	async function addEmpty() {
		beginKeyBuffer();
		const id = await repo.createTask({ poolId, projectId, title: '' });
		requestFocus(id);
	}
</script>

<div
	data-testid="task-group"
	style:--twisty={tasks.some((t) => t.parentId && !t.deletedAt) ? '24px' : '0px'}
>
	<TaskList {tasks} roots={s.active} {poolId} {projectId} section="active" {agingDays} />
	{#if !s.active.length && emptyText}
		<p class="empty">{emptyText}</p>
	{/if}
	<button class="add" onclick={addEmpty}>
		<Icon name="plus" size={16} />{m.task.addTask}
	</button>

	{#snippet section(key: 'later' | 'someday' | 'done', label: string, roots: Task[])}
		{#if roots.length}
			<div class="section">
				<button
					class="section-head"
					aria-expanded={open[key]}
					onclick={() => (open[key] = !open[key])}
				>
					<span class="twisty" class:open={open[key]}><Icon name="chevron" size={14} /></span>
					{label}
					<span class="count">{roots.length}</span>
				</button>
				{#if open[key]}
					<TaskList
						{tasks}
						{roots}
						{poolId}
						{projectId}
						section={key}
						dim={key !== 'done'}
						showScheduled={key === 'later'}
					/>
				{/if}
			</div>
		{/if}
	{/snippet}

	{@render section('later', m.sections.later, s.later)}
	{@render section('someday', m.sections.someday, s.someday)}
	{@render section('done', m.sections.done, s.done)}
</div>

<style>
	.empty {
		color: var(--text-faint);
		margin: 6px 0 4px calc(var(--gutter) + var(--twisty));
		font-size: 0.875rem;
	}
	.add {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--text-faint);
		min-height: var(--row-h);
		padding: 0 4px 0 calc(var(--gutter) + var(--twisty) + 2px);
		width: 100%;
		border-radius: 8px;
	}
	.add:hover {
		background: var(--bg-hover);
		color: var(--text-muted);
	}
	.section {
		margin-top: 6px;
		padding-top: 4px;
		border-top: 1px solid var(--border);
	}
	.section-head {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--text-muted);
		padding: 6px 4px 6px 18px;
	}
	.twisty :global(svg) {
		transition: transform 120ms;
	}
	.twisty.open :global(svg) {
		transform: rotate(90deg);
	}
	.count {
		font-weight: 400;
		color: var(--text-faint);
	}
</style>
