<script lang="ts">
	/**
	 * Wochenrückblick (ohne KI): je Pool, was in den letzten 7 Tagen erledigt wurde,
	 * was oft verschoben wird, wie viel Zeit erfasst wurde. Bei eingeschalteter KI
	 * gibt es zusätzlich den KI-Rückblick für den Pool.
	 */
	import { format } from 'date-fns';
	import { de } from 'date-fns/locale';
	import { fromIsoDate } from '#lib/domain/dates.ts';
	import { formatDuration } from '#lib/domain/time.ts';
	import { buildWeek } from '#lib/domain/today.ts';
	import { m } from '#lib/i18n/index.ts';
	import { aiWeekReview } from '#lib/state/ai.svelte.ts';
	import { live } from '#lib/state/live.svelte.ts';
	import { q } from '#lib/state/queries.ts';
	import { timeSettings } from '#lib/state/time-settings.svelte.ts';
	import { ui } from '#lib/state/ui.svelte.ts';
	import Badge from '#lib/ui/Badge.svelte';
	import Icon from '#lib/ui/Icon.svelte';

	const pools = live(() => q.pools, []);
	const tasks = live(() => q.allTasks, []);

	const week = $derived(buildWeek(tasks.current, ui.now));
	const shown = $derived(
		pools.current
			.filter((p) => !p.archived)
			.map((p) => ({ pool: p, w: week.pools.find((w) => w.poolId === p.id) }))
			.filter(({ pool, w }) => pool.kind === 'pool' || (w && (w.done.length || w.created)))
	);
	const fmt = (iso: string) => format(fromIsoDate(iso), 'd. MMM', { locale: de });
	const MAX = 6;
</script>

<h1>{m.review.title}</h1>
<p class="range">{m.review.range(fmt(week.from), fmt(week.to))}</p>

{#each shown as { pool, w } (pool.id)}
	<section class="card pool" data-testid="review-pool">
		<header>
			<h2><Badge color={pool.color} icon={pool.icon} size={18} />{pool.name}</h2>
			{#if pool.kind === 'pool' && pool.settings.ai.enabled}
				<button class="btn ghost ai" onclick={() => aiWeekReview(pool)}>
					<Icon name="sparkle" size={16} />{m.review.ai}
				</button>
			{/if}
		</header>

		<div class="stats">
			<div class="stat">
				<span class="v">{w?.done.length ?? 0}</span><span class="k">{m.review.done}</span>
			</div>
			<div class="stat">
				<span class="v">{w?.created ?? 0}</span><span class="k">{m.review.created}</span>
			</div>
			{#if timeSettings.enabled}
				<div class="stat">
					<span class="v">{formatDuration(w?.minutes ?? 0)}</span><span class="k"
						>{m.review.time}</span
					>
				</div>
			{/if}
			<div class="stat" class:warn={(w?.postponed.length ?? 0) > 0}>
				<span class="v">{w?.postponed.length ?? 0}</span><span class="k">{m.review.postponed}</span>
			</div>
		</div>

		{#if w?.done.length}
			<h3>{m.review.done}</h3>
			<ul>
				{#each w.done.slice(0, MAX) as t (t.id)}
					<li>
						<button class="link" onclick={() => (ui.detailId = t.id)}>{t.title}</button>
						<span class="when">{format(t.completedAt ?? 0, 'EEE', { locale: de })}</span>
					</li>
				{/each}
				{#if w.done.length > MAX}<li class="more">{m.review.more(w.done.length - MAX)}</li>{/if}
			</ul>
		{/if}
		{#if w?.postponed.length}
			<h3>{m.review.postponed}</h3>
			<ul>
				{#each w.postponed.slice(0, MAX) as t (t.id)}
					<li>
						<button class="link" onclick={() => (ui.detailId = t.id)}>{t.title}</button>
						<span class="when warn">{m.review.times(t.postponeCount)}</span>
					</li>
				{/each}
				{#if w.postponed.length > MAX}<li class="more">
						{m.review.more(w.postponed.length - MAX)}
					</li>{/if}
			</ul>
		{/if}
		{#if !w || (!w.done.length && !w.postponed.length && !w.minutes && !w.created)}
			<p class="nothing">{m.review.nothing}</p>
		{/if}
	</section>
{/each}

<style>
	h1 {
		font-size: 1.5rem;
		margin: 0;
	}
	.range {
		margin: 2px 0 16px;
		color: var(--text-muted);
	}
	.pool {
		padding: 14px 16px;
		margin-bottom: var(--gap);
	}
	header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 10px;
	}
	h2 {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		font-size: 1.0625rem;
	}
	.ai {
		gap: 6px;
		color: var(--accent);
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
		gap: 8px;
	}
	.stat {
		display: flex;
		flex-direction: column;
		padding: 8px 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg);
	}
	.v {
		font-size: 1.25rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.k {
		font-size: 0.75rem;
		color: var(--text-muted);
	}
	.stat.warn .v {
		color: var(--warn);
	}
	h3 {
		margin: 14px 0 4px;
		font-size: 0.875rem;
		color: var(--text-muted);
		font-weight: 600;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 32px;
		border-top: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
	}
	li:first-child {
		border-top: 0;
	}
	.link {
		flex: 1;
		min-width: 0;
		text-align: left;
		color: var(--text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.link:hover {
		color: var(--accent);
	}
	.when {
		font-size: 0.75rem;
		color: var(--text-faint);
	}
	.when.warn {
		color: var(--warn);
	}
	.more {
		font-size: 0.8125rem;
		color: var(--text-faint);
	}
	.nothing {
		margin: 10px 0 0;
		color: var(--text-faint);
		font-size: 0.875rem;
	}
</style>
