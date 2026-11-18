<script lang="ts">
	/**
	 * Heute: Überfälliges, für heute Geplantes (inkl. Liegengebliebenem) über alle Pools,
	 * geschätzte Zeit gegenüber verfügbarer Zeit, „Was als Nächstes?“ und der Weg zum Morgen-Ablauf.
	 */
	import { resolve } from '$app/paths';
	import { format } from 'date-fns';
	import { de } from 'date-fns/locale';
	import { todayIso } from '#lib/domain/dates.ts';
	import { formatDuration, parseTotalInput, targetFor } from '#lib/domain/time.ts';
	import { buildToday } from '#lib/domain/today.ts';
	import { m } from '#lib/i18n/index.ts';
	import { live } from '#lib/state/live.svelte.ts';
	import { planning, savePlanning, unplan } from '#lib/state/planning.svelte.ts';
	import { q } from '#lib/state/queries.ts';
	import { timeSettings } from '#lib/state/time-settings.svelte.ts';
	import { ui } from '#lib/state/ui.svelte.ts';
	import Icon from '#lib/ui/Icon.svelte';
	import NextCard from '#lib/ui/NextCard.svelte';
	import PlanRow from '#lib/ui/PlanRow.svelte';

	const pools = live(() => q.pools, []);
	const projects = live(() => q.projects, []);
	const tasks = live(() => q.allTasks, []);

	const view = $derived(buildToday(tasks.current, ui.now));
	const today = $derived(todayIso(ui.now));

	/** Verfügbare Zeit: für heute gesetzt > Soll-Zeit (Zeiterfassung) > Vorgabe */
	const capacity = $derived.by(() => {
		const p = planning.current;
		if (p.capacityFor?.date === today) return p.capacityFor.minutes;
		const target = timeSettings.enabled ? targetFor(today, timeSettings.current) : 0;
		return target || p.capacity;
	});
	const over = $derived(Math.max(0, view.estimate - capacity));
	const pct = $derived(capacity ? Math.min(100, (view.estimate / capacity) * 100) : 0);

	function setCapacity(input: HTMLInputElement) {
		const v = parseTotalInput(input.value, capacity);
		if (v !== null && v !== capacity)
			void savePlanning({ capacityFor: { date: today, minutes: v } });
		input.value = formatDuration(v ?? capacity);
	}

	let hideBanner = $state(false);
	const showPlanBanner = $derived(
		planning.loaded && planning.current.plannedOn !== today && !hideBanner
	);
</script>

