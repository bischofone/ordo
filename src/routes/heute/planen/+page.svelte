<script lang="ts">
	/**
	 * Morgen-Ablauf (kurz, jeder Schritt überspringbar):
	 * 1. Überfälliges ansehen → 2. Inbox aufräumen → 3. Aufgaben für heute wählen → 4. fertig.
	 * Der Schritt steht in der Adresse (?schritt=2), damit das Aufräumen hierher zurückführt.
	 */
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { INBOX_ID } from '#lib/db/repo.ts';
	import { addDaysIso, todayIso } from '#lib/domain/dates.ts';
	import { explain, suggestNext } from '#lib/domain/next.ts';
	import { formatDuration, targetFor } from '#lib/domain/time.ts';
	import { buildToday, isPlannedFor } from '#lib/domain/today.ts';
	import { isOpen } from '#lib/domain/types.ts';
	import { m } from '#lib/i18n/index.ts';
	import { postpone } from '#lib/state/actions.ts';
	import { repo } from '#lib/state/app.ts';
	import { live } from '#lib/state/live.svelte.ts';
	import { markPlanned, planning, planToday, unplan } from '#lib/state/planning.svelte.ts';
	import { q } from '#lib/state/queries.ts';
	import { timeSettings } from '#lib/state/time-settings.svelte.ts';
	import { ui } from '#lib/state/ui.svelte.ts';
	import Icon from '#lib/ui/Icon.svelte';
	import PlanRow from '#lib/ui/PlanRow.svelte';

	const pools = live(() => q.pools, []);
	const projects = live(() => q.projects, []);
	const tasks = live(() => q.allTasks, []);

	const step = $derived(
		Math.min(3, Math.max(0, Number(page.url.searchParams.get('schritt')) || 0))
	);
	const go = (n: number) =>
		goto(resolve(`/heute/planen?schritt=${n}`), { replace: true, reset: false });

	const view = $derived(buildToday(tasks.current, ui.now));
	const inboxCount = $derived(
		tasks.current.filter(
			(t) => t.poolId === INBOX_ID && t.parentId === null && isOpen(t) && !t.deletedAt
		).length
	);

	// Vorschläge beim Auswählen: die Liste bleibt stehen, während man abhakt
	// (sonst würden eingeplante Aufgaben nach oben springen)
	let picks = $state.raw<ReturnType<typeof suggestNext>>([]);
	$effect(() => {
		if (step === 2 && tasks.loaded && !picks.length) {
			picks = suggestNext(
				tasks.current.filter((t) => t.poolId !== INBOX_ID),
				{ now: ui.now, weights: planning.current.weights },
				15
			);
		}
	});
	const fresh = (id: string) => tasks.current.find((t) => t.id === id);

	const today = $derived(todayIso(ui.now));
	const capacity = $derived.by(() => {
		const p = planning.current;
		if (p.capacityFor?.date === today) return p.capacityFor.minutes;
		const target = timeSettings.enabled ? targetFor(today, timeSettings.current) : 0;
		return target || p.capacity;
	});

	$effect(() => {
		if (step === 3 && planning.loaded && planning.current.plannedOn !== today) void markPlanned();
	});
</script>

<header class="head">
	<a class="icon-btn" href={resolve('/heute')} aria-label={m.planFlow.back}>
		<span class="flip"><Icon name="chevron" /></span>
	</a>
	<h1>{m.planFlow.title}</h1>
</header>

