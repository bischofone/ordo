<script lang="ts">
	/** Einstellungen → Planung: verfügbare Zeit pro Tag und Gewichtungen für „Was als Nächstes?“. */
	import { DEFAULT_NEXT_WEIGHTS, type NextWeights } from '#lib/domain/next.ts';
	import { formatDuration, parseTotalInput } from '#lib/domain/time.ts';
	import { m } from '#lib/i18n/index.ts';
	import { planning, savePlanning } from '#lib/state/planning.svelte.ts';
	import Segmented from './Segmented.svelte';

	const p = $derived(planning.current);
	const keys = Object.keys(DEFAULT_NEXT_WEIGHTS) as (keyof NextWeights)[];

	function setCapacity(input: HTMLInputElement) {
		const v = parseTotalInput(input.value, p.capacity);
		if (v !== null && v > 0 && v !== p.capacity) void savePlanning({ capacity: v });
		input.value = formatDuration(v && v > 0 ? v : p.capacity);
	}
	const setWeight = (k: keyof NextWeights, v: string) =>
		savePlanning({ weights: { ...p.weights, [k]: Number(v) } });
</script>

<section class="card" data-testid="planning-settings">
	<header>
		<h2 class="card-heading">{m.planningSettings.title}</h2>
		<p class="card-sub">{m.planningSettings.hint}</p>
	</header>
	{#if planning.loaded}
		<label class="line">
			<span>
				{m.planningSettings.capacity}
				<small>{m.planningSettings.capacityHint}</small>
			</span>
			<input
				class="field small"
				aria-label={m.planningSettings.capacity}
				value={formatDuration(p.capacity)}
				onchange={(e) => setCapacity(e.currentTarget)}
			/>
		</label>

		<div class="block">
			<span class="label">
				{m.planningSettings.weights}
				<small>{m.planningSettings.weightsHint}</small>
			</span>
			{#each keys as k (k)}
				<div class="weight">
					<span>{m.planningSettings.weightNames[k]}</span>
					<Segmented
						label={m.planningSettings.weightNames[k]}
						value={String(p.weights[k])}
						options={m.planningSettings.levels}
						onchange={(v) => setWeight(k, v)}
					/>
				</div>
			{/each}
			<button
				class="btn ghost reset"
				onclick={() => savePlanning({ weights: DEFAULT_NEXT_WEIGHTS })}
			>
				{m.planningSettings.reset}
			</button>
		</div>
	{/if}
</section>

<style>
	section {
		margin-bottom: var(--gap);
		padding: 14px 16px;
	}
	header {
		margin-bottom: 10px;
	}
	.line {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
		min-height: 44px;
		padding: 6px 0;
	}
	.line > span {
		flex: 1 1 200px;
	}
	small {
		display: block;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}
	.small {
		width: 80px;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.block {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding-top: 10px;
		border-top: 1px solid var(--border);
	}
	.label {
		margin-bottom: 4px;
	}
	.weight {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 6px 12px;
		min-height: 40px;
		border-top: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
	}
	.weight:first-of-type {
		border-top: 0;
	}
	.weight > span {
		font-size: 0.9375rem;
	}
	.reset {
		align-self: flex-end;
		margin-top: 4px;
	}
</style>
