<script lang="ts">
	import { resolve } from '$app/paths';
	import { formatDistanceToNow } from 'date-fns';
	import { de } from 'date-fns/locale';
	import { INBOX_ID } from '#lib/db/repo.ts';
	import { formatDateValue } from '#lib/domain/dates.ts';
	import { isOpen } from '#lib/domain/types.ts';
	import { DEFAULT_INBOX_AGING_DAYS, isAged } from '#lib/domain/views.ts';
	import { m } from '#lib/i18n/index.ts';
	import { repo } from '#lib/state/app.ts';
	import { live } from '#lib/state/live.svelte.ts';
	import { q } from '#lib/state/queries.ts';
	import { toast, ui } from '#lib/state/ui.svelte.ts';
	import Badge from '#lib/ui/Badge.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import { swipe } from '#lib/ui/swipe.ts';

	const pools = live(() => q.pools, []);
	const projects = live(() => q.projects, []);
	const tasks = live(() => q.poolTasks(INBOX_ID), []);
	const agingDays = live(
		() => q.setting('inboxAgingDays', DEFAULT_INBOX_AGING_DAYS),
		DEFAULT_INBOX_AGING_DAYS
	);

	const targets = $derived(pools.current.filter((p) => p.kind === 'pool' && !p.archived));
	let skipped = $state<string[]>([]);
	let handled = $state(0);
	let mode = $state<'normal' | 'someday' | 'date'>('normal');

	const remaining = $derived(
		tasks.current
			.filter((t) => t.parentId === null && isOpen(t) && !skipped.includes(t.id))
			.sort((a, b) => a.createdAt - b.createdAt)
	);
	const current = $derived(remaining[0]);
	const total = $derived(handled + remaining.length);

	async function assign(poolId: string, projectId: string | null = null) {
		if (!current) return;
		await repo.moveTo(
			current.id,
			{ poolId, projectId },
			mode === 'someday' ? { someday: true } : {}
		);
		handled++;
		mode = 'normal';
	}

	async function remove() {
		if (!current) return;
		const ids = await repo.deleteTask(current.id, { withChildren: true });
		toast(m.confirm.deleted, { label: m.confirm.undo, run: () => repo.restoreTasks(ids) });
		handled++;
	}

	function skip() {
		if (!current) return;
		skipped = [...skipped, current.id];
		handled++;
		mode = 'normal';
	}

	async function setDate(date: string) {
		if (!current || !date) return;
		await repo.updateTask(current.id, { due: { date } });
		mode = 'normal';
	}

	function onkeydown(e: KeyboardEvent) {
		const el = e.target as HTMLElement;
		if (el.closest('input, textarea, select') || ui.dialog || !current) return;
		if (/^[1-9]$/.test(e.key) && targets[Number(e.key) - 1]) assign(targets[Number(e.key) - 1].id);
		else if (e.key === 'i' || e.key === 'I') mode = mode === 'someday' ? 'normal' : 'someday';
		else if (e.key === 'Delete') remove();
		else if (e.key === 'ArrowRight') skip();
		else if (e.key === 'Escape') mode = 'normal';
		else return;
		e.preventDefault();
	}
</script>

<svelte:window {onkeydown} />

