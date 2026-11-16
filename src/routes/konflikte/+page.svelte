<script lang="ts">
	import { formatDateValue } from '#lib/domain/dates.ts';
	import type { DateValue } from '#lib/domain/types.ts';
	import { m } from '#lib/i18n/index.ts';
	import { db } from '#lib/state/app.ts';
	import { live } from '#lib/state/live.svelte.ts';
	import { sync, syncNow } from '#lib/state/sync.svelte.ts';
	import { ui } from '#lib/state/ui.svelte.ts';

	const conflicts = live(() => () => db.conflicts.toArray(), []);
	const tasks = live(() => () => db.tasks.toArray(), []);
	const projects = live(() => () => db.projects.toArray(), []);

	const titleOf = (id: string) => tasks.current.find((t) => t.id === id)?.title ?? id;

	function show(field: string, v: unknown): string {
		if (v === undefined || v === null || v === '') return m.conflicts.empty;
		switch (field) {
			case 'due':
			case 'scheduled':
				return formatDateValue(v as DateValue, ui.now);
			case 'priority':
				return `!${v}`;
			case 'status':
				return v === 'completed' ? m.task.done : v === 'cancelled' ? '✕' : 'offen';
			case 'parentId':
				return titleOf(String(v));
			case 'projectId':
				return projects.current.find((p) => p.id === v)?.name ?? String(v);
			case 'someday':
				return v ? 'ja' : 'nein';
			case 'completedAt':
				return new Date(Number(v)).toLocaleString('de-DE');
			default:
				return typeof v === 'object' ? JSON.stringify(v) : String(v);
		}
	}

	async function choose(id: string, choice: 'local' | 'remote') {
		await sync.resolveConflict(id, choice);
		await syncNow();
	}
</script>

<h1>{m.conflicts.title}</h1>
{#if conflicts.current.length}
	<p class="muted">{m.conflicts.intro}</p>
	{#each conflicts.current as c (c.id)}
		<article class="card" data-testid="conflict">
			<header>
				<strong>{titleOf(c.taskId)}</strong>
				<span class="field">{m.conflicts.fields[c.field] ?? c.field}</span>
			</header>
			<div class="choices">
				<button class="choice" onclick={() => choose(c.id, 'local')}>
					<span class="who">{m.conflicts.local}</span>
					<span class="value">{show(c.field, c.local)}</span>
				</button>
				<button class="choice" onclick={() => choose(c.id, 'remote')}>
					<span class="who">{m.conflicts.remote}</span>
					<span class="value">{show(c.field, c.remote)}</span>
				</button>
			</div>
		</article>
	{/each}
{:else if conflicts.loaded}
	<p class="muted">{m.conflicts.none}</p>
{/if}

<style>
	h1 {
		font-size: 24px;
		margin: 0 0 8px;
	}
	.muted {
		color: var(--text-muted);
	}
	.card {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 12px;
		margin-bottom: 12px;
		background: var(--bg-raised);
	}
	header {
		display: flex;
		gap: 8px;
		align-items: baseline;
		margin-bottom: 8px;
	}
	.field {
		font-size: 13px;
		color: var(--text-muted);
	}
	.choices {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	@media (max-width: 520px) {
		.choices {
			grid-template-columns: 1fr;
		}
	}
	.choice {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 4px;
		padding: 10px;
		border: 1px solid var(--border);
		border-radius: 8px;
		text-align: left;
	}
	.choice:hover {
		border-color: var(--accent);
		background: var(--bg-hover);
	}
	.who {
		font-size: 12px;
		color: var(--text-muted);
	}
	.value {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
</style>
