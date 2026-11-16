<script lang="ts">
	/** Auswertung der erfassten Zeiten: Tag, Woche oder Monat – auch rückblickend. */
	import { format } from 'date-fns';
	import { de } from 'date-fns/locale';
	import { fromIsoDate, todayIso } from '#lib/domain/dates.ts';
	import {
		buildReport,
		formatDuration,
		parseDuration,
		periodOf,
		shiftPeriod,
		type PeriodKind,
		type ReportEntry
	} from '#lib/domain/time.ts';
	import { m } from '#lib/i18n/index.ts';
	import { repo } from '#lib/state/app.ts';
	import { live } from '#lib/state/live.svelte.ts';
	import { q } from '#lib/state/queries.ts';
	import { ui } from '#lib/state/ui.svelte.ts';
	import Badge from '#lib/ui/Badge.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Segmented from '#lib/ui/Segmented.svelte';

	const pools = live(() => q.pools, []);
	const projects = live(() => q.projects, []);
	const tasks = live(() => q.allTasks, []);

	let kind = $state<PeriodKind>('week');
	let anchor = $state(todayIso(new Date()));
	let selectedPools = $state<string[]>([]);

	const today = $derived(todayIso(ui.now));
	const period = $derived(periodOf(kind, anchor));
	const report = $derived(buildReport(tasks.current, period, selectedPools));
	const maxDay = $derived(Math.max(1, ...report.byDay.map((d) => d.minutes)));

	const usedPools = $derived(
		pools.current.filter((p) =>
			tasks.current.some((t) => t.poolId === p.id && t.timeEntries?.length)
		)
	);
	const poolOf = (id: string) => pools.current.find((p) => p.id === id);
	const projectOf = (id: string | null) => projects.current.find((p) => p.id === id);
	const where = (poolId: string, projectId: string | null) => {
		const project = projectOf(projectId);
		return project
			? `${poolOf(poolId)?.name ?? ''} › ${project.name}`
			: (poolOf(poolId)?.name ?? '');
	};

	const periodOptions = (Object.entries(m.time.periods) as [PeriodKind, string][]).map(
		([value, label]) => ({ value, label })
	);

	const dayLabel = (iso: string) =>
		format(fromIsoDate(iso), kind === 'month' ? 'd.' : 'EEEEEE', { locale: de });
	const dayTitle = (iso: string) => format(fromIsoDate(iso), 'EEEE, d. MMMM', { locale: de });

	/** Einträge nach Tag gruppiert (neueste zuerst) */
	const byDate = $derived.by(() => {
		const groups: { date: string; minutes: number; entries: ReportEntry[] }[] = [];
		for (const e of report.entries) {
			let g = groups.at(-1);
			if (!g || g.date !== e.date) groups.push((g = { date: e.date, minutes: 0, entries: [] }));
			g.entries.push(e);
			g.minutes += e.minutes;
		}
		return groups;
	});

	function togglePool(id: string) {
		selectedPools = selectedPools.includes(id)
			? selectedPools.filter((p) => p !== id)
			: [...selectedPools, id];
	}

	function changeDuration(e: ReportEntry, input: HTMLInputElement) {
		const parsed = parseDuration(input.value);
		if (parsed) void repo.updateTime(e.task.id, e.id, { minutes: parsed });
		input.value = formatDuration(parsed ?? e.minutes);
	}
</script>

<h1>{m.time.title}</h1>

