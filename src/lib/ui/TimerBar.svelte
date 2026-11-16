<script lang="ts">
	/** Zeigt den laufenden Timer überall oben an: Aufgabe, Laufzeit, Stopp. */
	import { formatElapsed } from '#lib/domain/time.ts';
	import { m } from '#lib/i18n/index.ts';
	import { db } from '#lib/state/app.ts';
	import { live } from '#lib/state/live.svelte.ts';
	import { stopTimer, timer } from '#lib/state/timer.svelte.ts';
	import { ui } from '#lib/state/ui.svelte.ts';
	import Icon from './Icon.svelte';

	const task = live(() => {
		const id = timer.current?.taskId;
		return () => (id ? db.tasks.get(id) : undefined);
	}, undefined);
</script>

{#if timer.current}
	<div class="timer-bar" data-testid="timer-bar" role="status">
		<span class="pulse"></span>
		<button class="title" onclick={() => (ui.detailId = timer.current!.taskId)}>
			{task.current?.title || m.time.untitled}
		</button>
		<span class="elapsed" data-testid="timer-elapsed">{formatElapsed(timer.elapsed)}</span>
		<button class="btn" onclick={stopTimer}>
			<Icon name="stop" size={16} />{m.time.stop}
		</button>
	</div>
{/if}

<style>
	.timer-bar {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 12px 6px 16px;
		background: color-mix(in srgb, var(--accent) 14%, var(--bg-raised));
		border-bottom: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border));
	}
	.pulse {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--accent);
		animation: pulse 1.6s ease-in-out infinite;
		flex: none;
	}
	@keyframes pulse {
		50% {
			opacity: 0.3;
		}
	}
	.title {
		flex: 1;
		min-width: 0;
		text-align: left;
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.elapsed {
		font-variant-numeric: tabular-nums;
		font-weight: 600;
	}
	.btn {
		min-height: 30px;
	}
</style>
