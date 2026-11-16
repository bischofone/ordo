<script lang="ts">
	import { drag } from './drag.svelte';
</script>

{#if drag.indicator}
	<div
		class="indicator"
		data-testid="drop-indicator"
		style:top="{drag.indicator.top - 1}px"
		style:left="{drag.indicator.left}px"
		style:width="{drag.indicator.width}px"
	></div>
{/if}
{#if drag.ghost}
	<div class="ghost" style:transform="translate({drag.ghost.x + 12}px, {drag.ghost.y - 14}px)">
		{drag.ghost.title || '…'}
	</div>
{/if}

<style>
	.indicator {
		position: fixed;
		height: 3px;
		border-radius: 2px;
		background: var(--accent);
		z-index: 70;
		pointer-events: none;
	}
	.indicator::before {
		content: '';
		position: absolute;
		left: -5px;
		top: -3px;
		width: 9px;
		height: 9px;
		border-radius: 50%;
		border: 2px solid var(--accent);
		background: var(--bg);
	}
	.ghost {
		position: fixed;
		left: 0;
		top: 0;
		z-index: 71;
		pointer-events: none;
		max-width: 260px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		padding: 6px 12px;
		border-radius: 8px;
		background: var(--bg-raised);
		border: 1px solid var(--accent);
		box-shadow: var(--shadow);
		font-size: 14px;
	}
	:global(body.is-dragging) {
		cursor: grabbing;
		user-select: none;
		-webkit-user-select: none;
	}
</style>
