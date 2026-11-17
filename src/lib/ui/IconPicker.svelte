<script lang="ts">
	/**
	 * Icon-Wahl für Pools und Projekte (ein Knopf, öffnet ein Raster).
	 */
	import { m } from '#lib/i18n/index.ts';
	import Icon, { isIconName, PICKER_ICONS } from './Icon.svelte';
	import Popover from './Popover.svelte';

	let {
		value,
		color,
		onchange
	}: { value?: string; color: string; onchange: (icon: string | undefined) => void } = $props();
	let open = $state(false);
</script>

<Popover bind:open label={m.picker.icon}>
	{#snippet trigger({ toggle })}
		<button
			type="button"
			class="current"
			style:color
			aria-label={m.picker.icon}
			title={m.picker.icon}
			onclick={toggle}
		>
			{#if isIconName(value)}<Icon name={value} />{:else}<span class="dot" style:background={color}
				></span>{/if}
		</button>
	{/snippet}
	{#snippet children({ close })}
		<div class="grid" role="radiogroup" aria-label={m.picker.icon}>
			<button
				type="button"
				role="radio"
				aria-checked={!value}
				aria-label={m.picker.noIcon}
				class:on={!value}
				onclick={() => {
					onchange(undefined);
					close();
				}}><span class="dot" style:background={color}></span></button
			>
			{#each PICKER_ICONS as name (name)}
				<button
					type="button"
					role="radio"
					aria-checked={value === name}
					aria-label={name}
					class:on={value === name}
					style:color
					onclick={() => {
						onchange(name);
						close();
					}}><Icon {name} /></button
				>
			{/each}
		</div>
	{/snippet}
</Popover>

<style>
	button {
		width: 34px;
		height: 34px;
		display: grid;
		place-items: center;
		border-radius: 8px;
		border: 1px solid transparent;
	}
	button:hover {
		background: var(--bg-hover);
	}
	.current {
		border-color: var(--border);
		background: var(--bg-raised);
	}
	.on {
		border-color: var(--text);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(5, 34px);
		gap: 4px;
	}
	.dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
	}
</style>
