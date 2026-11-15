<script lang="ts">
	import { page } from '$app/state';
	import { m } from '#lib/i18n/index.ts';
	import { live } from '#lib/state/live.svelte.ts';
	import { q } from '#lib/state/queries.ts';
	import Icon from '#lib/ui/Icon.svelte';
	import PoolEditor from '#lib/ui/PoolEditor.svelte';
	import PoolSection from '#lib/ui/PoolSection.svelte';
	import QuickAdd from '#lib/ui/QuickAdd.svelte';

	const pools = live(() => q.pools, []);
	const tasks = live(() => q.poolTasks(page.params.id!), []);

	const pool = $derived(pools.current.find((p) => p.id === page.params.id));
	const usable = $derived(pools.current.filter((p) => !p.archived));
	let editing = $state(false);
</script>

{#if pool}
	<header>
		<h1><span class="dot" style:background={pool.color}></span>{pool.name}</h1>
		{#if pool.archived}<span class="tag">{m.pool.archived}</span>{/if}
		<button
			class="icon-btn"
			aria-label={m.pool.edit}
			aria-expanded={editing}
			onclick={() => (editing = !editing)}><Icon name="edit" size={16} /></button
		>
	</header>
	{#if editing}<PoolEditor {pool} />{/if}

	<QuickAdd pools={usable} defaultPoolId={pool.id} />
	<PoolSection {pool} tasks={tasks.current} />
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
	.dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
	}
	.tag {
		font-size: 12px;
		padding: 2px 8px;
		border-radius: 6px;
		background: var(--bg-sunken);
		color: var(--text-muted);
	}
</style>
