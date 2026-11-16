<script lang="ts">
	import { page } from '$app/state';
	import { m } from '#lib/i18n/index.ts';
	import { repo } from '#lib/state/app.ts';
	import { live } from '#lib/state/live.svelte.ts';
	import { q } from '#lib/state/queries.ts';
	import Badge from '#lib/ui/Badge.svelte';
	import Editor from '#lib/ui/Editor.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import PoolSync from '#lib/ui/PoolSync.svelte';
	import PoolView from '#lib/ui/PoolView.svelte';
	import SyncChip from '#lib/ui/SyncChip.svelte';
	import QuickAdd from '#lib/ui/QuickAdd.svelte';

	const pools = live(() => q.pools, []);
	const projects = live(() => q.projects, []);
	const tasks = live(() => q.poolTasks(page.params.id!), []);

	const pool = $derived(pools.current.find((p) => p.id === page.params.id));
	const usable = $derived(pools.current.filter((p) => !p.archived));
	const poolProjects = $derived(
		projects.current.filter((p) => p.poolId === page.params.id && !p.archived)
	);
	let editing = $state(false);
</script>

{#if pool}
	<header>
		<h1><Badge color={pool.color} icon={pool.icon} size={22} />{pool.name}</h1>
		{#if pool.archived}<span class="tag">{m.pool.archived}</span>{/if}
		<button
			class="icon-btn"
			aria-label={m.pool.edit}
			aria-expanded={editing}
			onclick={() => (editing = !editing)}><Icon name="edit" size={16} /></button
		>
		<SyncChip {pool} onclick={() => (editing = !editing)} />
	</header>
	{#if editing}
		<Editor
			item={pool}
			onupdate={(patch) => repo.updatePool(pool.id, patch)}
			onarchive={pool.kind === 'pool'
				? () => repo.updatePool(pool.id, { archived: !pool.archived })
				: undefined}
		/>
		<PoolSync {pool} />
	{/if}

	<QuickAdd pools={usable} projects={projects.current} defaultPoolId={pool.id} />
	<PoolView {pool} projects={poolProjects} tasks={tasks.current} />
{:else if pools.loaded}
	<p>{m.pool.notFound}</p>
{/if}

<style>
	header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 12px;
	}
	h1 {
		font-size: 24px;
		margin: 0;
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.tag {
		font-size: 12px;
		padding: 2px 8px;
		border-radius: 6px;
		background: var(--bg-sunken);
		color: var(--text-muted);
	}
</style>
