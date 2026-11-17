<script lang="ts">
	/**
	 * Schnelleingabe: erkennt Datum, Uhrzeit, Priorität und #Pool im Text und zeigt sie als Chips.
	 * Auswahlknöpfe darunter setzen dasselbe mit einem Klick.
	 */
	import { addDaysIso, formatDateValue, todayIso } from '#lib/domain/dates.ts';
	import { parseQuickAdd, type Token, type TokenKind } from '#lib/domain/quick-add.ts';
	import type { DateValue, Pool, Priority, Project } from '#lib/domain/types.ts';
	import { m } from '#lib/i18n/index.ts';
	import { repo } from '#lib/state/app.ts';
	import { toast, ui } from '#lib/state/ui.svelte.ts';
	import Icon from './Icon.svelte';

	let {
		pools,
		projects = [],
		defaultPoolId,
		defaultProjectId = null,
		placeholder = m.quickAdd.placeholder
	}: {
		pools: Pool[];
		projects?: Project[];
		defaultPoolId: string;
		defaultProjectId?: string | null;
		placeholder?: string;
	} = $props();

	interface Target {
		poolId: string;
		projectId: string | null;
	}

	let text = $state('');
	let ignored = $state.raw<string[]>([]);
	/**
	 * Über die Leiste gesetzte Werte – sie haben Vorrang vor erkannten Kürzeln.
	 * `null` heißt „bewusst keins“. ($state.raw: keine Proxies, die Werte gehen in IndexedDB.)
	 */
	let manual = $state.raw<{ due?: DateValue | null; priority?: Priority | null; target?: Target }>(
		{}
	);
	let input = $state<HTMLInputElement>();
	let dateInput = $state<HTMLInputElement>();

	const parsed = $derived(parseQuickAdd(text, { now: ui.now, pools, projects, ignored }));
	const due = $derived(manual.due !== undefined ? (manual.due ?? undefined) : parsed.due);
	const priority = $derived(
		manual.priority !== undefined ? (manual.priority ?? undefined) : parsed.priority
	);
	const target = $derived<Target>(
		manual.target ??
			(parsed.poolId
				? { poolId: parsed.poolId, projectId: parsed.projectId ?? null }
				: { poolId: defaultPoolId, projectId: defaultProjectId })
	);

	const today = $derived(todayIso(ui.now));
	const tomorrow = $derived(addDaysIso(ui.now, 1));
	const otherDate = $derived(due && due.date !== today && due.date !== tomorrow);

	const poolName = (id: string) => pools.find((p) => p.id === id)?.name ?? '';
	const targetName = (t: Target) => {
		const project = projects.find((p) => p.id === t.projectId);
		return project ? `${poolName(t.poolId)} › ${project.name}` : poolName(t.poolId);
	};
	const targetKey = (t: Target) => `${t.poolId}|${t.projectId ?? ''}`;

	function chipLabel(t: Token) {
		switch (t.kind) {
			case 'date':
				return formatDateValue({ date: parsed.due!.date }, ui.now);
			case 'time':
				return parsed.due?.time ?? t.raw;
			case 'priority':
				return `${m.quickAdd.priority} ${parsed.priority}`;
			case 'pool':
				return t.error
					? `${t.raw} – ${t.error}`
					: targetName({ poolId: parsed.poolId!, projectId: parsed.projectId ?? null });
		}
	}
	const chipIcon = { date: 'calendar', time: 'clock', priority: 'flag', pool: 'hash' } as const;

	/** Auswahl über die Leiste: ein erkanntes Kürzel derselben Art wird wieder normaler Text. */
	function setManual<K extends keyof typeof manual>(key: K, value: (typeof manual)[K]) {
		const kinds: TokenKind[] =
			key === 'due' ? ['date', 'time'] : key === 'target' ? ['pool'] : ['priority'];
		const keys = parsed.tokens.filter((t) => kinds.includes(t.kind)).map((t) => t.key);
		if (keys.length) ignored = [...ignored, ...keys];
		manual = { ...manual, [key]: value };
		input?.focus();
	}

	const toggleDate = (date: string) =>
		setManual('due', due?.date === date ? null : { date, time: due?.time });

	function openDatePicker() {
		try {
			dateInput?.showPicker();
		} catch {
			dateInput?.focus();
		}
	}

	async function createPoolFromChip(t: Token) {
		await repo.createPool(t.raw.slice(1));
	}

	async function submit() {
		const title = parsed.title;
		if (!title) return;
		const task = {
			poolId: target.poolId,
			projectId: target.projectId,
			title,
			due,
			priority: priority ?? null
		};
		// Sofort leeren – wer gleich weitertippt, beginnt schon die nächste Aufgabe.
		text = '';
		ignored = [];
		manual = {};
		await repo.createTask(task);
		if (task.poolId !== defaultPoolId || task.projectId !== defaultProjectId) {
			toast(m.quickAdd.addedTo(targetName(task)));
		}
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

	{#if parsed.tokens.length}
		<div class="chips">
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
		</div>
	{/if}

	<div class="bar">
		<div class="seg" role="group" aria-label={m.quickAdd.date}>
			<button type="button" aria-pressed={due?.date === today} onclick={() => toggleDate(today)}
				>{m.quickAdd.today}</button
			>
			<button
				type="button"
				aria-pressed={due?.date === tomorrow}
				onclick={() => toggleDate(tomorrow)}>{m.quickAdd.tomorrow}</button
			>
			<button
				type="button"
				class="date-btn"
				aria-pressed={!!otherDate}
				aria-label={m.quickAdd.pickDate}
				title={m.quickAdd.pickDate}
				onclick={openDatePicker}
			>
				<Icon name="calendar" size={15} />
				{#if otherDate}<span>{formatDateValue({ date: due!.date }, ui.now)}</span>{/if}
			</button>
			<input
				bind:this={dateInput}
				class="hidden-date"
				type="date"
				tabindex="-1"
				aria-hidden="true"
				value={due?.date ?? ''}
				onchange={(e) =>
					setManual('due', e.currentTarget.value ? { date: e.currentTarget.value } : null)}
			/>
		</div>

		<div class="seg" role="group" aria-label={m.quickAdd.priority}>
			{#each [1, 2, 3] as const as p (p)}
				<button
					type="button"
					class="prio-{p}"
					aria-pressed={priority === p}
					onclick={() => setManual('priority', priority === p ? null : p)}>!{p}</button
				>
			{/each}
		</div>

		<label class="target">
			<Icon name="hash" size={15} />
			<select
				aria-label={m.quickAdd.target}
				value={targetKey(target)}
				onchange={(e) => {
					const [poolId, projectId] = e.currentTarget.value.split('|');
					setManual('target', { poolId, projectId: projectId || null });
				}}
			>
				{#each pools as p (p.id)}
					<option value={targetKey({ poolId: p.id, projectId: null })}>{p.name}</option>
					{#each projects.filter((pr) => pr.poolId === p.id && !pr.archived) as pr (pr.id)}
						<option value={targetKey({ poolId: p.id, projectId: pr.id })}>
							&nbsp;&nbsp;{p.name} › {pr.name}
						</option>
					{/each}
				{/each}
			</select>
		</label>
	</div>
</form>

<style>
	.quick-add {
		background: var(--bg-raised);
		border: 1px solid var(--border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-card);
		padding: 6px 10px 10px;
		margin-bottom: var(--gap);
	}
	.quick-add:focus-within {
		border-color: var(--accent);
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
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		padding: 2px 0 6px;
	}
	.bar {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
		padding-top: 4px;
	}
	.seg {
		display: inline-flex;
		border: 1px solid var(--border);
		border-radius: 8px;
		overflow: hidden;
		position: relative;
	}
	.seg button {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		min-height: 30px;
		padding: 0 10px;
		font-size: 0.875rem;
		color: var(--text-muted);
		border-right: 1px solid var(--border);
	}
	.seg button:last-of-type {
		border-right: 0;
	}
	.seg button:hover {
		background: var(--bg-hover);
	}
	.seg button[aria-pressed='true'] {
		background: var(--accent);
		color: var(--accent-contrast);
	}
	.seg .prio-1:not([aria-pressed='true']) {
		color: var(--prio-1);
	}
	.seg .prio-2:not([aria-pressed='true']) {
		color: var(--prio-2);
	}
	.seg .prio-3:not([aria-pressed='true']) {
		color: var(--prio-3);
	}
	.hidden-date {
		position: absolute;
		right: 0;
		bottom: 0;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
	.target {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		min-height: 32px;
		padding: 0 4px 0 8px;
		border: 1px solid var(--border);
		border-radius: 8px;
		color: var(--text-muted);
		max-width: 100%;
	}
	.target select {
		border: 0;
		background: transparent;
		font-size: 0.875rem;
		color: var(--text);
		max-width: 220px;
		padding: 4px 0;
		outline: none;
	}
	.target select option {
		background: var(--bg-raised);
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
		font-size: 0.8125rem;
	}
</style>
