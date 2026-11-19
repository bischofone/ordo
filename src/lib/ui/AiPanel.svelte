<script lang="ts">
	/**
	 * Das KI-Fenster: fragt ggf. eine Eingabe ab, ruft die KI, zeigt das Ergebnis als Vorschlag.
	 * Aufgabenvorschläge lassen sich abhaken und umbenennen, bevor sie übernommen werden.
	 * Nichts ändert sich ohne Klick auf „Übernehmen“.
	 */
	import DOMPurify from 'dompurify';
	import { marked } from 'marked';
	import type { DayPlanItem, SuggestedTask } from '#lib/ai/features.ts';
	import { nextQuarter, planSlots } from '#lib/domain/dayplan.ts';
	import { formatDuration, parseDuration } from '#lib/domain/time.ts';
	import { AiError } from '#lib/ai/openrouter.ts';
	import { m } from '#lib/i18n/index.ts';
	import { aiPanel, modelLabel, type AiView } from '#lib/state/ai.svelte.ts';
	import { toast, ui } from '#lib/state/ui.svelte.ts';
	import Icon from './Icon.svelte';

	interface Node {
		title: string;
		checked: boolean;
		priority?: 1 | 2 | 3;
		due?: string;
		children: Node[];
	}

	interface PlanRow {
		taskId: string;
		title: string;
		reason: string;
		checked: boolean;
		/** Eingabe wie überall (0:30, 45min, 1,5h) */
		estimate: string;
		priority: 1 | 2 | 3 | null;
	}

	let dialogEl = $state<HTMLDialogElement>();
	let input = $state('');
	let phase = $state<'input' | 'loading' | 'result' | 'error'>('input');
	let error = $state('');
	let view = $state.raw<AiView | null>(null);
	let nodes = $state<Node[]>([]);
	let meta = $state('');
	let rows = $state<PlanRow[]>([]);
	let start = $state('09:00');
	let withTimes = $state(true);
	let busy = $state(false);
	let runId = 0;

	const req = $derived(aiPanel.req);

	// Öffnen/Schließen folgt dem Zustand
	$effect(() => {
		if (!dialogEl) return;
		if (req && !dialogEl.open) {
			input = '';
			view = null;
			error = '';
			dialogEl.showModal();
			if (req.input) phase = 'input';
			else void run();
		}
		if (!req && dialogEl.open) dialogEl.close();
	});

	const toNodes = (t: SuggestedTask[]): Node[] =>
		t.map((n) => ({
			title: n.title,
			checked: true,
			priority: n.priority,
			due: n.due,
			children: toNodes(n.children)
		}));
	const fromNodes = (n: Node[]): SuggestedTask[] =>
		n
			.filter((x) => x.checked && x.title.trim())
			.map((x) => ({
				title: x.title.trim(),
				priority: x.priority,
				due: x.due,
				children: fromNodes(x.children)
			}));
	const count = (n: Node[]): number =>
		n.reduce((s, x) => s + (x.checked && x.title.trim() ? 1 + count(x.children) : 0), 0);
	const setAll = (n: Node[], v: boolean) =>
		n.forEach((x) => {
			x.checked = v;
			setAll(x.children, v);
		});

	async function run() {
		if (!req) return;
		const id = ++runId;
		phase = 'loading';
		error = '';
		try {
			const out = await req.run(input.trim());
			if (id !== runId || !aiPanel.req) return;
			view = out.value;
			if (out.value.kind === 'tree') nodes = toNodes(out.value.value);
			if (out.value.kind === 'plan') {
				rows = out.value.value.items.map((it) => ({
					taskId: it.taskId,
					title: it.title,
					reason: it.reason,
					checked: true,
					estimate: it.estimateMin ? formatDuration(it.estimateMin) : '',
					priority: it.priority
				}));
				start = nextQuarter(new Date());
			}
			meta = m.ai.cost(out.cents.toFixed(4).replace('.', ','), modelLabel(out.model));
			phase = 'result';
		} catch (e) {
			if (id !== runId) return;
			error = e instanceof AiError ? e.message : String((e as Error)?.message ?? e);
			phase = 'error';
		}
	}

	function close() {
		runId++;
		aiPanel.req = null;
	}

	async function apply() {
		if (!req?.apply || !view) return;
		busy = true;
		try {
			await req.apply(
				view.kind === 'tree'
					? { kind: 'tree', value: fromNodes(nodes) }
					: view.kind === 'plan'
						? { kind: 'plan', value: { summary: view.value.summary, items: planItems() } }
						: view
			);
			close();
		} finally {
			busy = false;
		}
	}

	async function copy() {
		if (view?.kind !== 'text') return;
		await navigator.clipboard?.writeText(view.value);
		toast(m.ai.copied);
	}

	// ---------- Tagesplan ----------
	const chosen = $derived(rows.filter((r) => r.checked));
	const slots = $derived(
		planSlots(
			chosen.map((r) => parseDuration(r.estimate)),
			start || '09:00'
		)
	);
	const slotOf = (r: PlanRow) => slots[chosen.indexOf(r)];
	const total = $derived(slots.reduce((s, x) => s + x.minutes, 0));
	const lastEnd = $derived(slots.at(-1)?.end);
	function planItems(): DayPlanItem[] {
		return chosen.map((r) => ({
			taskId: r.taskId,
			title: r.title,
			reason: r.reason,
			estimateMin: parseDuration(r.estimate),
			priority: r.priority,
			...(withTimes && slotOf(r)?.start ? { time: slotOf(r).start } : {})
		}));
	}

	const html = (md: string) => DOMPurify.sanitize(marked.parse(md, { async: false }));
	const selected = $derived(view?.kind === 'tree' ? count(nodes) : 0);
