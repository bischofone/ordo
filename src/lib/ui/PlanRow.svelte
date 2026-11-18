<script lang="ts">
	/**
	 * Eine Aufgabe in „Heute“, im Morgen-Ablauf und bei „Was als Nächstes?“ – über Pools hinweg:
	 * Häkchen, Titel (Klick öffnet die Details), Pool/Projekt, Grund oder Termin, Aktionen.
	 */
	import type { Snippet } from 'svelte';
	import { addDaysIso, daysFromToday, formatDateValue } from '#lib/domain/dates.ts';
	import { formatDuration } from '#lib/domain/time.ts';
	import { isDone, type Pool, type Project, type Task } from '#lib/domain/types.ts';
	import { m } from '#lib/i18n/index.ts';
	import { postpone, toggleDone } from '#lib/state/actions.ts';
	import { ui } from '#lib/state/ui.svelte.ts';
	import Badge from './Badge.svelte';
	import Icon from './Icon.svelte';

	let {
		task,
		pools,
		projects,
		path = [],
		note,
		actions
	}: {
		task: Task;
		pools: Pool[];
		projects: Project[];
		/** Elternaufgaben (bei Unteraufgaben) */
		path?: string[];
		/** Zusatz unter dem Titel (z. B. Begründung) */
		note?: string;
		/** Knöpfe rechts */
		actions?: Snippet;
	} = $props();

	const pool = $derived(pools.find((p) => p.id === task.poolId));
	const project = $derived(projects.find((p) => p.id === task.projectId));
	const done = $derived(isDone(task));
	const dueIn = $derived(task.due ? daysFromToday(task.due, ui.now) : null);
	const where = $derived(
		[project ? `${pool?.name ?? ''} › ${project.name}` : (pool?.name ?? ''), ...path].join(' › ')
	);
</script>

<div class="plan-row" class:done data-testid="plan-row">
	<button
		class="check prio-{task.priority ?? 0}"
		role="checkbox"
		aria-checked={done}
		aria-label={m.task.done}
		onclick={() => toggleDone(task)}
	>
		{#if done}<Icon name="check" size={14} />{/if}
	</button>

	<button class="main" onclick={() => (ui.detailId = task.id)}>
		<span class="title">{task.title || m.task.newPlaceholder}</span>
		<span class="meta">
			{#if pool}<Badge
					color={project?.color ?? pool.color}
					icon={project?.icon ?? pool.icon}
					size={12}
				/>{/if}
			<span class="where">{where}</span>
			{#if note}<span class="note">· {note}</span>{/if}
		</span>
	</button>

	<span class="chips">
		{#if task.scheduled?.time}<span class="chip">{task.scheduled.time}</span>{/if}
		{#if task.due}
			<span class="chip" class:late={dueIn !== null && dueIn < 0} class:soon={dueIn === 0}>
				{formatDateValue(task.due, ui.now)}
			</span>
		{/if}
		{#if task.estimateMin}<span class="chip est" title={m.today.estimateLabel}
				>{formatDuration(task.estimateMin)}</span
			>{/if}
	</span>

	<span class="actions">
		{#if actions}{@render actions()}{:else}
			<button
				class="icon-btn"
				aria-label={m.today.tomorrow}
				title={m.today.tomorrow}
				onclick={() => postpone(task, addDaysIso(ui.now, 1), false)}
			>
				<Icon name="clock" size={16} />
			</button>
		{/if}
	</span>
</div>

<style>
	.plan-row {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 52px;
		padding: 0 6px 0 10px;
		border-radius: var(--radius);
	}
	.plan-row:hover,
	.plan-row:focus-within {
		background: var(--bg-hover);
	}
	.check {
		width: 20px;
		height: 20px;
		flex: none;
		display: grid;
		place-items: center;
		border-radius: 50%;
		border: 2px solid var(--text-faint);
		color: var(--accent-contrast);
	}
	.check.prio-1 {
		border-color: var(--prio-1);
	}
	.check.prio-2 {
		border-color: var(--prio-2);
	}
	.check.prio-3 {
		border-color: var(--prio-3);
	}
	.done .check {
		background: var(--text-faint);
		border-color: var(--text-faint);
	}
	.main {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 1px;
		padding: 6px 0;
		text-align: left;
		color: var(--text);
	}
	.main > span {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.done .title {
		color: var(--text-muted);
		text-decoration: line-through;
	}
	.meta {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 0.75rem;
		color: var(--text-muted);
	}
	.where {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.note {
		color: var(--text-faint);
		white-space: nowrap;
	}
	.chips {
		display: flex;
		gap: 4px;
		flex: none;
	}
	.chip {
		font-size: 0.75rem;
		padding: 2px 7px;
		border-radius: 6px;
		background: var(--bg-sunken);
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}
	.chip.late {
		color: var(--danger);
	}
	.chip.soon {
		color: var(--warn);
	}
	.actions {
		display: flex;
		flex: none;
		opacity: 0.55;
	}
	.plan-row:hover .actions,
	.plan-row:focus-within .actions {
		opacity: 1;
	}
	@media (hover: none) {
		.actions {
			opacity: 1;
		}
	}
	@media (max-width: 520px) {
		.chip.est {
			display: none;
		}
	}
</style>