<div class="controls">
	<Segmented
		label={m.time.period}
		value={kind}
		options={periodOptions}
		onchange={(k) => (kind = k)}
	/>
	<div class="nav">
		<button
			class="icon-btn"
			aria-label={m.time.prev}
			title={m.time.prev}
			onclick={() => (anchor = shiftPeriod(kind, anchor, -1))}
		>
			<span class="flip"><Icon name="chevron" /></span>
		</button>
		<span class="label" data-testid="period-label">{period.label}</span>
		<button
			class="icon-btn"
			aria-label={m.time.next}
			title={m.time.next}
			disabled={period.to >= today}
			onclick={() => (anchor = shiftPeriod(kind, anchor, 1))}
		>
			<Icon name="chevron" />
		</button>
		{#if !(today >= period.from && today <= period.to)}
			<button class="btn ghost" onclick={() => (anchor = today)}>{m.time.today}</button>
		{/if}
	</div>
</div>

{#if usedPools.length > 1}
	<div class="filter" role="group" aria-label={m.all.filter}>
		{#each usedPools as p (p.id)}
			<button
				class="chip"
				class:on={selectedPools.includes(p.id)}
				aria-pressed={selectedPools.includes(p.id)}
				onclick={() => togglePool(p.id)}
			>
				<Badge color={p.color} icon={p.icon} size={14} />{p.name}
			</button>
		{/each}
	</div>
{/if}

<section class="card" data-testid="time-overview">
	<header>
		<h2 class="card-title">{m.time.overview}</h2>
	</header>
	<p class="big">
		<span data-testid="report-total">{formatDuration(report.total)}</span>
		<small>{m.time.hours}</small>
	</p>
	{#if kind !== 'day'}
		<div class="bars" class:month={kind === 'month'}>
			{#each report.byDay as d (d.date)}
				<button
					class="bar"
					class:today={d.date === today}
					title="{dayTitle(d.date)}: {formatDuration(d.minutes)}"
					aria-label="{dayTitle(d.date)}: {formatDuration(d.minutes)}"
					onclick={() => {
						kind = 'day';
						anchor = d.date;
					}}
				>
					<span class="value">{d.minutes ? formatDuration(d.minutes) : ''}</span>
					<span class="fill" style:height="{(d.minutes / maxDay) * 100}%"></span>
					<span class="day">{dayLabel(d.date)}</span>
				</button>
			{/each}
		</div>
	{/if}
</section>

{#if report.total}
	<section class="card" data-testid="time-groups">
		<header><h2 class="card-title">{m.time.byGroup}</h2></header>
		{#each report.byGroup as g (`${g.poolId}|${g.projectId}`)}
			{@const owner = projectOf(g.projectId) ?? poolOf(g.poolId)}
			<div class="line">
				<Badge color={owner?.color ?? 'gray'} icon={owner?.icon} />
				<span class="name">{where(g.poolId, g.projectId)}</span>
				<span class="share"><span style:width="{(g.minutes / report.total) * 100}%"></span></span>
				<span class="dur">{formatDuration(g.minutes)}</span>
			</div>
		{/each}
	</section>

	<section class="card" data-testid="time-tasks">
		<header><h2 class="card-title">{m.time.byTask}</h2></header>
		{#each report.byTask as t (t.task.id)}
			<div class="line">
				<button class="name link" onclick={() => (ui.detailId = t.task.id)}>
					{t.task.title || m.time.untitled}
					<small>{where(t.task.poolId, t.task.projectId)}</small>
				</button>
				<span class="dur">{formatDuration(t.minutes)}</span>
			</div>
		{/each}
	</section>

	<section class="card" data-testid="time-entries">
		<header><h2 class="card-title">{m.time.entries}</h2></header>
		{#each byDate as g (g.date)}
			<div class="date-head">
				<span>{dayTitle(g.date)}</span>
				<span class="dur">{formatDuration(g.minutes)}</span>
			</div>
			{#each g.entries as e (e.id)}
				<div class="line entry" data-testid="report-entry">
					<button class="name link" onclick={() => (ui.detailId = e.task.id)}>
						{e.task.title || m.time.untitled}
						<small>{where(e.task.poolId, e.task.projectId)}</small>
					</button>
					<input
						class="field duration"
						aria-label={m.time.duration}
						value={formatDuration(e.minutes)}
						onchange={(ev) => changeDuration(e, ev.currentTarget)}
					/>
					<button
						class="icon-btn"
						aria-label={m.time.deleteEntry}
						title={m.time.deleteEntry}
						onclick={() => repo.deleteTime(e.task.id, e.id)}
					>
						<Icon name="trash" size={15} />
					</button>
				</div>
			{/each}
		{/each}
	</section>
{:else if tasks.loaded}
	<p class="empty">{m.time.empty}</p>
{/if}

<style>
	h1 {
		font-size: 1.5rem;
		margin: 0 0 12px;
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 16px;
		margin-bottom: 12px;
	}
	.nav {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.label {
		font-weight: 600;
		min-width: 12ch;
		text-align: center;
	}
	.flip {
		display: grid;
		transform: rotate(180deg);
	}
	.icon-btn[disabled] {
		opacity: 0.3;
		cursor: default;
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
	section {
		padding: 14px 16px;
		margin-bottom: var(--gap);
	}
	header {
		margin-bottom: 6px;
	}
	.big {
		margin: 0 0 4px;
		font-size: 2rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.big small {
		font-size: 0.875rem;
		font-weight: 400;
		color: var(--text-muted);
	}
	.bars {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 1fr;
		gap: 6px;
		height: 150px;
		margin-top: 8px;
	}
	.bars.month {
		gap: 2px;
	}
	.bar {
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		align-items: center;
		gap: 4px;
		min-width: 0;
		border-radius: 6px;
	}
	.bar:hover {
		background: var(--bg-hover);
	}
	.fill {
		width: 100%;
		max-width: 56px;
		min-height: 2px;
		border-radius: 4px 4px 0 0;
		background: color-mix(in srgb, var(--accent) 65%, transparent);
	}
	.bar.today .fill {
		background: var(--accent);
	}
	.value {
		font-size: 0.6875rem;
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}
	.month .value {
		display: none;
	}
	.day {
		font-size: 0.75rem;
		color: var(--text-muted);
	}
	.bar.today .day {
		color: var(--accent);
		font-weight: 700;
	}
	.month .day {
		font-size: 0.625rem;
	}
	.line {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 40px;
		border-top: 1px solid var(--border);
	}
	header + .line {
		border-top: 0;
	}
	.name {
		flex: 1;
		min-width: 0;
		text-align: left;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.name small {
		display: block;
		font-size: 0.75rem;
		color: var(--text-muted);
	}
	.link:hover {
		color: var(--accent);
	}
	.share {
		flex: 0 1 140px;
		height: 6px;
		border-radius: 3px;
		background: var(--bg-sunken);
		overflow: hidden;
	}
	.share span {
		display: block;
		height: 100%;
		background: var(--accent);
	}
	.dur {
		font-variant-numeric: tabular-nums;
		font-weight: 600;
		min-width: 5ch;
		text-align: right;
	}
	.date-head {
		display: flex;
		justify-content: space-between;
		padding: 12px 0 4px;
		font-size: 0.8125rem;
		color: var(--text-muted);
		border-top: 1px solid var(--border);
	}
	header + .date-head {
		border-top: 0;
		padding-top: 4px;
	}
	.entry {
		border-top: 0;
	}
	.duration {
		width: 72px;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.empty {
		color: var(--text-muted);
	}
	@media (max-width: 520px) {
		.share {
			display: none;
		}
	}
</style>
