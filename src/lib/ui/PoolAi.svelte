<script lang="ts">
	/** KI-Einstellungen eines Pools: an/aus, eigenes Modell, Kontext-Notizen. Bei der Inbox nur an/aus. */
	import { resolve } from '$app/paths';
	import type { Pool } from '#lib/domain/types.ts';
	import { m } from '#lib/i18n/index.ts';
	import { repo } from '#lib/state/app.ts';
	import { ai, AI_MODELS } from '#lib/state/ai.svelte.ts';
	import Icon from './Icon.svelte';

	let { pool }: { pool: Pool } = $props();
	const s = $derived(pool.settings.ai);
	const inbox = $derived(pool.kind === 'inbox');
</script>

<div class="pool-ai" data-testid="pool-ai">
	<label class="row">
		<span class="lbl"
			><Icon name="sparkle" size={16} />{inbox ? m.ai.inboxEnable : m.ai.poolEnable}</span
		>
		<input
			type="checkbox"
			class="switch"
			role="switch"
			checked={s.enabled}
			onchange={(e) => repo.updatePoolAi(pool.id, { enabled: e.currentTarget.checked })}
		/>
	</label>

	{#if s.enabled}
		{#if ai.loaded && !ai.ready}
			<p class="hint warn">
				{m.ai.noKey}
				<a href="{resolve('/einstellungen')}#ki">{m.ai.toSettings}</a>
			</p>
		{/if}
		{#if inbox}
			<p class="hint">{m.ai.inboxHint}</p>
		{:else}
			<label class="row">
				<span class="lbl">{m.ai.poolModel}</span>
				<select
					class="field"
					aria-label={m.ai.poolModel}
					value={s.model ?? ''}
					onchange={(e) =>
						repo.updatePoolAi(pool.id, { model: e.currentTarget.value || undefined })}
				>
					<option value="">{m.ai.poolModelDefault}</option>
					{#each AI_MODELS as mod (mod.id)}
						<option value={mod.id}>{mod.label}</option>
					{/each}
				</select>
			</label>
			<label class="notes">
				<span class="lbl">{m.ai.poolNotes}</span>
				<textarea
					class="field"
					rows="2"
					placeholder={m.ai.poolNotesPlaceholder}
					value={s.contextNotes ?? ''}
					onchange={(e) => repo.updatePoolAi(pool.id, { contextNotes: e.currentTarget.value })}
				></textarea>
				<span class="hint">{m.ai.poolNotesHint}</span>
			</label>
		{/if}
	{/if}
</div>

<style>
	.pool-ai {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 2px 0 12px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}
	.lbl {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 0.875rem;
		color: var(--text-muted);
	}
	.row .lbl {
		min-width: 150px;
	}
	select {
		flex: 1 1 200px;
		max-width: 360px;
	}
	.notes {
		display: flex;
		flex-direction: column;
		gap: 4px;
		max-width: 560px;
	}
	.notes textarea {
		resize: vertical;
		color: var(--text);
	}
	.hint {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--text-faint);
	}
	.hint.warn {
		color: var(--warn);
	}
	.hint a {
		color: var(--accent);
		text-decoration: underline;
	}
	.switch {
		appearance: none;
		width: 40px;
		height: 24px;
		border-radius: 12px;
		background: var(--border-strong);
		position: relative;
		cursor: pointer;
		flex: none;
		transition: background 120ms;
	}
	.switch::after {
		content: '';
		position: absolute;
		top: 3px;
		left: 3px;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: #fff;
		transition: transform 120ms;
	}
	.switch:checked {
		background: var(--accent);
	}
	.switch:checked::after {
		transform: translateX(16px);
	}
</style>
