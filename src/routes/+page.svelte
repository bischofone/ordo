<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { INBOX_ID } from '#lib/db/repo.ts';
	import { m } from '#lib/i18n/index.ts';
	import { live } from '#lib/state/live.svelte.ts';
	import { q } from '#lib/state/queries.ts';
	import PoolSection from '#lib/ui/PoolSection.svelte';
	import QuickAdd from '#lib/ui/QuickAdd.svelte';

	const pools = live(() => q.pools, []);
	const tasks = live(() => q.allTasks, []);

	const usable = $derived(pools.current.filter((p) => !p.archived));
	const visible = $derived(usable.filter((p) => p.kind === 'pool'));

	/** Auswahl über ?pools=id1,id2 – leer = alle. */
	const selected = $derived(page.url.searchParams.get('pools')?.split(',').filter(Boolean) ?? []);
	const shown = $derived(
		selected.length ? visible.filter((p) => selected.includes(p.id)) : visible
	);

	function toggle(id: string) {
		const next = selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
		goto(next.length ? resolve(`/?pools=${next.join(',')}`) : resolve('/'), {
			replace: true,
			reset: false
		});
	}

	const tasksOf = (poolId: string) => tasks.current.filter((t) => t.poolId === poolId);
</script>

<h1>{m.all.title}</h1>

<div class="filter" role="group" aria-label={m.all.filter}>
	{#each visible as p (p.id)}
		<button
			class="chip"
			class:on={selected.includes(p.id)}
			aria-pressed={selected.includes(p.id)}
			onclick={() => toggle(p.id)}
		>
			<span class="dot" style:background={p.color}></span>{p.name}
		</button>
	{/each}
</div>

<QuickAdd pools={usable} defaultPoolId={shown.length === 1 ? shown[0].id : INBOX_ID} />

{#each shown as p (p.id)}
	<PoolSection pool={p} tasks={tasksOf(p.id)} showHeader />
{/each}

<style>
	h1 {
		font-size: 24px;
		margin: 0 0 12px;
	}
	.filter {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 12px;
	}
	.filter .chip {
		padding: 0 10px;
		gap: 6px;
		color: var(--text-muted);
	}
	.filter .chip.on {
		border-color: var(--accent);
		color: var(--text);
		background: color-mix(in srgb, var(--accent) 12%, var(--bg-raised));
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}
</style>
