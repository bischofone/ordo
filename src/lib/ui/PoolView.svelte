<script lang="ts">
	/** Ein Pool mit seinen Projekten: zuerst Aufgaben ohne Projekt, dann je Projekt eine Gruppe. */
	import { resolve } from '$app/paths';
	import { isOpen, type Pool, type Project, type Task } from '#lib/domain/types.ts';
	import { m } from '#lib/i18n/index.ts';
	import { deleteProject } from '#lib/state/actions.ts';
	import { repo } from '#lib/state/app.ts';
	import Badge from './Badge.svelte';
	import Editor from './Editor.svelte';
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
	let editingId = $state<string | null>(null);
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
				<Badge color={pool.color} icon={pool.icon} size={18} />{pool.name}
			</a>
		</h2>
	{/if}

	<div class="group card" style:--group-color={pool.color} data-testid="group-card">
		{#if projects.length}
			<div class="group-head plain">
				<span class="group-title muted">{m.project.none}</span>
			</div>
		{/if}
		<div class="group-body">
			<TaskGroup
				poolId={pool.id}
				projectId={null}
				{tasks}
				{agingDays}
				emptyText={projects.length ? '' : undefined}
			/>
		</div>
	</div>

	{#each projects as p (p.id)}
		<div
			class="group card"
			class:collapsed={collapsed[p.id]}
			style:--group-color={p.color}
			data-testid="project-group"
			data-project={p.name}
		>
			<div class="group-head">
				<button
					class="twisty"
					class:open={!collapsed[p.id]}
					aria-label={collapsed[p.id] ? m.task.expand : m.task.collapse}
					onclick={() => (collapsed[p.id] = !collapsed[p.id])}
				>
					<Icon name="chevron" size={14} />
				</button>
				<a
					class="group-title"
					href={resolve('/pool/[id]/projekt/[pid]', { id: pool.id, pid: p.id })}
				>
					<Badge color={p.color} icon={p.icon} />
					<span>{p.name}</span>
				</a>
				<span class="count">{openCount(p.id) || ''}</span>
				<button
					class="icon-btn"
					aria-label="{m.project.edit}: {p.name}"
					title={m.project.edit}
					aria-expanded={editingId === p.id}
					onclick={() => (editingId = editingId === p.id ? null : p.id)}
				>
					<Icon name="edit" size={14} />
				</button>
			</div>
			{#if editingId === p.id}
				<div class="project-editor">
					<Editor
						item={p}
						onupdate={(patch) => repo.updateProject(p.id, patch)}
						onmove={(dir) => repo.moveProject(p.id, dir)}
						onarchive={() => repo.updateProject(p.id, { archived: !p.archived })}
						ondelete={() => deleteProject(p)}
					/>
				</div>
			{/if}
			{#if !collapsed[p.id]}
				<div class="group-body">
					<TaskGroup poolId={pool.id} projectId={p.id} {tasks} emptyText="" />
				</div>
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
		margin-bottom: calc(var(--gap) * 2);
	}
	h2 {
		font-size: 1.125rem;
		margin: 0 0 10px;
	}
	h2 a {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}
	.group {
		margin-bottom: var(--gap);
	}
	.group-head {
		display: flex;
		align-items: center;
		gap: 4px;
		min-height: 40px;
		padding: 2px 6px 2px 4px;
		border-bottom: 1px solid var(--border);
		/* kein overflow am Kärtchen (Popover der Farbwahl würde abgeschnitten) → Ecken selbst runden */
		border-radius: calc(var(--radius-card) - 1px) calc(var(--radius-card) - 1px) 0 0;
	}
	.group.collapsed .group-head {
		border-bottom: 0;
		border-radius: calc(var(--radius-card) - 1px);
	}
	.group-head.plain {
		padding-left: 14px;
	}
	.group-title {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-weight: 600;
		flex: 1;
		min-width: 0;
	}
	.group-title.muted {
		color: var(--text-muted);
		font-size: 0.875rem;
	}
	/* Farbige Gruppen (Einstellung): Kopfzeile dezent in der Farbe des Pools/Projekts */
	:global(:root[data-tint='on']) .group-head {
		background: color-mix(in srgb, var(--group-color) 9%, var(--bg-raised));
	}
	.group-body {
		padding: var(--card-pad) 6px;
	}
	.group-head .icon-btn {
		width: 28px;
		height: 28px;
		color: var(--text-faint);
	}
	.project-editor {
		padding: 0 12px;
		border-bottom: 1px solid var(--border);
	}
	.twisty {
		width: 24px;
		height: 28px;
		display: grid;
		place-items: center;
		color: var(--text-faint);
	}
	.twisty :global(svg) {
		transition: transform 120ms;
	}
	.twisty.open :global(svg) {
		transform: rotate(90deg);
	}
	.count {
		font-size: 0.8125rem;
		color: var(--text-faint);
		padding-right: 4px;
	}
	.new-project {
		margin: 0 0 0 4px;
	}
	.new-project-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		border: 1px dashed var(--border-strong);
		border-radius: var(--radius-card);
		color: var(--text-muted);
		font-size: 0.875rem;
		width: 100%;
	}
	.new-project-btn:hover {
		color: var(--text);
		background: var(--bg-hover);
	}
</style>
