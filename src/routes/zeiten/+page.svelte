<script lang="ts">
	/** Auswertung der erfassten Zeiten: Tag, Woche oder Monat – auch rückblickend. */
	import { format } from 'date-fns';
	import { de } from 'date-fns/locale';
	import { fromIsoDate, todayIso } from '#lib/domain/dates.ts';
	import {
		buildBalance,
		buildReport,
		formatDuration,
		formatSigned,
		parseDuration,
		parseTotalInput,
		periodOf,
		shiftPeriod,
		type PeriodKind,
		type ReportEntry
	} from '#lib/domain/time.ts';
	import { m } from '#lib/i18n/index.ts';
	import { resolve } from '$app/paths';
	import { db, repo } from '#lib/state/app.ts';
	import { timeSettings } from '#lib/state/time-settings.svelte.ts';
	import { live } from '#lib/state/live.svelte.ts';
	import { q } from '#lib/state/queries.ts';
	import { ui } from '#lib/state/ui.svelte.ts';
	import type { Task } from '#lib/domain/types.ts';
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
	// Soll / gearbeitet / getrackt
	const workDays = live(() => () => db.workDays.toArray(), []);
	const balance = $derived(
		buildBalance(
			period.days,
			Object.fromEntries(report.byDay.map((d) => [d.date, d.minutes])),
			Object.fromEntries(workDays.current.map((w) => [w.date, w.minutes])),
			timeSettings.current,
			today
		)
	);
	const day = $derived(balance.days[0]);
	const scale = $derived(Math.max(1, balance.target, balance.worked, balance.tracked));
	const pct = (minutes: number) => Math.min(100, (minutes / scale) * 100);
	const rowLabel = (iso: string) =>
		format(fromIsoDate(iso), kind === 'month' ? 'EEEEEE d.' : 'EEEE', { locale: de });

	/** Tatsächliche Arbeitszeit eines Tages eintragen (leer oder 0 = Eintrag entfernen) */
	function setWorked(date: string, input: HTMLInputElement) {
		const before = balance.days.find((d) => d.date === date)?.worked ?? null;
		const parsed = parseTotalInput(input.value, before ?? 0);
		if (parsed !== null) void repo.setWorkDay(date, parsed);
		const shown = parsed ?? before;
		input.value = shown ? formatDuration(shown) : '';
	}

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

