<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { INBOX_ID } from '#lib/db/repo.ts';
	import { isOpen, type Pool, type Task } from '#lib/domain/types.ts';
	import { isAged } from '#lib/domain/views.ts';
	import { isLater } from '#lib/domain/postpone.ts';
	import { m } from '#lib/i18n/index.ts';
	import { repo } from '#lib/state/app.ts';
	import { ui } from '#lib/state/ui.svelte.ts';
	import Icon from './Icon.svelte';

	let { pools, tasks, agingDays }: { pools: Pool[]; tasks: Task[]; agingDays: number } = $props();

	const active = (t: Task) => t.parentId === null && isOpen(t) && !t.someday && !isLater(t, ui.now);
	const counts = $derived.by(() => {
		const c: Record<string, number> = {};
		for (const t of tasks) if (active(t)) c[t.poolId] = (c[t.poolId] ?? 0) + 1;
		return c;
	});
	const inboxAged = $derived(
		tasks.some((t) => t.poolId === INBOX_ID && active(t) && isAged(t, ui.now, agingDays))
	);
	const visible = $derived(pools.filter((p) => p.kind === 'pool' && !p.archived));

	let adding = $state(false);
	let newName = $state('');
	async function addPool(e: SubmitEvent) {
		e.preventDefault();
		if (newName.trim()) await repo.createPool(newName);
		newName = '';
		adding = false;
	}

	const path = $derived(page.url.pathname);
</script>

<nav class="sidebar" class:open={ui.sidebarOpen} aria-label="Navigation">
	<a class="item" class:current={path.startsWith('/inbox')} href={resolve('/inbox')}>
		<Icon name="inbox" />
		<span class="name">{m.nav.inbox}</span>
		{#if counts[INBOX_ID]}
			<span class="badge" class:aged={inboxAged} data-testid="inbox-badge">{counts[INBOX_ID]}</span>
		{/if}
	</a>
	<a class="item" class:current={path === '/'} href={resolve('/')}>
		<Icon name="layers" />
		<span class="name">{m.nav.all}</span>
	</a>

	<h3>{m.nav.pools}</h3>
	{#each visible as p (p.id)}
		<a
			class="item"
			class:current={path === `/pool/${p.id}`}
			href={resolve('/pool/[id]', { id: p.id })}
		>
			<span class="dot" style:background={p.color}></span>
			<span class="name">{p.name}</span>
			{#if counts[p.id]}<span class="count">{counts[p.id]}</span>{/if}
		</a>
	{/each}

	{#if adding}
		<form class="new" onsubmit={addPool}>
			<!-- svelte-ignore a11y_autofocus -->
			<input
				class="field"
				bind:value={newName}
				placeholder={m.pool.newName}
				aria-label={m.pool.newName}
				autofocus
				onblur={() => !newName && (adding = false)}
			/>
		</form>
	{:else}
		<button class="item muted" onclick={() => (adding = true)}>
			<Icon name="plus" /><span class="name">{m.nav.newPool}</span>
		</button>
	{/if}

	<div class="bottom">
		<a class="item" class:current={path === '/einstellungen'} href={resolve('/einstellungen')}>
			<Icon name="settings" /><span class="name">{m.nav.settings}</span>
		</a>
	</div>
</nav>
{#if ui.sidebarOpen}
	<button class="scrim" aria-label={m.task.close} onclick={() => (ui.sidebarOpen = false)}></button>
{/if}

<style>
	.sidebar {
		width: 250px;
		flex: none;
		height: 100dvh;
		position: sticky;
		top: 0;
		overflow-y: auto;
		padding: 12px 8px;
		border-right: 1px solid var(--border);
		background: var(--bg-sunken);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	h3 {
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-faint);
		margin: 16px 10px 4px;
	}
	.item {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 38px;
		padding: 0 10px;
		border-radius: 8px;
		color: var(--text-muted);
		width: 100%;
		text-align: left;
	}
	.item:hover {
		background: var(--bg-hover);
		color: var(--text);
	}
	.item.current {
		background: var(--bg-hover);
		color: var(--text);
		font-weight: 600;
	}
	.item.muted {
		color: var(--text-faint);
	}
	.name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		margin: 0 4px;
		flex: none;
	}
	.count {
		font-size: 13px;
		color: var(--text-faint);
	}
	.badge {
		min-width: 22px;
		height: 20px;
		padding: 0 6px;
		border-radius: 10px;
		font-size: 12px;
		font-weight: 600;
		display: grid;
		place-items: center;
		background: var(--accent);
		color: var(--accent-contrast);
	}
	.badge.aged {
		background: var(--warn);
	}
	.new {
		padding: 4px 6px;
	}
	.new input {
		width: 100%;
	}
	.bottom {
		margin-top: auto;
		padding-top: 12px;
	}
	.scrim {
		display: none;
	}
	@media (max-width: 800px) {
		.sidebar {
			position: fixed;
			left: 0;
			z-index: 30;
			transform: translateX(-100%);
			transition: transform 180ms ease;
			box-shadow: var(--shadow);
		}
		.sidebar.open {
			transform: none;
		}
		.scrim {
			display: block;
			position: fixed;
			inset: 0;
			z-index: 29;
			background: rgb(0 0 0 / 0.3);
		}
	}
</style>
