<script lang="ts">
	import { postponeOptions } from '#lib/domain/postpone.ts';
	import { addDaysIso, formatDateValue } from '#lib/domain/dates.ts';
	import { m } from '#lib/i18n/index.ts';
	import { ui } from '#lib/state/ui.svelte.ts';

	let { onpick, onclose }: { onpick: (date: string) => void; onclose: () => void } = $props();

	const options = $derived(postponeOptions(ui.now));
	let custom = $state('');
</script>

<div class="menu" role="menu" aria-label={m.task.postpone}>
	{#each options as o (o.id)}
		<button class="btn" role="menuitem" onclick={() => onpick(o.date)}>
			{o.label}
			<span class="hint">{formatDateValue({ date: o.date }, ui.now)}</span>
		</button>
	{/each}
	<label class="custom">
		<span class="sr-only">{m.postpone.custom}</span>
		<input
			class="field"
			type="date"
			min={addDaysIso(ui.now, 1)}
			bind:value={custom}
			aria-label={m.postpone.custom}
			onchange={() => custom && onpick(custom)}
		/>
	</label>
	<button class="icon-btn" aria-label={m.task.close} onclick={onclose}>✕</button>
</div>

<style>
	.menu {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
		padding: 8px;
		margin: 2px 0 6px;
		background: var(--bg-sunken);
		border-radius: var(--radius);
	}
	.hint {
		color: var(--text-muted);
		font-size: 13px;
	}
</style>
