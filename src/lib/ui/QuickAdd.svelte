<script lang="ts">
	import { addDaysIso, formatDateValue, todayIso } from '#lib/domain/dates.ts';
	import { parseQuickAdd, type Token, type TokenKind } from '#lib/domain/quick-add.ts';
	import type { DateValue, Pool, Priority } from '#lib/domain/types.ts';
	import { m } from '#lib/i18n/index.ts';
	import { repo } from '#lib/state/app.ts';
	import { toast, ui } from '#lib/state/ui.svelte.ts';
	import Icon from './Icon.svelte';

	let {
		pools,
		defaultPoolId,
		placeholder = m.quickAdd.placeholder
	}: { pools: Pool[]; defaultPoolId: string; placeholder?: string } = $props();

	let text = $state('');
	let ignored = $state.raw<string[]>([]);
	/** Über die Buttons gesetzte Werte. Sie haben Vorrang vor erkannten Kürzeln. */
	// $state.raw: nur ganze Zuweisungen, keine Proxies – die Werte gehen direkt in IndexedDB.
	let manual = $state.raw<{ due?: DateValue; priority?: Priority; poolId?: string }>({});
	let menu = $state<'date' | 'priority' | 'pool' | null>(null);
	let input = $state<HTMLInputElement>();

	const parsed = $derived(parseQuickAdd(text, { now: ui.now, pools, ignored }));
	const due = $derived(manual.due ?? parsed.due);
	const priority = $derived(manual.priority ?? parsed.priority);
	const poolId = $derived(manual.poolId ?? parsed.poolId ?? defaultPoolId);
	const poolName = (id: string) => pools.find((p) => p.id === id)?.name ?? '';

	function chipLabel(t: Token) {
		switch (t.kind) {
			case 'date':
				return formatDateValue({ date: parsed.due!.date }, ui.now);
			case 'time':
				return parsed.due?.time ?? t.raw;
			case 'priority':
				return `${m.quickAdd.priority} ${parsed.priority}`;
			case 'pool':
				return t.error ? `${t.raw} – ${t.error}` : poolName(parsed.poolId!);
		}
	}
	const chipIcon = { date: 'calendar', time: 'clock', priority: 'flag', pool: 'hash' } as const;

	/** Manuelle Auswahl: ein erkanntes Kürzel derselben Art wird wieder normaler Text. */
	function setManual<K extends keyof typeof manual>(key: K, value: (typeof manual)[K]) {
		const kinds: TokenKind[] = key === 'due' ? ['date', 'time'] : [key as TokenKind];
		const keys = parsed.tokens.filter((t) => kinds.includes(t.kind)).map((t) => t.key);
		ignored = [...ignored, ...keys];
		manual = { ...manual, [key]: value };
		menu = null;
		input?.focus();
	}

	async function createPoolFromChip(t: Token) {
		await repo.createPool(t.raw.slice(1));
	}

	async function submit() {
		const title = parsed.title;
		if (!title) return;
		await repo.createTask({ poolId, title, due, priority: priority ?? null });
		if (poolId !== defaultPoolId) toast(m.quickAdd.addedTo(poolName(poolId)));
		text = '';
		ignored = [];
		manual = {};
		menu = null;
	}
</script>

<form
	class="quick-add"
	onsubmit={(e) => {
		e.preventDefault();
		submit();
	}}