{#if timeSettings.loaded && !timeSettings.enabled}
	<p class="empty">
		{m.timeSettings.enableHint}
		<a class="link" href={resolve('/einstellungen')}>{m.nav.settings}</a>
	</p>
{/if}

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

	<div class="tiles">
		<div class="tile">
			<span class="k">{m.time.target}</span>
			<span class="v" data-testid="stat-target">{formatDuration(balance.target)}</span>
		</div>
		<div class="tile">
			<span class="k">{m.time.worked}</span>
			{#if kind === 'day'}
				<input
					class="field v worked"
					aria-label={m.time.workedFor(dayTitle(period.from))}
					title={m.time.workedHint}
					placeholder={m.time.workedPlaceholder}
					value={day.worked === null ? '' : formatDuration(day.worked)}
					onchange={(e) => setWorked(period.from, e.currentTarget)}
				/>
			{:else}
				<span class="v" data-testid="stat-worked">{formatDuration(balance.worked)}</span>
			{/if}
		</div>
		<div class="tile">
			<span class="k">{m.time.tracked}</span>
			<span class="v" data-testid="report-total">{formatDuration(balance.tracked)}</span>
		</div>
		<div class="tile" class:warn={balance.unassigned > 0} title={m.time.unassignedHint}>
			<span class="k">{m.time.unassigned}</span>
			<span class="v" data-testid="stat-unassigned">{formatDuration(balance.unassigned)}</span>
		</div>
		<div class="tile" class:warn={balance.missing > 0}>
			<span class="k">{m.time.missing}</span>
			<span class="v" data-testid="stat-missing">{formatDuration(balance.missing)}</span>
		</div>
		<div class="tile" title={m.time.saldoHint}>
			<span class="k">{m.time.saldo}</span>
			<span
				class="v"
				class:plus={balance.saldo > 0}
				class:minus={balance.saldo < 0}
				data-testid="stat-saldo">{formatSigned(balance.saldo)}</span
			>
		</div>
	</div>

	<!-- Balken: getrackt (kräftig) innerhalb von gearbeitet (blass), Strich = Soll -->
	<div class="meter" aria-hidden="true">
		<span class="worked" style:width="{pct(balance.worked)}%"></span>
		<span class="tracked" style:width="{pct(balance.tracked)}%"></span>
		{#if balance.target}<span class="mark" style:left="{pct(balance.target)}%"></span>{/if}
	</div>
	{#if kind === 'day' && day.worked === null}
		<p class="note">{m.time.notEntered}</p>
	{/if}

	{#if kind !== 'day'}
		<div class="table" role="table" data-testid="day-table">
			<div class="tr head" role="row">
				<span role="columnheader">{m.time.day}</span>
				<span role="columnheader">{m.time.target}</span>
				<span role="columnheader">{m.time.worked}</span>
				<span role="columnheader">{m.time.tracked}</span>
				<span role="columnheader" class="wide">{m.time.unassigned}</span>
			</div>
			{#each balance.days as d (d.date)}
				<div
					class="tr"
					class:today={d.date === today}
					class:off={!d.target && !d.tracked && d.worked === null}
					role="row"
					data-testid="day-row"
				>
					<span role="cell">
						<button
							class="daylink"
							onclick={() => {
								kind = 'day';
								anchor = d.date;
							}}>{rowLabel(d.date)}</button
						>
					</span>
					<span role="cell">{d.target ? formatDuration(d.target) : '–'}</span>
					<span role="cell">
						<input
							class="field worked"
							aria-label={m.time.workedFor(dayTitle(d.date))}
							placeholder={d.date <= today ? m.time.workedPlaceholder : ''}
							disabled={d.date > today}
							value={d.worked === null ? '' : formatDuration(d.worked)}
							onchange={(e) => setWorked(d.date, e.currentTarget)}
						/>
					</span>
					<span role="cell">{d.tracked ? formatDuration(d.tracked) : '–'}</span>
					<span role="cell" class="wide" class:warn={d.unassigned > 0}>
						{d.worked === null ? '' : formatDuration(d.unassigned)}
					</span>
				</div>
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
		<div class="rows">
			{#each report.byTask as t (t.task.id)}
				<div class="row">
					{@render taskName(t.task)}
					<span class="dur">{formatDuration(t.minutes)}</span>
				</div>
			{/each}
		</div>
	</section>

	<section class="card" data-testid="time-entries">
		<header><h2 class="card-title">{m.time.entries}</h2></header>
		{#each byDate as g (g.date)}
			<div class="date-head">
				<span>{dayTitle(g.date)}</span>
				<span class="day-total">{formatDuration(g.minutes)}</span>
			</div>
			<div class="rows">
				{#each g.entries as e (e.id)}
					<div class="row entry" data-testid="report-entry">
						{@render taskName(e.task)}
						<input
							class="field duration"
							aria-label={m.time.duration}
							value={formatDuration(e.minutes)}
							onchange={(ev) => changeDuration(e, ev.currentTarget)}
						/>
						<button
							class="icon-btn del"
							aria-label={m.time.deleteEntry}
							title={m.time.deleteEntry}
							onclick={() => repo.deleteTime(e.task.id, e.id)}
						>
							<Icon name="trash" size={15} />
						</button>
					</div>
				{/each}
			</div>
		{/each}
	</section>
{:else if tasks.loaded}
	<p class="empty">{m.time.empty}</p>
{/if}

{#snippet taskName(task: Task)}
	{@const owner = projectOf(task.projectId) ?? poolOf(task.poolId)}
	<button class="name" onclick={() => (ui.detailId = task.id)}>
		<span class="title">{task.title || m.time.untitled}</span>
		<span class="where">
			<Badge color={owner?.color ?? 'gray'} icon={owner?.icon} size={12} />
			{where(task.poolId, task.projectId)}
		</span>
	</button>
{/snippet}

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
	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
		gap: 8px;
	}
	.tile {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg);
		min-width: 0;
	}
	.tile .k {
		font-size: 0.75rem;
		color: var(--text-muted);
	}
	.tile .v {
		font-size: 1.25rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.tile.warn .v {
		color: var(--warn);
	}
	.v.plus {
		color: var(--ok);
	}
	.v.minus {
		color: var(--danger);
	}
	.tile input.v {
		width: 100%;
		min-height: 0;
		padding: 0 6px;
		margin: -1px -7px;
		width: calc(100% + 14px);
	}
	.worked::placeholder {
		font-weight: 400;
		font-size: 0.8125rem;
		color: var(--text-faint);
	}
	.meter {
		position: relative;
		height: 10px;
		margin: 12px 0 4px;
		border-radius: 5px;
		background: var(--bg-sunken);
		overflow: hidden;
	}
	.meter span {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 0;
	}
	.meter .worked {
		background: color-mix(in srgb, var(--accent) 35%, transparent);
	}
	.meter .tracked {
		background: var(--accent);
	}
	.meter .mark {
		width: 2px;
		margin-left: -1px;
		background: var(--text);
	}
	.note {
		margin: 6px 0 0;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}
	.table {
		margin-top: 12px;
	}
	.tr {
		display: grid;
		grid-template-columns: minmax(70px, 1.4fr) repeat(4, minmax(0, 1fr));
		align-items: center;
		gap: 8px;
		min-height: 36px;
		border-top: 1px solid var(--border);
		font-variant-numeric: tabular-nums;
	}
	.tr > * {
		text-align: right;
	}
	.tr > :first-child {
		text-align: left;
	}
	.tr.head {
		border-top: 0;
		min-height: 28px;
		font-size: 0.75rem;
		color: var(--text-muted);
	}
	.tr.off {
		color: var(--text-faint);
	}
	.tr.today .daylink {
		color: var(--accent);
		font-weight: 700;
	}
	.daylink:hover {
		text-decoration: underline;
	}
	.tr .field {
		width: 100%;
		max-width: 96px;
		min-height: 28px;
		padding: 2px 6px;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.tr .field[disabled] {
		border-color: transparent;
		background: transparent;
	}
	.tr .warn {
		color: var(--warn);
	}
	.link {
		color: var(--accent);
		text-decoration: underline;
	}
	@media (max-width: 520px) {
		.tr {
			grid-template-columns: minmax(56px, 1.2fr) repeat(3, minmax(0, 1fr));
		}
		.tr .wide {
			display: none;
		}
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
	.line .name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	/* Aufgaben-Zeilen: ruhig, ganze Zeile hebt sich beim Drüberfahren ab */
	.rows {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin: 0 -8px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 6px;
		min-height: 48px;
		padding: 0 8px 0 0;
		border-radius: var(--radius);
	}
	.row:hover,
	.row:focus-within {
		background: var(--bg-hover);
	}
	.row .name {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 1px;
		padding: 6px 8px;
		text-align: left;
		color: var(--text);
	}
	.row .name > span {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.title {
		font-size: 0.9375rem;
	}
	.where {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 0.75rem;
		color: var(--text-muted);
	}
	.row .dur {
		padding-right: 2px;
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
		align-items: baseline;
		margin-top: 14px;
		padding: 10px 0 4px;
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--text-muted);
		border-top: 1px solid var(--border);
	}
	header + .date-head {
		margin-top: 0;
		border-top: 0;
		padding-top: 2px;
	}
	.day-total {
		font-variant-numeric: tabular-nums;
		/* bündig mit der Dauer-Spalte darunter (Löschknopf 32px + Abstand 6px + Feld-Innenabstand 8px) */
		padding-right: 46px;
	}
	/* Dauer wirkt wie Text, wird erst beim Drüberfahren/Fokus zum Feld */
	.duration {
		width: 64px;
		min-height: 32px;
		padding: 2px 8px;
		text-align: right;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		border-color: transparent;
		background: transparent;
	}
	.row:hover .duration {
		border-color: var(--border);
	}
	.duration:focus {
		border-color: var(--accent);
		background: var(--bg-raised);
	}
	.del {
		color: var(--text-faint);
		opacity: 0;
	}
	.row:hover .del,
	.row:focus-within .del {
		opacity: 1;
	}
	.del:hover {
		color: var(--danger);
	}
	@media (hover: none) {
		.del {
			opacity: 1;
		}
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