<ol class="steps" aria-label={m.planFlow.title}>
	{#each m.planFlow.steps as label, i (label)}
		<li class:on={i === step} class:past={i < step} aria-current={i === step ? 'step' : undefined}>
			<button onclick={() => go(i)}><span class="num">{i + 1}</span>{label}</button>
		</li>
	{/each}
</ol>

<section class="card body" data-testid="plan-step-{step}">
	{#if step === 0}
		<h2 class="card-heading">{m.planFlow.overdueTitle}</h2>
		{#if view.overdue.length}
			<p class="card-sub">{m.planFlow.overdueHint}</p>
			<div class="list">
				{#each view.overdue as it (it.task.id)}
					<PlanRow task={it.task} path={it.path} pools={pools.current} projects={projects.current}>
						{#snippet actions()}
							{#if isPlannedFor(it.task, ui.now)}
								<span class="ok"><Icon name="check" size={14} />{m.next.planned}</span>
							{:else}
								<button class="btn ghost small" onclick={() => planToday(it.task)}>
									{m.nav.today}
								</button>
							{/if}
							<button
								class="btn ghost small"
								onclick={() => postpone(it.task, addDaysIso(ui.now, 1), false)}
							>
								{m.today.tomorrow}
							</button>
							{#if it.task.parentId === null}
								<button
									class="btn ghost small"
									onclick={() => repo.updateTask(it.task.id, { someday: true })}
								>
									{m.planFlow.someday}
								</button>
							{/if}
						{/snippet}
					</PlanRow>
				{/each}
			</div>
		{:else}
			<p class="calm"><Icon name="check" size={18} />{m.planFlow.overdueNone}</p>
		{/if}
	{:else if step === 1}
		<h2 class="card-heading">{m.planFlow.inboxTitle}</h2>
		<p class="calm">{m.planFlow.inboxCount(inboxCount)}</p>
		{#if inboxCount}
			<a
				class="btn primary"
				href={resolve(`/inbox/aufraeumen?zurueck=${encodeURIComponent('/heute/planen?schritt=2')}`)}
			>
				<Icon name="broom" size={16} />{m.planFlow.inboxGo}
			</a>
		{/if}
	{:else if step === 2}
		<h2 class="card-heading">{m.planFlow.pickTitle}</h2>
		<p class="card-sub">{m.planFlow.pickHint}</p>
		<p class="sum" data-testid="plan-sum">
			{m.today.estimate(formatDuration(view.estimate), formatDuration(capacity))}
		</p>
		{#if picks.length}
			<div class="list">
				{#each picks as s (s.task.id)}
					{@const t = fresh(s.task.id) ?? s.task}
					{@const on = isPlannedFor(t, ui.now)}
					<PlanRow task={t} pools={pools.current} projects={projects.current} note={explain(s)}>
						{#snippet actions()}
							<label class="pick">
								<input
									type="checkbox"
									checked={on}
									aria-label="{m.today.addToday}: {t.title}"
									onchange={(e) => (e.currentTarget.checked ? planToday(t) : unplan(t))}
								/>
							</label>
						{/snippet}
					</PlanRow>
				{/each}
			</div>
		{:else}
			<p class="calm">{m.planFlow.pickNone}</p>
		{/if}
	{:else}
		<div class="finish">
			<span class="big"><Icon name="check" size={28} /></span>
			<h2 class="card-heading">{m.planFlow.doneTitle}</h2>
			<p class="calm">{m.planFlow.doneSummary(view.count, formatDuration(view.estimate))}</p>
		</div>
	{/if}
</section>

<footer class="nav">
	{#if step > 0 && step < 3}
		<button class="btn ghost" onclick={() => go(step - 1)}>{m.planFlow.back}</button>
	{/if}
	<span class="spacer"></span>
	{#if step < 3}
		<button class="btn primary" onclick={() => go(step + 1)}>
			{step === 1 && inboxCount ? m.planFlow.skip : m.planFlow.next}
		</button>
	{:else}
		<a class="btn primary" href={resolve('/heute')}>{m.planFlow.finish}</a>
	{/if}
</footer>

<style>
	.head {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 12px;
	}
	h1 {
		font-size: 1.5rem;
		margin: 0;
	}
	.flip {
		display: grid;
		transform: rotate(180deg);
	}
	.steps {
		display: flex;
		gap: 6px;
		list-style: none;
		padding: 0;
		margin: 0 0 12px;
		flex-wrap: wrap;
	}
	.steps button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 10px 4px 4px;
		border-radius: 20px;
		font-size: 0.875rem;
		color: var(--text-muted);
	}
	.num {
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: var(--bg-sunken);
		font-size: 0.75rem;
		font-weight: 600;
	}
	.steps .on button {
		color: var(--text);
		font-weight: 600;
	}
	.steps .on .num {
		background: var(--accent);
		color: var(--accent-contrast);
	}
	.steps .past .num {
		background: color-mix(in srgb, var(--accent) 25%, var(--bg-sunken));
	}
	.body {
		padding: 16px;
		margin-bottom: 12px;
		min-height: 180px;
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin: 10px -10px 0;
	}
	.calm {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--text-muted);
		margin: 12px 0;
	}
	.sum {
		margin: 8px 0 0;
		font-size: 0.875rem;
		font-variant-numeric: tabular-nums;
	}
	.btn.small {
		padding: 4px 8px;
		font-size: 0.8125rem;
		min-height: 30px;
	}
	.ok {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 0.8125rem;
		color: var(--ok);
		padding: 0 6px;
	}
	.pick {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		cursor: pointer;
	}
	.pick input {
		width: 20px;
		height: 20px;
		accent-color: var(--accent);
	}
	.finish {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: 16px 0;
	}
	.big {
		display: grid;
		place-items: center;
		width: 56px;
		height: 56px;
		border-radius: 50%;
		margin-bottom: 10px;
		color: var(--accent-contrast);
		background: var(--accent);
	}
	.nav {
		display: flex;
		gap: 8px;
	}
	.spacer {
		flex: 1;
	}
</style>
