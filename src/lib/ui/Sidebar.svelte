<script lang="ts">
	/**
	 * Seitenleiste: Inbox, Alle Pools, Pools mit Projekten, Zeiten, Einstellungen.
	 * Pools und Projekte sind Ablageziele beim Ziehen.
	 */
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { INBOX_ID } from '#lib/db/repo.ts';
	import { isOpen, type Pool, type Project, type Task } from '#lib/domain/types.ts';
	import { todayIso } from '#lib/domain/dates.ts';
	import { formatDuration, targetFor } from '#lib/domain/time.ts';
	import { isAged } from '#lib/domain/views.ts';
	import { isLater } from '#lib/domain/postpone.ts';
	import { m } from '#lib/i18n/index.ts';
	import { timeSettings } from '#lib/state/time-settings.svelte.ts';
	import { db, repo } from '#lib/state/app.ts';
	import { live } from '#lib/state/live.svelte.ts';
	import { syncNow, syncStatus } from '#lib/state/sync.svelte.ts';
	import { ui } from '#lib/state/ui.svelte.ts';
	import Badge from './Badge.svelte';
	import { drag } from './drag.svelte';
	import Icon from './Icon.svelte';
	import Logo from './Logo.svelte';
	import { buildToday } from '#lib/domain/today.ts';

	let {
		pools,
		projects,
		tasks,
		agingDays
	}: { pools: Pool[]; projects: Project[]; tasks: Task[]; agingDays: number } = $props();

	const active = (t: Task) => t.parentId === null && isOpen(t) && !t.someday && !isLater(t, ui.now);
	const counts = $derived.by(() => {
		const c: Record<string, number> = {};
		for (const t of tasks) {
			if (!active(t)) continue;
			c[t.poolId] = (c[t.poolId] ?? 0) + 1;
			if (t.projectId) c[t.projectId] = (c[t.projectId] ?? 0) + 1;
		}
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

	// Heute: offene geplante + überfällige Aufgaben (rot, wenn etwas überfällig ist)
	const todayCount = $derived.by(() => {
		const v = buildToday(tasks, ui.now);
		return { open: v.today.length, overdue: v.overdue.length };
	});

	// Heute getrackt / Soll – steht neben „Zeiten“
	const today = $derived(todayIso(ui.now));
	const trackedToday = $derived(
		tasks.reduce(
			(sum, t) =>
				sum + (t.timeEntries ?? []).reduce((s, e) => s + (e.date === today ? e.minutes : 0), 0),
			0
		)
	);
	const targetToday = $derived(targetFor(today, timeSettings.current));
	const conflictCount = live(() => () => db.conflicts.count(), 0);
	const syncLabel = $derived(
		syncStatus.running ? m.sync.syncing : syncStatus.error ? m.sync.error : m.sync.ok
	);
</script>

<nav class="sidebar" class:open={ui.sidebarOpen} aria-label="Navigation">
	<div class="brand">
		<Logo size={26} />
		<span class="wordmark">{m.appName}</span>
	</div>
	<a class="item" class:current={path.startsWith('/heute')} href={resolve('/heute')}>
		<Icon name="calendar" />
		<span class="name">{m.nav.today}</span>
		{#if todayCount.overdue}
			<span class="badge late" title={m.today.overdue} data-testid="today-badge"
				>{todayCount.overdue + todayCount.open}</span
			>
		{:else if todayCount.open}
			<span class="count" data-testid="today-badge">{todayCount.open}</span>
		{/if}
	</a>
	<a
		class="item"
		class:current={path.startsWith('/inbox')}
		class:drop-over={drag.overTarget === `pool:${INBOX_ID}`}
		href={resolve('/inbox')}
		data-drop-target="pool:{INBOX_ID}"
		data-pool-id={INBOX_ID}
		data-name={m.nav.inbox}
	>
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

	{#if timeSettings.enabled}
		<a class="item" class:current={path === '/zeiten'} href={resolve('/zeiten')}>
			<Icon name="chart" />
			<span class="name">{m.nav.times}</span>
			<span
				class="count"
				data-testid="today-time"
				title={m.time.todaySummary(formatDuration(trackedToday), formatDuration(targetToday))}
			>
				{formatDuration(trackedToday)}{targetToday ? ` / ${formatDuration(targetToday)}` : ''}
			</span>
		</a>
	{/if}

	<h3>{m.nav.pools}</h3>
	{#each visible as p (p.id)}
		<a
			class="item"
			class:current={path === `/pool/${p.id}`}
			class:drop-over={drag.overTarget === `pool:${p.id}`}
			href={resolve('/pool/[id]', { id: p.id })}
			data-drop-target="pool:{p.id}"
			data-pool-id={p.id}
			data-name={p.name}
		>
			<Badge color={p.color} icon={p.icon} />
			<span class="name">{p.name}</span>
			{#if counts[p.id]}<span class="count">{counts[p.id]}</span>{/if}
		</a>
		{#each projects.filter((pr) => pr.poolId === p.id && !pr.archived) as pr (pr.id)}
			<a
				class="item sub"
				class:current={path === `/pool/${p.id}/projekt/${pr.id}`}
				class:drop-over={drag.overTarget === `project:${pr.id}`}
				href={resolve('/pool/[id]/projekt/[pid]', { id: p.id, pid: pr.id })}
				data-drop-target="project:{pr.id}"
				data-pool-id={p.id}
				data-project-id={pr.id}
				data-name="{p.name} › {pr.name}"
			>
				<Badge color={pr.color} icon={pr.icon} size={14} />
				<span class="name">{pr.name}</span>
				{#if counts[pr.id]}<span class="count">{counts[pr.id]}</span>{/if}
			</a>
		{/each}
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
		{#if conflictCount.current}
			<a class="item warn" class:current={path === '/konflikte'} href={resolve('/konflikte')}>
				<Icon name="x" /><span class="name">{m.sync.conflicts(conflictCount.current)}</span>
			</a>
		{/if}
		{#if syncStatus.enabled}
			<button
				class="item sync"
				class:error={!!syncStatus.error}
				data-testid="sync-status"
				data-last-run={syncStatus.lastRun}
				data-running={syncStatus.running}
				title={syncStatus.error ?? m.sync.syncNow}
				onclick={() => syncNow()}
			>
				<span class:spin={syncStatus.running}><Icon name="repeat" /></span>
				<span class="name">{syncLabel}</span>
			</button>
		{/if}
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
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-faint);
		margin: 16px 10px 4px;
	}
	.item {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: max(32px, calc(var(--row-h) - 2px));
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
		background: color-mix(in srgb, var(--accent) 14%, transparent);
		color: var(--text);
		font-weight: 600;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 4px 10px 12px;
		font-weight: 700;
		font-size: 1.0625rem;
	}
	.wordmark {
		letter-spacing: 0.01em;
	}
	.item.sub {
		min-height: max(28px, calc(var(--row-h) - 8px));
		margin-left: 17px;
		padding-left: 12px;
		width: calc(100% - 17px);
		font-size: 0.875rem;
		/* Linie zeigt: gehört zum Pool darüber */
		border-left: 1px solid var(--border-strong);
		border-radius: 0 8px 8px 0;
	}
	.item.drop-over {
		background: color-mix(in srgb, var(--accent) 20%, transparent);
		color: var(--text);
		box-shadow: inset 0 0 0 2px var(--accent);
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
	.count {
		font-size: 0.8125rem;
		color: var(--text-faint);
	}
	.badge {
		min-width: 22px;
		height: 20px;
		padding: 0 6px;
		border-radius: 10px;
		font-size: 0.75rem;
		font-weight: 600;
		display: grid;
		place-items: center;
		background: var(--accent);
		color: var(--accent-contrast);
	}
	.badge.aged {
		background: var(--warn);
	}
	.badge.late {
		background: var(--danger);
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
	.item.warn {
		color: var(--warn);
	}
	.item.sync {
		font-size: 0.875rem;
	}
	.item.sync.error {
		color: var(--danger);
	}
	.spin {
		display: inline-grid;
		animation: spin 1s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
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
