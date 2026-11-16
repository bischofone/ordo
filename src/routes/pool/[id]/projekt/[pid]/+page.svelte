<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { m } from '#lib/i18n/index.ts';
	import { deleteProject } from '#lib/state/actions.ts';
	import { repo } from '#lib/state/app.ts';
	import { live } from '#lib/state/live.svelte.ts';
	import { q } from '#lib/state/queries.ts';
	import Badge from '#lib/ui/Badge.svelte';
	import Editor from '#lib/ui/Editor.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import QuickAdd from '#lib/ui/QuickAdd.svelte';
	import TaskGroup from '#lib/ui/TaskGroup.svelte';

	const pools = live(() => q.pools, []);
	const projects = live(() => q.projects, []);
	const tasks = live(() => q.poolTasks(page.params.id!), []);

	const pool = $derived(pools.current.find((p) => p.id === page.params.id));
	const project = $derived(projects.current.find((p) => p.id === page.params.pid));
	let editing = $state(false);

	async function remove() {
		if (!project || !pool) return;
		const poolId = pool.id;
		if (await deleteProject(project)) goto(resolve('/pool/[id]', { id: poolId }));
	}
</script>

{#if pool && project}
	<header>
		<a class="crumb" href={resolve('/pool/[id]', { id: pool.id })}>
			<Badge color={pool.color} icon={pool.icon} size={14} />{pool.name}
		</a>
		<div class="title-row">
			<h1><Badge color={project.color} icon={project.icon} size={22} />{project.name}</h1>
			{#if project.archived}<span class="tag">{m.pool.archived}</span>{/if}
			<button
				class="icon-btn"
				aria-label={m.project.edit}
				aria-expanded={editing}
				onclick={() => (editing = !editing)}><Icon name="edit" size={16} /></button
			>
		</div>
	</header>
	{#if editing}
		<Editor
			item={project}
			onupdate={(patch) => repo.updateProject(project.id, patch)}
			onmove={(dir) => repo.moveProject(project.id, dir)}
			onarchive={() => repo.updateProject(project.id, { archived: !project.archived })}
			ondelete={remove}
		/>
	{/if}

	<QuickAdd
		pools={pools.current.filter((p) => !p.archived)}
		projects={projects.current}
		defaultPoolId={pool.id}
		defaultProjectId={project.id}
	/>
	<section class="card group" data-testid="pool-section">
		<TaskGroup poolId={pool.id} projectId={project.id} tasks={tasks.current} />
	</section>
{:else if projects.loaded && pools.loaded}
	<p>{m.project.notFound}</p>
{/if}

<style>
	.group {
		padding: var(--card-pad) 6px;
	}
	header {
		margin-bottom: 12px;
	}
	.crumb {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 0.875rem;
		color: var(--text-muted);
	}
	.title-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	h1 {
		font-size: 1.5rem;
		margin: 2px 0 0;
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.tag {
		font-size: 0.75rem;
		padding: 2px 8px;
		border-radius: 6px;
		background: var(--bg-sunken);
		color: var(--text-muted);
	}
</style>
