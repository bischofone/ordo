<script lang="ts">
	/**
	 * Detailansicht einer Aufgabe (rechts am PC, als Blatt am Handy): Notizen in Markdown,
	 * Termine, Priorität, Pool/Projekt, Unteraufgaben und Zeiterfassung.
	 */
	import DOMPurify from 'dompurify';
	import { marked } from 'marked';
	import { childrenOf } from '#lib/domain/tree.ts';
	import type { DateValue, Energy, Pool, Priority, Project, Task } from '#lib/domain/types.ts';
	import { m } from '#lib/i18n/index.ts';
	import { deleteTask } from '#lib/state/actions.ts';
	import { db, repo } from '#lib/state/app.ts';
	import { live } from '#lib/state/live.svelte.ts';
	import { ui } from '#lib/state/ui.svelte.ts';
	import { timeSettings } from '#lib/state/time-settings.svelte.ts';
	import Icon from './Icon.svelte';
	import TimeSection from './TimeSection.svelte';
	import { aiBreakdown, aiTips } from '#lib/state/ai.svelte.ts';
	import { syncValue } from './sync-value';

	let { pools, projects }: { pools: Pool[]; projects: Project[] } = $props();

	// Ergebnis merkt sich, zu welcher ID es gehört (beim Wechsel ist kurz noch die alte Aufgabe da).
	const task = live(
		() => {
			const id = ui.detailId;
			return async () => ({ id, task: id ? await db.tasks.get(id) : undefined });
		},
		{ id: null as string | null, task: undefined as Task | undefined }
	);
	const t = $derived(
		task.current.task && !task.current.task.deletedAt ? task.current.task : undefined
	);

	// Aufgabe gibt es nicht (mehr) → Details schließen
	$effect(() => {
		if (ui.detailId && task.current.id === ui.detailId && !t) ui.detailId = null;
	});

	let preview = $state(true);
	const html = $derived(
		t?.notes ? DOMPurify.sanitize(marked.parse(t.notes, { async: false })) : ''
	);

	const update = (patch: Parameters<typeof repo.updateTask>[1]) =>
		t && repo.updateTask(t.id, patch);

	function setDate(field: 'due' | 'scheduled', date: string, time?: string) {
		const v: DateValue | undefined = date ? { date, time: time || undefined } : undefined;
		update({ [field]: v });
	}

	async function remove() {
		if (!t) return;
		const kids = childrenOf(await db.tasks.where('poolId').equals(t.poolId).toArray(), t.id);
		await deleteTask(t, kids.length > 0);
	}

	const close = () => (ui.detailId = null);
	/** KI-Knöpfe nur, wenn die KI im Pool der Aufgabe an ist (nicht in der Inbox) */
	const aiOn = $derived(
		!!t && pools.some((p) => p.id === t.poolId && p.kind === 'pool' && p.settings.ai.enabled)
	);
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && ui.detailId && close()} />