<header>
	<a class="icon-btn" href={resolve('/inbox')} aria-label={m.inbox.back}><Icon name="chevron" /></a>
	<h1>{m.inbox.triage}</h1>
	{#if current}<span class="progress">{m.inbox.progress(handled + 1, total)}</span>{/if}
</header>

{#if current}
	{#key current.id}
		<article
			class="card"
			data-testid="triage-card"
			use:swipe={{ onleft: remove, onright: skip, threshold: 100 }}
		>
			<input
				class="title"
				value={current.title}
				aria-label={m.task.title}
				onchange={(e) => repo.updateTask(current.id, { title: e.currentTarget.value })}
			/>
			{#if current.notes}<p class="notes">{current.notes}</p>{/if}
			<p class="meta">
				{formatDistanceToNow(current.createdAt, { locale: de, addSuffix: true })}
				{#if isAged(current, ui.now, agingDays.current)}
					· <span class="aged">{m.inbox.agedBadge}</span>
				{/if}
				{#if current.due}· <Icon name="calendar" size={13} />
					{formatDateValue(current.due, ui.now)}{/if}
			</p>
		</article>
	{/key}

	<section class="actions">
		<h2>{mode === 'someday' ? m.inbox.someDayPick : m.inbox.assignTo}</h2>
		<div class="pools">
			{#each targets as p, i (p.id)}
				<div class="pool-row">
					<button class="btn pool" onclick={() => assign(p.id)}>
						<kbd>{i + 1}</kbd><Badge color={p.color} icon={p.icon} />{p.name}
					</button>
					{#each projects.current.filter((pr) => pr.poolId === p.id && !pr.archived) as pr (pr.id)}
						<button class="btn project" onclick={() => assign(p.id, pr.id)}>
							<Badge color={pr.color} icon={pr.icon} size={14} />{pr.name}
						</button>
					{/each}
				</div>
			{/each}
		</div>

		<div class="row">
			<button
				class="btn"
				class:primary={mode === 'someday'}
				aria-pressed={mode === 'someday'}
				onclick={() => (mode = mode === 'someday' ? 'normal' : 'someday')}
			>
				<Icon name="archive" size={16} />{m.inbox.someday}
			</button>
			{#if mode === 'date'}
				<!-- svelte-ignore a11y_autofocus -->
				<input
					class="field"
					type="date"
					aria-label={m.inbox.setDate}
					autofocus
					onchange={(e) => setDate(e.currentTarget.value)}
				/>
			{:else}
				<button class="btn" onclick={() => (mode = 'date')}>
					<Icon name="calendar" size={16} />{m.inbox.setDate}
				</button>
			{/if}
			<button class="btn danger" onclick={remove}
				><Icon name="trash" size={16} />{m.inbox.delete}</button
			>
			<button class="btn ghost" onclick={skip}
				>{m.inbox.skip}<Icon name="chevron" size={16} /></button
			>
		</div>
		<p class="hint">{m.inbox.swipeHint}<br />{m.inbox.keyHint}</p>
	</section>
{:else if tasks.loaded}
	<div class="done">
		<p>{m.inbox.done}</p>
		<a class="btn" href={resolve('/inbox')}>{m.inbox.back}</a>
	</div>
{/if}

<style>
	header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 16px;
	}
	header .icon-btn :global(svg) {
		transform: rotate(180deg);
	}
	h1 {
		font-size: 24px;
		margin: 0;
		flex: 1;
	}
	.progress {
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}
	.card {
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: 16px;
		padding: 20px;
		box-shadow: var(--shadow);
		touch-action: pan-y;
		margin-bottom: 20px;
	}
	.card:global([data-swipe='left']) {
		border-color: var(--danger);
	}
	.card:global([data-swipe='right']) {
		border-color: var(--accent);
	}
	.title {
		width: 100%;
		font-size: 20px;
		font-weight: 600;
		border: 0;
		background: transparent;
		outline: none;
		padding: 0;
	}
	.notes {
		white-space: pre-wrap;
		color: var(--text-muted);
	}
	.meta {
		margin: 12px 0 0;
		font-size: 13px;
		color: var(--text-faint);
		display: flex;
		align-items: center;
		gap: 4px;
		flex-wrap: wrap;
	}
	.aged {
		color: var(--warn);
		font-weight: 600;
	}
	h2 {
		font-size: 14px;
		color: var(--text-muted);
		margin: 0 0 8px;
	}
	.pools,
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 12px;
	}
	.pools {
		flex-direction: column;
		align-items: stretch;
	}
	.pool-row {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
	}
	.pool {
		min-height: 44px;
	}
	.project {
		min-height: 36px;
		font-size: 14px;
		color: var(--text-muted);
	}
	kbd {
		font-size: 11px;
		color: var(--text-faint);
		font-family: inherit;
	}
	.hint {
		font-size: 12px;
		color: var(--text-faint);
	}
	@media (pointer: coarse) {
		kbd,
		.hint {
			display: none;
		}
	}
	.done {
		text-align: center;
		padding: 48px 0;
		font-size: 18px;
	}
</style>
