<script lang="ts">
	import DOMPurify from 'dompurify';
	import { marked } from 'marked';
	import { childrenOf } from '#lib/domain/tree.ts';
	import type { DateValue, Energy, Pool, Priority, Project } from '#lib/domain/types.ts';
	import { m } from '#lib/i18n/index.ts';
	import { deleteTask } from '#lib/state/actions.ts';
	import { db, repo } from '#lib/state/app.ts';
	import { live } from '#lib/state/live.svelte.ts';
	import { ui } from '#lib/state/ui.svelte.ts';
	import Icon from './Icon.svelte';
	import { syncValue } from './sync-value';

	let { pools, projects }: { pools: Pool[]; projects: Project[] } = $props();

	const task = live(() => {
		const id = ui.detailId;
		return () => (id ? db.tasks.get(id) : undefined);
	}, undefined);
	const t = $derived(task.current && !task.current.deletedAt ? task.current : undefined);

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
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && ui.detailId && close()} />

{#if ui.detailId && t}
	<button class="backdrop" aria-label={m.task.close} onclick={close}></button>
	<aside class="panel" aria-label={m.task.details}>
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
		grid-template-columns: max-content 1fr;
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
