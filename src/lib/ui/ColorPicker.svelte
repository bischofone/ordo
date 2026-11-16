<script lang="ts">
	import { POOL_COLORS } from '#lib/domain/types.ts';
	import { m } from '#lib/i18n/index.ts';
	import Popover from './Popover.svelte';

	let { value, onchange }: { value: string; onchange: (color: string) => void } = $props();
	let open = $state(false);
</script>

<Popover bind:open label={m.picker.color}>
	{#snippet trigger({ toggle })}
		<button
			type="button"
			class="swatch current"
			style:background={value}
			aria-label={m.picker.color}
			title={m.picker.color}
			onclick={toggle}
		></button>
	{/snippet}
	{#snippet children({ close })}
		<div class="grid" role="radiogroup" aria-label={m.picker.color}>
			{#each POOL_COLORS as c (c)}
				<button
					type="button"
					role="radio"
					aria-checked={value === c}
					aria-label={c}
					class="swatch"
					class:on={value === c}
					style:background={c}
					onclick={() => {
						onchange(c);
						close();
					}}
				></button>
			{/each}
		</div>
		<label class="custom">
			<input type="color" {value} onchange={(e) => onchange(e.currentTarget.value)} />
			{m.picker.customColor}
		</label>
	{/snippet}
</Popover>

<style>
	.swatch {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		border: 2px solid transparent;
		flex: none;
	}
	.swatch.current {
		width: 28px;
		height: 28px;
		box-shadow: 0 0 0 1px var(--border);
	}
	.swatch.on {
		border-color: var(--text);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(6, 24px);
		gap: 8px;
	}
	.custom {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 10px;
		font-size: 0.8125rem;
		color: var(--text-muted);
		cursor: pointer;
	}
	.custom input {
		width: 28px;
		height: 24px;
		padding: 0;
		border: 0;
		background: none;
	}
</style>
