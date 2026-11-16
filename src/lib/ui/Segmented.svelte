<script lang="ts" generics="T extends string">
	/** Umschalter mit wenigen Möglichkeiten nebeneinander (genau eine ist aktiv). */
	let {
		value,
		options,
		label,
		onchange
	}: {
		value: T;
		options: { value: T; label: string }[];
		label: string;
		onchange: (value: T) => void;
	} = $props();
</script>

<div class="segmented" role="radiogroup" aria-label={label}>
	{#each options as o (o.value)}
		<button
			type="button"
			role="radio"
			aria-checked={value === o.value}
			class:on={value === o.value}
			onclick={() => onchange(o.value)}>{o.label}</button
		>
	{/each}
</div>

<style>
	.segmented {
		display: inline-flex;
		padding: 3px;
		gap: 2px;
		border-radius: 10px;
		background: var(--bg-sunken);
		border: 1px solid var(--border);
	}
	button {
		min-height: 30px;
		padding: 0 12px;
		border-radius: 7px;
		font-size: 0.875rem;
		color: var(--text-muted);
	}
	button:hover {
		color: var(--text);
	}
	button.on {
		background: var(--bg-raised);
		color: var(--text);
		font-weight: 600;
		box-shadow: var(--shadow-card);
	}
</style>
