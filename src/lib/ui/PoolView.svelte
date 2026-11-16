<script lang="ts">
	/** Ein Pool mit seinen Projekten: zuerst Aufgaben ohne Projekt, dann je Projekt eine Gruppe. */
	import { resolve } from '$app/paths';
	import { isOpen, type Pool, type Project, type Task } from '#lib/domain/types.ts';
	import { m } from '#lib/i18n/index.ts';
	import { repo } from '#lib/state/app.ts';
	import Badge from './Badge.svelte';
	import Icon from './Icon.svelte';
	import TaskGroup from './TaskGroup.svelte';

	let {
		pool,
		projects,
		tasks,
		showHeader = false,
		agingDays
	}: {
		pool: Pool;
		/** Nicht archivierte Projekte dieses Pools, sortiert */
		projects: Project[];
		tasks: Task[];
		showHeader?: boolean;
		agingDays?: number;
	} = $props();

	let collapsed = $state<Record<string, boolean>>({});
	let adding = $state(false);
	let newName = $state('');

	const openCount = (projectId: string) =>
		tasks.filter((t) => t.parentId === null && t.projectId === projectId && isOpen(t) && !t.someday)
			.length;

	async function addProject(e: SubmitEvent) {
		e.preventDefault();
		if (newName.trim()) await repo.createProject(pool.id, newName);
		newName = '';
		adding = false;
	}
</script>

<section class="pool" data-testid="pool-section" data-pool={pool.name}>
	{#if showHeader}
		<h2>
			<a href={resolve('/pool/[id]', { id: pool.id })}>
				<Badge color={pool.color} icon={pool.icon} />{pool.name}
			</a>
		</h2>
	{/if}

	<TaskGroup
		poolId={pool.id}
		projectId={null}
		{tasks}
		{agingDays}
		emptyText={projects.length ? '' : undefined}
	/>

	{#each projects as p (p.id)}
		<div class="project" data-testid="project-group" data-project={p.name}>
			<div class="project-head">
				<button
					class="twisty"
					class:open={!collapsed[p.id]}
					aria-label={collapsed[p.id] ? m.task.expand : m.task.collapse}
					onclick={() => (collapsed[p.id] = !collapsed[p.id])}
				>
					<Icon name="chevron" size={14} />
				</button>
				<a href={resolve('/pool/[id]/projekt/[pid]', { id: pool.id, pid: p.id })}>
					<Badge color={p.color} icon={p.icon} />
					<span>{p.name}</span>
				</a>
				<span class="count">{openCount(p.id) || ''}</span>
			</div>
			{#if !collapsed[p.id]}
				<TaskGroup poolId={pool.id} projectId={p.id} {tasks} emptyText="" />
			{/if}
		</div>
	{/each}

	{#if pool.kind === 'pool'}
		{#if adding}
			<form class="new-project" onsubmit={addProject}>
				<!-- svelte-ignore a11y_autofocus -->
				<input
					class="field"
					bind:value={newName}
					placeholder={m.project.newName}
					aria-label={m.project.newName}
					autofocus
					onblur={() => !newName && (adding = false)}
				/>
			</form>
		{:else}
			<button class="new-project-btn" onclick={() => (adding = true)}>
				<Icon name="folder" size={16} />{m.project.new}
			</button>
		{/if}
	{/if}
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
	.project {
		margin-top: 14px;
	}
	.project-head {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 0;
		border-bottom: 1px solid var(--border);
		margin-bottom: 2px;
	}
	.project-head a {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-weight: 600;
		flex: 1;
	}
	.twisty {
		width: 20px;
		height: 24px;
		display: grid;
		place-items: center;
		color: var(--text-faint);
		margin-left: 14px;
	}
	.twisty :global(svg) {
		transition: transform 120ms;
	}
	.twisty.open :global(svg) {
		transform: rotate(90deg);
	}
	.count {
		font-size: 13px;
		color: var(--text-faint);
		padding-right: 8px;
	}
	.new-project {
		margin: 14px 0 0 38px;
	}
	.new-project-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 14px;
		padding: 6px 4px 6px 38px;
		color: var(--text-faint);
		font-size: 14px;
	}
	.new-project-btn:hover {
		color: var(--text-muted);
	}
</style>
