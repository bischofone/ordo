<script lang="ts">
	/** Kleines Aufklapp-Fenster unter einem Auslöser. Schließt bei Klick daneben oder Escape. */
	import type { Snippet } from 'svelte';

	let {
		open = $bindable(false),
		label,
		trigger,
		children,
		align = 'start'
	}: {
		open?: boolean;
		label: string;
		trigger: Snippet<[{ toggle: () => void; open: boolean }]>;
		children: Snippet<[{ close: () => void }]>;
		align?: 'start' | 'end';
	} = $props();

	let root = $state<HTMLElement>();
	const close = () => (open = false);
	const toggle = () => (open = !open);

	function onpointerdown(e: PointerEvent) {
		if (open && root && !root.contains(e.target as Node)) close();
	}
</script>

<svelte:window {onpointerdown} onkeydown={(e) => open && e.key === 'Escape' && close()} />

<span class="popover-root" bind:this={root}>
	{@render trigger({ toggle, open })}
	{#if open}
		<div class="panel" class:end={align === 'end'} role="dialog" aria-label={label}>
			{@render children({ close })}
		</div>
	{/if}
</span>

<style>
	.popover-root {
		position: relative;
		display: inline-flex;
	}
	.panel {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		z-index: 45;
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: 12px;
		box-shadow: var(--shadow);
		padding: 10px;
		min-width: max-content;
	}
	.panel.end {
		left: auto;
		right: 0;
	}
</style>