</script>

<dialog
	bind:this={dialogEl}
	onclose={() => aiPanel.req && close()}
	aria-labelledby="ai-title"
	data-testid="ai-panel"
>
	{#if req}
		<header>
			<span class="badge"><Icon name="sparkle" size={18} /></span>
			<div class="head">
				<h2 id="ai-title">{req.title}</h2>
				{#if req.subtitle}<p class="sub">{req.subtitle}</p>{/if}
			</div>
			<button class="icon-btn" aria-label={m.ai.close} onclick={close}><Icon name="x" /></button>
		</header>

		<div class="body">
			{#if phase === 'input' && req.input}
				<label class="input">
					<span>{req.input.label}</span>
					<!-- svelte-ignore a11y_autofocus -->
					<textarea
						class="field"
						rows="7"
						autofocus
						placeholder={req.input.placeholder}
						bind:value={input}
						onkeydown={(e) => {
							if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && input.trim()) run();
						}}></textarea>
				</label>
			{:else if phase === 'loading'}
				<div class="loading" role="status">
					<span class="dots"><i></i><i></i><i></i></span>
					{m.ai.working}
				</div>
			{:else if phase === 'error'}
				<p class="error" role="alert">{error}</p>
			{:else if view?.kind === 'tree'}
				<div class="select">
					<button class="link" onclick={() => setAll(nodes, true)}>{m.ai.selectAll}</button>
					<button class="link" onclick={() => setAll(nodes, false)}>{m.ai.selectNone}</button>
				</div>
				<ul class="tree" data-testid="ai-tree">
					{#each nodes as node, i (i)}
						{@render item(node, 0)}
					{/each}
				</ul>
			{:else if view?.kind === 'text'}
				<!-- Mit DOMPurify bereinigt -->
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				<div class="md" data-testid="ai-text">{@html html(view.value)}</div>
			{:else if view?.kind === 'plan'}
				{#if view.value.summary}<p class="summary">{view.value.summary}</p>{/if}
				<div class="plan-opts">
					<label class="start">
						{m.ai.planStart}
						<input class="field" type="time" bind:value={start} disabled={!withTimes} />
					</label>
					<label class="times" title={m.ai.planWithTimesHint}>
						<input type="checkbox" bind:checked={withTimes} />
						{m.ai.planWithTimes}
					</label>
				</div>
				<ol class="plan" data-testid="ai-plan">
					{#each rows as row (row.taskId)}
						{@const slot = row.checked ? slotOf(row) : undefined}
						<li class:off={!row.checked} data-testid="plan-row">
							<input type="checkbox" bind:checked={row.checked} aria-label={row.title} />
							<div class="plan-main">
								<button
									class="plan-title"
									title={m.ai.openTask}
									onclick={() => {
										ui.detailId = row.taskId;
										close();
									}}>{row.title}</button
								>
								<span class="reason">{row.reason}</span>
							</div>
							<div class="plan-edit">
								<span class="when">
									{#if !row.checked}
										&nbsp;
									{:else if withTimes && slot?.start}
										{slot.start}–{slot.end}
									{:else}
										{m.ai.allDay}
									{/if}
								</span>
								<input
									class="field est"
									aria-label="{m.ai.planEstimate}: {row.title}"
									placeholder="0:30"
									bind:value={row.estimate}
									disabled={!row.checked}
									onblur={() => {
										const v = parseDuration(row.estimate);
										row.estimate = v ? formatDuration(v) : '';
									}}
								/>
								<select
									class="field prio"
									aria-label="{m.ai.planPriority}: {row.title}"
									value={String(row.priority ?? '')}
									disabled={!row.checked}
									onchange={(e) => {
										const v = e.currentTarget.value;
										row.priority = v ? (Number(v) as 1 | 2 | 3) : null;
									}}
								>
									<option value="">{m.ai.planNone}</option>
									<option value="1">!1</option>
									<option value="2">!2</option>
									<option value="3">!3</option>
								</select>
							</div>
						</li>
					{/each}
				</ol>
				{#if chosen.length}
					<p class="plan-total">
						{withTimes && lastEnd
							? m.ai.planTotal(formatDuration(total), lastEnd)
							: m.ai.planTotalNoEnd(formatDuration(total))}
					</p>
				{/if}
			{/if}
		</div>

		<footer>
			{#if phase === 'result'}
				<span class="meta">{meta}</span>
			{:else if phase === 'loading'}
				<span class="meta">{m.ai.suggestionHint}</span>
			{/if}
			<span class="spacer"></span>
			{#if phase === 'input'}
				<button class="btn ghost" onclick={close}>{m.confirm.cancel}</button>
				<button class="btn primary" disabled={!input.trim()} onclick={run}>
					<Icon name="sparkle" size={16} />{m.ai.start}
				</button>
			{:else if phase === 'error'}
				<button class="btn ghost" onclick={close}>{m.ai.close}</button>
				<button class="btn primary" onclick={run}>{m.ai.again}</button>
			{:else if phase === 'result'}
				<button class="btn ghost" onclick={run}>{m.ai.again}</button>
				{#if view?.kind === 'text'}
					<button class="btn ghost" onclick={copy}>{m.ai.copy}</button>
				{/if}
				{#if req.apply}
					<button
						class="btn primary"
						disabled={busy ||
							(view?.kind === 'tree' && !selected) ||
							(view?.kind === 'plan' && !chosen.length)}
						onclick={apply}
					>
						{view?.kind === 'tree'
							? m.ai.addTasks(selected)
							: view?.kind === 'plan'
								? m.ai.planApply(chosen.length)
								: (req.applyLabel ?? m.ai.toNotes)}
					</button>
				{:else}
					<button class="btn primary" onclick={close}>{m.ai.close}</button>
				{/if}
			{/if}
		</footer>
	{/if}
</dialog>

{#snippet item(node: Node, depth: number)}
	<li style:--d={depth}>
		<label class="node" class:off={!node.checked}>
			<input type="checkbox" bind:checked={node.checked} aria-label={node.title} />
			<input class="title" bind:value={node.title} disabled={!node.checked} />
			{#if node.priority}<span class="prio prio-{node.priority}">!{node.priority}</span>{/if}
			{#if node.due}<span class="due">{node.due.split('-').reverse().join('.')}</span>{/if}
		</label>
		{#if node.children.length}
			<ul>
				{#each node.children as child, i (i)}
					{@render item(child, depth + 1)}
				{/each}
			</ul>
		{/if}
	</li>
{/snippet}

<style>
	dialog {
		border: 0;
		border-radius: 16px;
		padding: 0;
		width: min(560px, calc(100vw - 24px));
		max-height: min(80vh, 720px);
		background: var(--bg-raised);
		color: var(--text);
		box-shadow: var(--shadow);
	}
	dialog[open] {
		display: flex;
		flex-direction: column;
	}
	dialog::backdrop {
		background: rgb(0 0 0 / 0.4);
	}
	header {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 16px 16px 8px 20px;
	}
	.badge {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		flex: none;
		border-radius: 10px;
		color: var(--accent);
		background: color-mix(in srgb, var(--accent) 14%, transparent);
	}
	.head {
		flex: 1;
		min-width: 0;
	}
	h2 {
		margin: 4px 0 0;
		font-size: 1.0625rem;
	}
	.sub {
		margin: 2px 0 0;
		font-size: 0.8125rem;
		color: var(--text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.body {
		padding: 8px 20px 12px;
		overflow-y: auto;
		flex: 1;
	}
	.input {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 0.875rem;
		color: var(--text-muted);
	}
	.input textarea {
		width: 100%;
		resize: vertical;
		color: var(--text);
	}
	.loading {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 28px 0;
		color: var(--text-muted);
	}
	.dots {
		display: inline-flex;
		gap: 4px;
	}
	.dots i {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--accent);
		animation: pulse 1s infinite ease-in-out;
	}
	.dots i:nth-child(2) {
		animation-delay: 0.15s;
	}
	.dots i:nth-child(3) {
		animation-delay: 0.3s;
	}
	@keyframes pulse {
		0%,
		100% {
			opacity: 0.25;
			transform: scale(0.8);
		}
		50% {
			opacity: 1;
			transform: scale(1);
		}
	}
	.error {
		color: var(--danger);
		margin: 12px 0;
	}
	.select {
		display: flex;
		gap: 12px;
		margin-bottom: 6px;
	}
	.link {
		font-size: 0.8125rem;
		color: var(--accent);
	}
	.tree,
	.tree ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.tree ul {
		margin-left: 26px;
		border-left: 1px solid var(--border);
		padding-left: 6px;
	}
	.node {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 38px;
		border-radius: 8px;
		padding: 0 6px;
	}
	.node:hover {
		background: var(--bg-hover);
	}
	.node input[type='checkbox'] {
		width: 18px;
		height: 18px;
		accent-color: var(--accent);
		flex: none;
	}
	.node .title {
		flex: 1;
		min-width: 0;
		border: 0;
		background: transparent;
		padding: 6px 0;
		font: inherit;
		color: inherit;
		outline: none;
	}
	.node.off .title {
		color: var(--text-faint);
		text-decoration: line-through;
	}
	.prio {
		font-size: 0.75rem;
		font-weight: 700;
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
	.due {
		font-size: 0.75rem;
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}
	.md :global(:first-child) {
		margin-top: 0;
	}
	.md :global(h3) {
		font-size: 0.9375rem;
		margin: 14px 0 4px;
	}
	.md :global(ul) {
		padding-left: 20px;
	}
	.md :global(li) {
		margin: 4px 0;
	}
	.summary {
		color: var(--text-muted);
		margin: 0 0 10px;
	}
	.plan-opts {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 16px;
		margin: 0 0 8px;
		font-size: 0.875rem;
	}
	.plan-opts label {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}
	.start input {
		width: auto;
		min-height: 32px;
	}
	.plan {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.plan li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: start;
		gap: 4px 10px;
		padding: 8px 0;
		border-top: 1px solid var(--border);
	}
	.plan li > input[type='checkbox'] {
		margin-top: 4px;
	}
	.plan li.off .plan-main {
		opacity: 0.5;
	}
	.plan-main {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.plan-title {
		text-align: left;
		font-weight: 600;
		padding: 0;
	}
	.plan-title:hover {
		text-decoration: underline;
	}
	.reason {
		font-size: 0.8125rem;
		color: var(--text-muted);
	}
	.plan-edit {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.when {
		min-width: 86px;
		text-align: right;
		font-size: 0.8125rem;
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}
	.est {
		width: 58px;
		min-height: 30px;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.prio {
		width: auto;
		min-height: 30px;
	}
	@media (max-width: 560px) {
		.plan li {
			grid-template-columns: auto minmax(0, 1fr);
		}
		.plan-edit {
			grid-column: 2;
		}
		.when {
			min-width: 0;
			text-align: left;
		}
	}
	.plan-total {
		margin: 8px 0 0;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}
	footer {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		padding: 12px 16px 16px 20px;
		border-top: 1px solid var(--border);
	}
	.meta {
		flex: 1 1 140px;
		font-size: 0.75rem;
		color: var(--text-faint);
	}
	.spacer {
		flex: 1 1 0;
	}
	footer .btn {
		flex: none;
	}
	.btn.primary:disabled {
		opacity: 0.5;
	}
	@media (max-width: 640px) {
		dialog {
			margin: auto 0 0;
			width: 100vw;
			max-width: 100vw;
			max-height: 88vh;
			border-radius: 16px 16px 0 0;
		}
		footer {
			padding-bottom: calc(16px + env(safe-area-inset-bottom));
		}
	}
</style>
