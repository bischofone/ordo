<script lang="ts">
	/**
	 * Ein Pool: Aufgaben ohne Projekt und seine Projekte, jeweils als Karte.
	 */
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { m } from '#lib/i18n/index.ts';
	import { deletePool } from '#lib/state/actions.ts';
	import { repo } from '#lib/state/app.ts';
	import { live } from '#lib/state/live.svelte.ts';
	import { q } from '#lib/state/queries.ts';
	import Badge from '#lib/ui/Badge.svelte';
	import Editor from '#lib/ui/Editor.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import PoolSync from '#lib/ui/PoolSync.svelte';
	import PoolAi from '#lib/ui/PoolAi.svelte';
	import PoolCalendar from '#lib/ui/PoolCalendar.svelte';
	import Popover from '#lib/ui/Popover.svelte';
	import { aiDayPlan, aiFromText, aiWeekReview } from '#lib/state/ai.svelte.ts';
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

	async function remove() {
		if (pool && (await deletePool(pool))) goto(resolve('/'));
	}
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
		{#if pool.settings.ai.enabled}
			<span class="spacer"></span>
			<Popover label={m.ai.menu} align="end">
				{#snippet trigger({ toggle, open })}
					<button class="btn ghost ai-btn" aria-expanded={open} onclick={toggle}>
						<Icon name="sparkle" size={16} />{m.ai.name}
					</button>
				{/snippet}
				{#snippet children({ close })}
					<div class="menu" role="menu">
						<button role="menuitem" onclick={() => (close(), aiFromText(pool))}>
							<Icon name="plus" size={16} />{m.ai.fromText}
						</button>
						<button role="menuitem" onclick={() => (close(), aiDayPlan(pool))}>
							<Icon name="calendar" size={16} />{m.ai.dayPlan}
						</button>
						<button role="menuitem" onclick={() => (close(), aiWeekReview(pool))}>
							<Icon name="chart" size={16} />{m.ai.weekReview}
						</button>
					</div>
				{/snippet}
			</Popover>
		{/if}
	</header>
	{#if editing}
		<Editor
			item={pool}
			onupdate={(patch) => repo.updatePool(pool.id, patch)}
			onarchive={pool.kind === 'pool'
				? () => repo.updatePool(pool.id, { archived: !pool.archived })
				: undefined}
			ondelete={pool.kind === 'pool' ? remove : undefined}
		/>
		<PoolSync {pool} />
		<PoolCalendar {pool} />
		<PoolAi {pool} />
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
		font-size: 1.5rem;
		margin: 0;
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.spacer {
		flex: 1;
	}
	.ai-btn {
		gap: 6px;
		color: var(--accent);
	}
	.menu {
		display: flex;
		flex-direction: column;
		min-width: 200px;
		padding: 4px;
	}
	.menu button {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		border-radius: 8px;
		text-align: left;
	}
	.menu button:hover {
		background: var(--bg-hover);
	}
	.tag {
		font-size: 0.75rem;
		padding: 2px 8px;
		border-radius: 6px;
		background: var(--bg-sunken);
		color: var(--text-muted);
	}
</style>