<header class="head">
	<div>
		<h1>{m.today.title}</h1>
		<p class="date">{format(ui.now, 'EEEE, d. MMMM', { locale: de })}</p>
	</div>
	<span class="spacer"></span>
	<a class="btn ghost" href={resolve('/rueckblick')}
		><Icon name="chart" size={16} />{m.today.review}</a
	>
	{#if !showPlanBanner}
		<a class="btn" href={resolve('/heute/planen')}>
			<Icon name="calendar" size={16} />{planning.current.plannedOn === today
				? m.today.replan
				: m.today.planDay}
		</a>
	{/if}
</header>

{#if showPlanBanner}
	<div class="banner" role="status" data-testid="plan-banner">
		<Icon name="calendar" size={18} />
		<span>{m.today.planDayHint}</span>
		<a class="btn primary" href={resolve('/heute/planen')}>{m.today.planDay}</a>
		<button
			class="icon-btn"
			aria-label={m.today.dismiss}
			title={m.today.dismiss}
			onclick={() => (hideBanner = true)}><Icon name="x" size={16} /></button
		>
	</div>
{/if}

<section class="card capacity" data-testid="capacity">
	<div class="cap-line">
		<span>
			{m.today.estimate(formatDuration(view.estimate), formatDuration(capacity))}
			{#if view.unestimated}<span class="muted">
					· {m.today.unestimated(view.unestimated)}</span
				>{/if}
		</span>
		<label class="avail">
			<span>{m.today.available}</span>
			<input
				class="field"
				aria-label={m.today.available}
				title={m.today.availableHint}
				value={formatDuration(capacity)}
				onchange={(e) => setCapacity(e.currentTarget)}
			/>
		</label>
	</div>
	<div class="meter" class:over={over > 0} aria-hidden="true">
		<span style:width="{pct}%"></span>
	</div>
	{#if over}<p class="warn">{m.today.over(formatDuration(over))}</p>{/if}
</section>

{#if view.overdue.length}
	<section class="card group" data-testid="today-overdue">
		<h2 class="card-title late">{m.today.overdue}</h2>
		{#each view.overdue as it (it.task.id)}
			<PlanRow task={it.task} path={it.path} pools={pools.current} projects={projects.current} />
		{/each}
	</section>
{/if}

<section class="card group" data-testid="today-list">
	<h2 class="card-title">{m.today.planned}</h2>
	{#each view.today as it (it.task.id)}
		<PlanRow
			task={it.task}
			path={it.path}
			pools={pools.current}
			projects={projects.current}
			note={it.carriedOver ? m.today.carried(it.carriedOver) : undefined}
		>
			{#snippet actions()}
				{#if it.task.scheduled}
					<button
						class="icon-btn"
						aria-label={m.today.removeToday}
						title={m.today.removeToday}
						onclick={() => unplan(it.task)}><Icon name="x" size={16} /></button
					>
				{/if}
			{/snippet}
		</PlanRow>
	{:else}
		<p class="empty">{m.today.empty}<br /><small>{m.today.emptyHint}</small></p>
	{/each}
	{#if view.done.length}
		<details class="done">
			<summary>{m.today.doneToday(view.done.length)}</summary>
			{#each view.done as t (t.id)}
				<PlanRow task={t} pools={pools.current} projects={projects.current} />
			{/each}
		</details>
	{/if}
</section>

<NextCard
	tasks={tasks.current}
	pools={pools.current}
	projects={projects.current}
	exclude={[...view.overdue, ...view.today].map((i) => i.task.id)}
/>

<style>
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin-bottom: 14px;
	}
	h1 {
		font-size: 1.5rem;
		margin: 0;
	}
	.date {
		margin: 2px 0 0;
		color: var(--text-muted);
	}
	.spacer {
		flex: 1;
	}
	.head .btn {
		gap: 6px;
	}
	.banner {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		margin-bottom: var(--gap);
		border-radius: var(--radius-card);
		background: color-mix(in srgb, var(--accent) 12%, var(--bg-raised));
		color: var(--text);
	}
	.banner span {
		flex: 1 1 240px;
	}
	.capacity {
		padding: 12px 16px;
		margin-bottom: var(--gap);
	}
	.cap-line {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px 16px;
		font-variant-numeric: tabular-nums;
	}
	.muted {
		color: var(--text-muted);
	}
	.avail {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}
	.avail .field {
		width: 72px;
		text-align: right;
		font-variant-numeric: tabular-nums;
		color: var(--text);
	}
	.meter {
		height: 8px;
		margin-top: 10px;
		border-radius: 4px;
		background: var(--bg-sunken);
		overflow: hidden;
	}
	.meter span {
		display: block;
		height: 100%;
		background: var(--accent);
		transition: width 200ms;
	}
	.meter.over span {
		background: var(--warn);
	}
	.warn {
		margin: 6px 0 0;
		font-size: 0.8125rem;
		color: var(--warn);
	}
	.group {
		padding: 12px 6px 8px;
		margin-bottom: var(--gap);
	}
	.group > h2 {
		padding: 0 10px 6px;
	}
	.late {
		color: var(--danger);
	}
	.empty {
		margin: 8px 10px;
		color: var(--text-muted);
	}
	.empty small {
		color: var(--text-faint);
	}
	.done {
		margin-top: 6px;
		padding: 0 4px;
	}
	.done summary {
		cursor: pointer;
		padding: 6px;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}
</style>
