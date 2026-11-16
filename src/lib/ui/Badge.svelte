<script lang="ts">
	/** Kennzeichen eines Pools/Projekts: Icon in seiner Farbe, sonst farbiger Punkt. */
	import Icon, { isIconName } from './Icon.svelte';

	let { color, icon, size = 16 }: { color: string; icon?: string; size?: number } = $props();
</script>

<span class="badge" style:color style:width="{size}px" style:height="{size}px">
	{#if isIconName(icon)}
		<Icon name={icon} {size} />
	{:else}
		<span class="dot" style:background={color}></span>
	{/if}
</span>

<style>
	.badge {
		display: inline-grid;
		place-items: center;
		flex: none;
	}
	.dot {
		width: 60%;
		height: 60%;
		border-radius: 50%;
	}
</style>
