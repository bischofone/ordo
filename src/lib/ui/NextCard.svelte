<script lang="ts">
	/**
	 * „Was als Nächstes?“ – die besten offenen Aufgaben aus allen Pools mit Begründung.
	 * Optional: „Ich habe X Minuten“ und „Energie niedrig/mittel/hoch“. Inbox-Einträge zählen
	 * nicht mit (die werden erst einsortiert).
	 */
	import { INBOX_ID } from '#lib/db/repo.ts';
	import { explain, suggestNext } from '#lib/domain/next.ts';
	import { isPlannedFor } from '#lib/domain/today.ts';
	import type { Energy, Pool, Project, Task } from '#lib/domain/types.ts';
	import { m } from '#lib/i18n/index.ts';
	import { planning, planToday } from '#lib/state/planning.svelte.ts';
	import { ui } from '#lib/state/ui.svelte.ts';
	import Icon from './Icon.svelte';
	import PlanRow from './PlanRow.svelte';
	import Segmented from './Segmented.svelte';

	let {
		tasks,
		pools,
		projects,
		limit = 5,
		exclude = []
	}: {
		tasks: Task[];
		pools: Pool[];
		projects: Project[];
		limit?: number;
		/** Diese Aufgaben nicht vorschlagen (z. B. weil sie schon darüber stehen) */
		exclude?: string[];
	} = $props();

	let minutes = $state('');
	let energy = $state<'' | Energy>('');

	// Bewertet wird über alle Aufgaben (wichtig für „blockiert“ / „hat Unteraufgaben“),
	// ausgeblendet wird erst danach.
	const suggestions = $derived.by(() => {
		const skip = new Set(exclude);
		return suggestNext(
			tasks.filter((t) => t.poolId !== INBOX_ID),
			{
				now: ui.now,
				minutes: minutes ? Number(minutes) : undefined,
				energy: energy || undefined,
				weights: planning.current.weights
			},
			limit + skip.size
		)
			.filter((s) => !skip.has(s.task.id))
			.slice(0, limit);
	});
</script>

<section class="card next" data-testid="next-card">
	<header>
		<h2 class="card-heading">{m.next.title}</h2>
		<p class="card-sub">{m.next.hint}</p>
	</header>

	<div class="filters">
		<span class="filter">
			<span class="lbl">{m.next.minutes}</span>
			<Segmented
				label={m.next.minutes}
				value={minutes}
				options={m.next.minutesOptions}
				onchange={(v) => (minutes = v)}
			/>
		</span>
		<span class="filter">
			<span class="lbl">{m.next.energy}</span>
			<Segmented
				label={m.next.energy}
				value={energy}
				options={[
					{ value: '', label: m.next.energyAny },
					{ value: 'low', label: m.task.energyLevels.low },
					{ value: 'mid', label: m.task.energyLevels.mid },
					{ value: 'high', label: m.task.energyLevels.high }
				]}
				onchange={(v) => (energy = v as '' | Energy)}
			/>
		</span>
	</div>

	{#if suggestions.length}
		<div class="list">
			{#each suggestions as s (s.task.id)}
				<PlanRow task={s.task} {pools} {projects} note={explain(s)}>
					{#snippet actions()}
						{#if isPlannedFor(s.task, ui.now)}
							<span class="planned"><Icon name="check" size={14} />{m.next.planned}</span>
						{:else}
							<button class="btn ghost small" onclick={() => planToday(s.task)}>
								<Icon name="plus" size={14} />{m.next.start}
							</button>
						{/if}
					{/snippet}
				</PlanRow>
			{/each}
		</div>
	{:else}
		<p class="none">{m.next.none}</p>
	{/if}
</section>

<style>
	.next {
		padding: 14px 16px;
		margin-bottom: var(--gap);
	}
	header {
		margin-bottom: 10px;
	}
	.filters {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 20px;
		margin-bottom: 8px;
	}
	.filter {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.lbl {
		font-size: 0.8125rem;
		color: var(--text-muted);
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin: 0 -10px;
	}
	.btn.small {
		gap: 4px;
		padding: 4px 10px;
		font-size: 0.8125rem;
		min-height: 30px;
	}
	.planned {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 0.8125rem;
		color: var(--ok);
		padding: 0 8px;
	}
	.none {
		color: var(--text-muted);
		margin: 8px 0 0;
	}
</style>