>
	<div class="input-row">
		<Icon name="plus" />
		<input
			bind:this={input}
			bind:value={text}
			{placeholder}
			aria-label={m.task.addTask}
			autocomplete="off"
			enterkeyhint="done"
			data-testid="quick-add"
		/>
		<button class="btn primary" type="submit" disabled={!parsed.title}>{m.quickAdd.add}</button>
	</div>

	<div class="bar">
		{#each parsed.tokens as t (t.key)}
			<span class="chip kind-{t.kind}" class:error={t.error} data-testid="chip">
				<Icon name={chipIcon[t.kind]} size={13} />
				{chipLabel(t)}
				{#if t.error}
					<button type="button" class="link" onclick={() => createPoolFromChip(t)}>
						{m.quickAdd.createPool}
					</button>
				{/if}
				<button
					type="button"
					class="x"
					aria-label="{m.quickAdd.removeChip}: {t.raw}"
					onclick={() => (ignored = [...ignored, t.key])}><Icon name="x" size={12} /></button
				>
			</span>
		{/each}
		{#if manual.due}
			<span class="chip kind-date" data-testid="chip">
				<Icon name="calendar" size={13} />{formatDateValue(manual.due, ui.now)}
				<button
					type="button"
					class="x"
					aria-label={m.quickAdd.removeChip}
					onclick={() => (manual = { ...manual, due: undefined })}
					><Icon name="x" size={12} /></button
				>
			</span>
		{/if}
		{#if manual.priority}
			<span class="chip kind-priority" data-testid="chip">
				<Icon name="flag" size={13} />{m.quickAdd.priority}
				{manual.priority}
				<button
					type="button"
					class="x"
					aria-label={m.quickAdd.removeChip}
					onclick={() => (manual = { ...manual, priority: undefined })}
					><Icon name="x" size={12} /></button
				>
			</span>
		{/if}
		{#if manual.poolId}
			<span class="chip kind-pool" data-testid="chip">
				<Icon name="hash" size={13} />{poolName(manual.poolId)}
				<button
					type="button"
					class="x"
					aria-label={m.quickAdd.removeChip}
					onclick={() => (manual = { ...manual, poolId: undefined })}
					><Icon name="x" size={12} /></button
				>
			</span>
		{/if}

		<span class="spacer"></span>

		<button
			type="button"
			class="btn ghost"
			aria-expanded={menu === 'date'}
			onclick={() => (menu = menu === 'date' ? null : 'date')}
		>
			<Icon name="calendar" size={16} /><span class="label">{m.quickAdd.date}</span>
		</button>
		<button
			type="button"
			class="btn ghost"
			aria-expanded={menu === 'priority'}
			onclick={() => (menu = menu === 'priority' ? null : 'priority')}
		>
			<Icon name="flag" size={16} /><span class="label">{m.quickAdd.priority}</span>
		</button>
		<button
			type="button"
			class="btn ghost"
			aria-expanded={menu === 'pool'}
			onclick={() => (menu = menu === 'pool' ? null : 'pool')}
		>
			<Icon name="hash" size={16} /><span class="label">{m.quickAdd.pool}</span>
		</button>
	</div>

	{#if menu === 'date'}
		<div class="menu">
			<button type="button" class="btn" onclick={() => setManual('due', { date: todayIso(ui.now) })}
				>{m.quickAdd.today}</button
			>
			<button
				type="button"
				class="btn"
				onclick={() => setManual('due', { date: addDaysIso(ui.now, 1) })}
				>{m.quickAdd.tomorrow}</button
			>
			<input
				class="field"
				type="date"
				aria-label={m.quickAdd.date}
				onchange={(e) => e.currentTarget.value && setManual('due', { date: e.currentTarget.value })}
			/>
		</div>
	{:else if menu === 'priority'}
		<div class="menu">
			{#each [1, 2, 3] as const as p (p)}
				<button type="button" class="btn prio-{p}" onclick={() => setManual('priority', p)}
					>!{p}</button
				>
			{/each}
		</div>
	{:else if menu === 'pool'}
		<div class="menu">
			{#each pools as p (p.id)}
				<button type="button" class="btn" onclick={() => setManual('poolId', p.id)}>
					<span class="dot" style:background={p.color}></span>{p.name}
				</button>
			{/each}
		</div>
	{/if}
</form>

<style>
	.quick-add {
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 6px 8px;
		margin-bottom: 12px;
	}
	.input-row {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--text-muted);
	}
	.input-row input {
		flex: 1;
		min-width: 0;
		border: 0;
		background: transparent;
		padding: 8px 0;
		outline: none;
		color: var(--text);
	}
	.btn[disabled] {
		opacity: 0.4;
		cursor: default;
	}
	.bar {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
		padding-top: 4px;
	}
	.spacer {
		flex: 1;
	}
	.bar .btn {
		min-height: 30px;
		padding: 0 8px;
		color: var(--text-muted);
		font-size: 14px;
	}
	.chip .x {
		display: grid;
		place-items: center;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		color: var(--text-muted);
	}
	.chip .x:hover {
		background: var(--bg-hover);
	}
	.kind-date,
	.kind-time {
		background: color-mix(in srgb, var(--accent) 14%, var(--bg-raised));
		border-color: color-mix(in srgb, var(--accent) 35%, transparent);
	}
	.kind-priority {
		background: color-mix(in srgb, var(--prio-1) 14%, var(--bg-raised));
		border-color: color-mix(in srgb, var(--prio-1) 35%, transparent);
	}
	.kind-pool {
		background: color-mix(in srgb, var(--ok) 14%, var(--bg-raised));
		border-color: color-mix(in srgb, var(--ok) 35%, transparent);
	}
	.chip.error {
		background: color-mix(in srgb, var(--danger) 14%, var(--bg-raised));
		border-color: var(--danger);
		color: var(--danger);
	}
	.link {
		text-decoration: underline;
		font-size: 13px;
	}
	.menu {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		padding: 8px 0 4px;
	}
	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
	}
	.prio-1 {
		color: var(--prio-1);
	}
	.prio-2 {
		color: var(--prio-2);
	}
	.prio-3 {
		color: var(--prio-3);
	}
	@media (max-width: 520px) {
		.label {
			display: none;
		}
	}
</style>