{#if ui.detailId && t}
	{#if !ui.docked}
		<button class="backdrop" aria-label={m.task.close} onclick={close}></button>
	{/if}
	<aside class="panel" class:docked={ui.docked} aria-label={m.task.details} data-testid="detail">
		<header>
			<input
				class="title"
				use:syncValue={t.title}
				aria-label={m.task.title}
				oninput={(e) => update({ title: e.currentTarget.value })}
			/>
			<button class="icon-btn" aria-label={m.task.close} onclick={close}><Icon name="x" /></button>
		</header>

		<div class="grid">
			<span class="lbl">{m.task.pool}</span>
			<select
				class="field"
				value={`${t.poolId}|${t.projectId ?? ''}`}
				onchange={(e) => {
					const [poolId, projectId] = e.currentTarget.value.split('|');
					repo.moveTo(t.id, { poolId, projectId: projectId || null });
				}}
				disabled={t.parentId !== null}
			>
				{#each pools as p (p.id)}
					<option value="{p.id}|">{p.name}</option>
					{#each projects.filter((pr) => pr.poolId === p.id) as pr (pr.id)}
						<option value="{p.id}|{pr.id}">&nbsp;&nbsp;{p.name} › {pr.name}</option>
					{/each}
				{/each}
			</select>

			<span class="lbl">{m.quickAdd.priority}</span>
			<div class="seg" role="radiogroup" aria-label={m.quickAdd.priority}>
				{#each [null, 1, 2, 3] as const as p (p)}
					<button
						role="radio"
						aria-checked={t.priority === p}
						class:on={t.priority === p}
						class="prio-{p ?? 0}"
						onclick={() => update({ priority: p as Priority | null })}>{p ? `!${p}` : '–'}</button
					>
				{/each}
			</div>

			{#each [['due', m.task.due], ['scheduled', m.task.scheduled]] as const as [field, label] (field)}
				<span class="lbl">{label}</span>
				<div class="row">
					<input
						class="field"
						type="date"
						aria-label={label}
						value={t[field]?.date ?? ''}
						onchange={(e) => setDate(field, e.currentTarget.value, t[field]?.time)}
					/>
					<input
						class="field"
						type="time"
						aria-label="{label} {m.task.time}"
						value={t[field]?.time ?? ''}
						disabled={!t[field]}
						onchange={(e) => setDate(field, t[field]!.date, e.currentTarget.value)}
					/>
				</div>
			{/each}

			<span class="lbl">{m.task.estimate}</span>
			<input
				class="field"
				type="number"
				min="0"
				step="5"
				value={t.estimateMin ?? ''}
				onchange={(e) =>
					update({
						estimateMin: e.currentTarget.value ? Number(e.currentTarget.value) : undefined
					})}
			/>

			<span class="lbl">{m.task.energy}</span>
			<div class="seg" role="radiogroup" aria-label={m.task.energy}>
				{#each [undefined, 'low', 'mid', 'high'] as const as en (en ?? 'none')}
					<button
						role="radio"
						aria-checked={t.energy === en}
						class:on={t.energy === en}
						onclick={() => update({ energy: en as Energy | undefined })}
						>{en ? m.task.energyLevels[en] : '–'}</button
					>
				{/each}
			</div>

			{#if t.parentId === null}
				<span class="lbl">{m.task.someday}</span>
				<label class="toggle">
					<input
						type="checkbox"
						checked={t.someday}
						onchange={(e) => update({ someday: e.currentTarget.checked })}
					/>
					{m.task.someday}
				</label>
			{/if}
		</div>

		{#if aiOn}
			<div class="ai" data-testid="detail-ai">
				<span class="lbl"><Icon name="sparkle" size={14} />{m.ai.name}</span>
				<button class="btn ghost" onclick={() => aiBreakdown(t)}>
					<Icon name="subtask" size={16} />{m.ai.breakdown}
				</button>
				<button class="btn ghost" onclick={() => aiTips(t)}>
					<Icon name="bulb" size={16} />{m.ai.tips}
				</button>
			</div>
		{/if}

		{#if timeSettings.enabled}
			<TimeSection task={t} />
		{/if}

		<div class="notes">
			<div class="notes-head">
				<span class="lbl">{m.task.notes}</span>
				<button class="btn ghost" onclick={() => (preview = !preview)}>
					{preview ? m.task.edit : m.task.preview}
				</button>
			</div>
			{#if preview && t.notes}
				<div class="md" role="button" tabindex="0" ondblclick={() => (preview = false)}>
					<!-- Mit DOMPurify bereinigt -->
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html html}
				</div>
			{:else}
				<textarea
					class="field"
					rows="8"
					placeholder={m.task.notesPlaceholder}
					use:syncValue={t.notes}
					oninput={(e) => update({ notes: e.currentTarget.value })}></textarea>
			{/if}
		</div>

		<footer>
			<span class="meta">{m.task.created}: {new Date(t.createdAt).toLocaleString('de-DE')}</span>
			<button class="btn danger" onclick={remove}
				><Icon name="trash" size={16} />{m.task.delete}</button
			>
		</footer>
	</aside>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgb(0 0 0 / 0.25);
		z-index: 40;
	}
	.panel {
		position: fixed;
		z-index: 41;
		top: 0;
		right: 0;
		bottom: 0;
		width: min(440px, 100vw);
		background: var(--bg-raised);
		box-shadow: var(--shadow);
		padding: 16px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.panel.docked {
		width: var(--detail-w);
		box-shadow: none;
		border-left: 1px solid var(--border);
		z-index: 25;
	}
	@media (max-width: 640px) {
		.panel {
			top: auto;
			max-height: 88vh;
			width: 100vw;
			border-radius: 16px 16px 0 0;
			padding-bottom: calc(16px + env(safe-area-inset-bottom));
		}
	}
	header {
		display: flex;
		gap: 8px;
		align-items: flex-start;
	}
	.title {
		flex: 1;
		font-size: 1.1875rem;
		font-weight: 600;
		border: 0;
		background: transparent;
		padding: 4px 0;
		outline: none;
	}
	.grid {
		display: grid;
		grid-template-columns: max-content minmax(0, 1fr);
		gap: 10px 12px;
		align-items: center;
	}
	.lbl {
		font-size: 0.8125rem;
		color: var(--text-muted);
	}
	.row {
		display: flex;
		gap: 6px;
	}
	.row .field {
		flex: 1;
		min-width: 0;
	}
	.seg {
		display: inline-flex;
		border: 1px solid var(--border);
		border-radius: 8px;
		overflow: hidden;
		width: fit-content;
	}
	.seg button {
		padding: 6px 12px;
		border-right: 1px solid var(--border);
	}
	.seg button:last-child {
		border-right: 0;
	}
	.seg button.on {
		background: var(--accent);
		color: var(--accent-contrast);
	}
	.prio-1:not(.on) {
		color: var(--prio-1);
	}
	.prio-2:not(.on) {
		color: var(--prio-2);
	}
	.prio-3:not(.on) {
		color: var(--prio-3);
	}
	.ai {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
	}
	.ai .lbl {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin-right: 4px;
		color: var(--accent);
	}
	.ai .btn {
		gap: 6px;
	}
	.toggle {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.notes textarea {
		width: 100%;
		resize: vertical;
	}
	.notes-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.md {
		padding: 4px 2px;
		overflow-wrap: anywhere;
	}
	.md :global(p) {
		margin: 0 0 8px;
	}
	footer {
		margin-top: auto;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
	}
	.meta {
		font-size: 0.75rem;
		color: var(--text-faint);
	}
</style>
