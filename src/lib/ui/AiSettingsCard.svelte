<script lang="ts">
	/** Einstellungen → KI: API-Schlüssel, Modell, Ersatzmodell, Tageslimit, Datenschutz, Verbrauch. */
	import { AiError } from '#lib/ai/openrouter.ts';
	import { m } from '#lib/i18n/index.ts';
	import { ai, AI_MODELS, checkKey, saveAiSettings } from '#lib/state/ai.svelte.ts';
	import Icon from './Icon.svelte';

	const s = $derived(ai.settings);
	let show = $state(false);
	let status = $state<{ ok: boolean; text: string } | null>(null);
	let checking = $state(false);

	const known = (id: string) => AI_MODELS.some((x) => x.id === id);
	let customModel = $state(false);
	$effect(() => {
		if (ai.loaded && !known(s.model)) customModel = true;
	});

	const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;

	async function check() {
		checking = true;
		status = null;
		try {
			const k = await checkKey(s.apiKey);
			status = {
				ok: true,
				text: m.ai.keyOk(usd(k.usage), k.limit != null ? ` von ${usd(k.limit)}` : '')
			};
		} catch (e) {
			status = { ok: false, text: e instanceof AiError ? e.message : String(e) };
		} finally {
			checking = false;
		}
	}
</script>

<section class="card" data-testid="ai-settings">
	<header>
		<h2 class="card-heading">{m.ai.settingsTitle}</h2>
		<p class="card-sub">{m.ai.settingsHint}</p>
	</header>

	{#if ai.loaded}
		<div class="line col">
			<span>
				{m.ai.key}
				<small>{m.ai.keyHint}</small>
			</span>
			<div class="key">
				<input
					class="field"
					type={show ? 'text' : 'password'}
					autocomplete="off"
					spellcheck="false"
					aria-label={m.ai.key}
					placeholder={m.ai.keyPlaceholder}
					value={s.apiKey}
					onchange={(e) => {
						status = null;
						saveAiSettings({ apiKey: e.currentTarget.value.trim() });
					}}
				/>
				<button
					class="icon-btn"
					aria-label={show ? m.ai.hideKey : m.ai.showKey}
					aria-pressed={show}
					title={show ? m.ai.hideKey : m.ai.showKey}
					onclick={() => (show = !show)}><Icon name="eye" size={16} /></button
				>
				<button class="btn" disabled={!s.apiKey || checking} onclick={check}>
					{checking ? m.ai.checking : m.ai.check}
				</button>
			</div>
			{#if status}
				<p class="status" class:ok={status.ok} class:bad={!status.ok} role="status">
					{status.text}
				</p>
			{/if}
		</div>

		<div class="line col">
			<span>
				{m.ai.model}
				<small>{m.ai.modelHint}</small>
			</span>
			<select
				class="field"
				aria-label={m.ai.model}
				value={customModel ? '' : s.model}
				onchange={(e) => {
					const v = e.currentTarget.value;
					customModel = !v;
					if (v) saveAiSettings({ model: v });
				}}
			>
				{#each AI_MODELS as mod (mod.id)}
					<option value={mod.id}>{mod.label} – {mod.note}</option>
				{/each}
				<option value="">{m.ai.modelCustom}</option>
			</select>
			{#if customModel}
				<input
					class="field"
					aria-label={m.ai.modelCustomLabel}
					placeholder="anbieter/modell"
					value={known(s.model) ? '' : s.model}
					onchange={(e) =>
						e.currentTarget.value.trim() && saveAiSettings({ model: e.currentTarget.value.trim() })}
				/>
			{/if}
		</div>

		<div class="line">
			<span>
				{m.ai.fallback}
				<small>{m.ai.fallbackHint}</small>
			</span>
			<select
				class="field"
				aria-label={m.ai.fallback}
				value={s.fallbackModel}
				onchange={(e) => saveAiSettings({ fallbackModel: e.currentTarget.value })}
			>
				{#each AI_MODELS as mod (mod.id)}
					<option value={mod.id}>{mod.label}</option>
				{/each}
				<option value="">–</option>
			</select>
		</div>

		<label class="line">
			<span>
				{m.ai.limit}
				<small>{m.ai.limitHint}</small>
			</span>
			<span class="limit">
				<input
					class="field small"
					type="number"
					min="1"
					max="500"
					aria-label={m.ai.limit}
					value={s.dailyLimitCents}
					onchange={(e) =>
						saveAiSettings({
							dailyLimitCents: Math.max(1, Math.round(Number(e.currentTarget.value) || 5))
						})}
				/>
				{m.ai.cents}
			</span>
		</label>

		<label class="line">
			<span>
				{m.ai.privateOnly}
				<small>{m.ai.privateOnlyHint}</small>
			</span>
			<input
				type="checkbox"
				class="switch"
				role="switch"
				checked={s.privateOnly}
				onchange={(e) => saveAiSettings({ privateOnly: e.currentTarget.checked })}
			/>
		</label>

		<p class="usage" data-testid="ai-usage">
			{m.ai.today(ai.todayCents.toFixed(3).replace('.', ','), ai.todayCalls)}
		</p>
	{/if}
</section>

<style>
	section {
		margin-bottom: var(--gap);
		padding: 14px 16px;
	}
	header {
		margin-bottom: 10px;
	}
	.line {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
		min-height: 44px;
		padding: 6px 0;
		border-top: 1px solid var(--border);
	}
	header + .line {
		border-top: 0;
	}
	.line.col {
		flex-direction: column;
		align-items: stretch;
		gap: 8px;
	}
	.line > span:first-child {
		flex: 1 1 200px;
	}
	.line.col > span:first-child {
		flex: none;
	}
	small {
		display: block;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}
	.key {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.key .field {
		flex: 1;
		min-width: 0;
		font-family: ui-monospace, monospace;
		font-size: 0.875rem;
	}
	select {
		max-width: 100%;
	}
	.status {
		margin: 0;
		font-size: 0.8125rem;
	}
	.status.ok {
		color: var(--ok);
	}
	.status.bad {
		color: var(--danger);
	}
	.limit {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.small {
		width: 72px;
	}
	.usage {
		margin: 8px 0 0;
		font-size: 0.8125rem;
		color: var(--text-faint);
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
