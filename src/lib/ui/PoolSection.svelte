<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Pool, Task } from '#lib/domain/types.ts';
	import { sectionRoots } from '#lib/domain/views.ts';
	import { m } from '#lib/i18n/index.ts';
	import { repo } from '#lib/state/app.ts';
	import { beginKeyBuffer, requestFocus, ui } from '#lib/state/ui.svelte.ts';
	import Icon from './Icon.svelte';
	import TaskList from './TaskList.svelte';

	let {
		pool,
		tasks,
		showHeader = false,
		agingDays
	}: { pool: Pool; tasks: Task[]; showHeader?: boolean; agingDays?: number } = $props();

	const s = $derived(sectionRoots(tasks, ui.now));
	let open = $state({ later: true, someday: false, done: false });

	async function addEmpty() {
		beginKeyBuffer();
		const id = await repo.createTask({ poolId: pool.id, title: '' });
		requestFocus(id);
	}
</script>

<section class="pool" data-testid="pool-section" data-pool={pool.name}>
	{#if showHeader}
		<h2>
			<a href={resolve('/pool/[id]', { id: pool.id })}>
				<span class="dot" style:background={pool.color}></span>{pool.name}
			</a>
		</h2>
	{/if}

	{#if s.active.length}
		<TaskList {tasks} roots={s.active} {agingDays} />
	{:else}
		<p class="empty">{m.sections.empty}</p>
	{/if}
	<button class="add" onclick={addEmpty}>
		<Icon name="plus" size={16} />{m.task.addTask}
	</button>

	{#snippet group(key: 'later' | 'someday' | 'done', label: string, roots: Task[])}
		{#if roots.length}
			<div class="group">
				<button
					class="group-head"
					aria-expanded={open[key]}
					onclick={() => (open[key] = !open[key])}
				>
					<span class="twisty" class:open={open[key]}><Icon name="chevron" size={14} /></span>
					{label}
					<span class="count">{roots.length}</span>
				</button>
				{#if open[key]}
					<TaskList {tasks} {roots} dim={key !== 'done'} showScheduled={key === 'later'} />
				{/if}
			</div>
		{/if}
	{/snippet}

	{@render group('later', m.sections.later, s.later)}
	{@render group('someday', m.sections.someday, s.someday)}
	{@render group('done', m.sections.done, s.done)}
</section>

<style>
	.pool {
		margin-bottom: 28px;
	}
	h2 {
		font-size: 15px;
		margin: 0 0 6px;
		color: var(--text-muted);
	}
	h2 a {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}
	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
	}
	.empty {
		color: var(--text-faint);
		margin: 8px 0 8px 28px;
	}
	.add {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--text-faint);
		padding: 8px 4px 8px 22px;
		width: 100%;
		border-radius: 8px;
	}
	.add:hover {
		background: var(--bg-hover);
		color: var(--text-muted);
	}
	.group {
		margin-top: 10px;
	}
	.group-head {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 14px;
		font-weight: 600;
		color: var(--text-muted);
		padding: 6px 4px;
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
