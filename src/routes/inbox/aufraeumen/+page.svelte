<script lang="ts">
	/**
	 * Inbox aufräumen: eine Karte nach der anderen.
	 * Auf der Karte Titel, Datum, Priorität und „Irgendwann“ setzen – dann die Karte auf einen
	 * Pool oder ein Projekt ziehen (oder die Kachel antippen).
	 * Wischen: nach links = löschen, nach rechts = überspringen. Tasten: 1–9, I, Entf, →.
	 */
	import { resolve } from '$app/paths';
	import { formatDistanceToNow } from 'date-fns';
	import { de } from 'date-fns/locale';
	import { INBOX_ID } from '#lib/db/repo.ts';
	import { addDaysIso, formatDateValue, todayIso } from '#lib/domain/dates.ts';
	import { canSnooze } from '#lib/domain/triage.ts';
	import { isOpen, type Priority, type Task } from '#lib/domain/types.ts';
	import { DEFAULT_INBOX_AGING_DAYS, isAged } from '#lib/domain/views.ts';
	import { m } from '#lib/i18n/index.ts';
	import { repo } from '#lib/state/app.ts';
	import { live } from '#lib/state/live.svelte.ts';
	import { q } from '#lib/state/queries.ts';
	import { markTriageDone, snoozeTriage, triage } from '#lib/state/triage.svelte.ts';
	import { toast, ui } from '#lib/state/ui.svelte.ts';
	import Badge from '#lib/ui/Badge.svelte';
	import Icon from '#lib/ui/Icon.svelte';

	const pools = live(() => q.pools, []);
	const projects = live(() => q.projects, []);
	const tasks = live(() => q.poolTasks(INBOX_ID), []);
	const agingDays = live(
		() => q.setting('inboxAgingDays', DEFAULT_INBOX_AGING_DAYS),
		DEFAULT_INBOX_AGING_DAYS
	);

	const targets = $derived(pools.current.filter((p) => p.kind === 'pool' && !p.archived));
	const projectsOf = (poolId: string) =>
		projects.current.filter((pr) => pr.poolId === poolId && !pr.archived);

	let skipped = $state<string[]>([]);
	let handled = $state(0);
	/** Auf der aktuellen Karte gewählt: als „Irgendwann“ ablegen */
	let someday = $state(false);

	const remaining = $derived(
		tasks.current
			.filter((t) => t.parentId === null && isOpen(t) && !skipped.includes(t.id))
			.sort((a, b) => a.createdAt - b.createdAt)
	);
	const current = $derived(remaining[0]);
	const next = $derived(remaining[1]);
	const total = $derived(handled + remaining.length);
	const forced = $derived(triage.forced);
	const today = $derived(todayIso(ui.now));
	const tomorrow = $derived(addDaysIso(ui.now, 1));

	// Fertig (alles zugeordnet/gelöscht) → fälliger Aufräum-Termin ist erledigt
	$effect(() => {
		if (tasks.loaded && triage.due && !remaining.length && !skipped.length) {
			void markTriageDone(triage.due.key);
		}
	});

	// ---------- Aktionen ----------

	/**
	 * Immer nur eine Aktion zur Zeit: Während die Karte wegfliegt, ist sie noch die aktuelle –
	 * ein schneller zweiter Klick würde sonst dieselbe Karte nochmal verschieben.
	 */
	let busy = false;
	async function once(action: () => Promise<void>) {
		if (busy) return;
		busy = true;
		try {
			await action();
		} finally {
			busy = false;
		}
	}

	const assign = (poolId: string, projectId: string | null = null) =>
		once(() => assignNow(poolId, projectId));
	const remove = () => once(removeNow);
	const skip = () => once(skipNow);

	async function assignNow(poolId: string, projectId: string | null) {
		const t = current;
		if (!t) return;
		const asSomeday = someday;
		await fly(target(`project:${projectId}`) ?? target(`pool:${poolId}`));
		await repo.moveTo(t.id, { poolId, projectId }, asSomeday ? { someday: true } : {});
		const where = projects.current.find((p) => p.id === projectId)?.name ?? poolName(poolId);
		toast(m.task.moved(where), {
			label: m.confirm.undo,
			run: () => repo.moveTo(t.id, { poolId: INBOX_ID, projectId: null }, { someday: false })
		});
		handled++;
		someday = false;
	}

	async function removeNow() {
		const t = current;
		if (!t) return;
		await fly(null, -1);
		const ids = await repo.deleteTask(t.id, { withChildren: true });
		toast(m.confirm.deleted, { label: m.confirm.undo, run: () => repo.restoreTasks(ids) });
		handled++;
		someday = false;
	}

	async function skipNow() {
		if (!current || forced) return;
		const id = current.id;
		await fly(null, 1);
		skipped = [...skipped, id];
		handled++;
		someday = false;
	}

	const update = (patch: Partial<Task>) => current && repo.updateTask(current.id, patch);
	const setDate = (date: string) =>
		update({ due: current?.due?.date === date ? undefined : { date } });
	const setPriority = (p: Priority) => update({ priority: current?.priority === p ? null : p });
	const poolName = (id: string) => pools.current.find((p) => p.id === id)?.name ?? '';

	function onkeydown(e: KeyboardEvent) {
		const el = e.target as HTMLElement;
		if (el.closest('input, textarea, select') || ui.dialog || !current) return;
		if (/^[1-9]$/.test(e.key) && targets[Number(e.key) - 1]) assign(targets[Number(e.key) - 1].id);
		else if (e.key === 'i' || e.key === 'I') someday = !someday;
		else if (e.key === 'Delete') remove();
		else if (e.key === 'ArrowRight') skip();
		else return;
		e.preventDefault();
	}

	// ---------- Ziehen der Karte ----------

	let card = $state<HTMLElement>();
	let drag = $state<{ dx: number; dy: number } | null>(null);
	let over = $state<string | null>(null);
	let flying = $state<string | null>(null);
	const SWIPE = 110;

	const target = (key: string) =>
		document.querySelector<HTMLElement>(`[data-triage-target="${key}"]`);

	/** Karte zum Ziel (oder zur Seite) fliegen lassen, dann geht es weiter */
	function fly(to: HTMLElement | null, side: -1 | 1 = 1): Promise<void> {
		if (!card || matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
		const from = card.getBoundingClientRect();
		let x = side * (window.innerWidth / 2 + from.width);
		let y = (drag?.dy ?? 0) + 40;
		if (to) {
			const b = to.getBoundingClientRect();
			x = b.left + b.width / 2 - (from.left - (drag?.dx ?? 0) + from.width / 2);
			y = b.top + b.height / 2 - (from.top - (drag?.dy ?? 0) + from.height / 2);
		}
		flying = `translate(${x}px, ${y}px) rotate(${side * 12}deg) scale(${to ? 0.25 : 1})`;
		drag = null;
		return new Promise((r) =>
			setTimeout(() => {
				flying = null;
				r();
			}, 220)
		);
	}

	function onpointerdown(e: PointerEvent) {
		if (e.button !== 0 || (e.target as HTMLElement).closest('input, textarea, button, select, a'))
			return;
		const sx = e.clientX;
		const sy = e.clientY;
		let started = false;

		const move = (ev: PointerEvent) => {
			const dx = ev.clientX - sx;
			const dy = ev.clientY - sy;
			if (!started) {
				if (Math.hypot(dx, dy) < 8) return;
				started = true;
			}
			ev.preventDefault();
			drag = { dx, dy };
			const el = document.elementFromPoint(ev.clientX, ev.clientY);
			over = el?.closest<HTMLElement>('[data-triage-target]')?.dataset.triageTarget ?? null;
		};
		const up = () => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
			window.removeEventListener('pointercancel', cancel);
			const hit = over;
			const dx = drag?.dx ?? 0;
			over = null;
			if (!started) return;
			if (hit) void dropOn(hit);
			else if (dx < -SWIPE) void remove();
			else if (dx > SWIPE && !forced) void skip();
			else drag = null;
		};
		const cancel = () => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
			window.removeEventListener('pointercancel', cancel);
			drag = null;
			over = null;
		};
		window.addEventListener('pointermove', move, { passive: false });
		window.addEventListener('pointerup', up);
		window.addEventListener('pointercancel', cancel);
	}

	function dropOn(key: string) {
		const [kind, id] = key.split(':');
		if (kind === 'trash') return remove();
		if (kind === 'pool') return assign(id);
		if (kind === 'project') {
			const pr = projects.current.find((p) => p.id === id);
			if (pr) return assign(pr.poolId, pr.id);
		}
		drag = null;
	}

	const cardTransform = $derived(
		flying ?? (drag ? `translate(${drag.dx}px, ${drag.dy}px) rotate(${drag.dx / 18}deg)` : '')
	);
	const swipeHint = $derived(
		!drag || over ? null : drag.dx < -SWIPE ? 'delete' : drag.dx > SWIPE && !forced ? 'skip' : null
	);
</script>

<svelte:window {onkeydown} />

<header>
	{#if !forced}
		<a class="icon-btn back" href={resolve('/inbox')} aria-label={m.inbox.back}
			><Icon name="chevron" /></a
		>
	{/if}
	<h1>{m.inbox.triage}</h1>
	{#if current}<span class="progress">{m.inbox.progress(handled + 1, total)}</span>{/if}
</header>

{#if forced && current && triage.due}
	<div class="forced" role="status" data-testid="triage-forced">
		<div>
			<strong>{m.inbox.forcedTitle}</strong>
			<span>{m.inbox.forcedText(remaining.length)}</span>
		</div>
		{#if canSnooze(triage.settings, triage.state, triage.due)}
			<button class="btn" onclick={() => triage.due && snoozeTriage(triage.due)}>
				{m.inbox.snooze(triage.settings.snoozeMinutes)}
			</button>
		{/if}
	</div>
{/if}

{#if current}
	<div class="stage">
		{#if next}<div class="card ghost" aria-hidden="true"></div>{/if}
		{#key current.id}
			<article
				bind:this={card}
				class="card triage-card"
				class:dragging={!!drag}
				class:flying={!!flying}
				class:hint-delete={swipeHint === 'delete'}
				class:hint-skip={swipeHint === 'skip'}
				style:transform={cardTransform}
				data-testid="triage-card"
				{onpointerdown}
			>
				<div class="grab" aria-hidden="true"><Icon name="grip" size={16} /></div>
				<input
					class="title"
					value={current.title}
					aria-label={m.task.title}
					onchange={(e) => update({ title: e.currentTarget.value })}
				/>
				<p class="meta">
					{formatDistanceToNow(current.createdAt, { locale: de, addSuffix: true })}
					{#if isAged(current, ui.now, agingDays.current)}
						· <span class="aged">{m.inbox.agedBadge}</span>
					{/if}
				</p>
				<textarea
					class="field notes"
					rows="2"
					placeholder={m.task.notesPlaceholder}
					aria-label={m.task.notes}
					value={current.notes}
					onchange={(e) => update({ notes: e.currentTarget.value })}></textarea>

				<div class="fields">
					<div class="seg" role="group" aria-label={m.inbox.cardDate}>
						<button aria-pressed={current.due?.date === today} onclick={() => setDate(today)}
							>{m.quickAdd.today}</button
						>
						<button aria-pressed={current.due?.date === tomorrow} onclick={() => setDate(tomorrow)}
							>{m.quickAdd.tomorrow}</button
						>
						<label
							class="date"
							class:on={!!current.due &&
								current.due.date !== today &&
								current.due.date !== tomorrow}
						>
							<Icon name="calendar" size={15} />
							<span>
								{current.due && current.due.date !== today && current.due.date !== tomorrow
									? formatDateValue(current.due, ui.now)
									: ''}
							</span>
							<input
								type="date"
								aria-label={m.quickAdd.pickDate}
								value={current.due?.date ?? ''}
								onchange={(e) =>
									update({
										due: e.currentTarget.value ? { date: e.currentTarget.value } : undefined
									})}
							/>
						</label>
					</div>
					<div class="seg" role="group" aria-label={m.quickAdd.priority}>
						{#each [1, 2, 3] as const as p (p)}
							<button
								class="prio-{p}"
								aria-pressed={current.priority === p}
								onclick={() => setPriority(p)}>!{p}</button
							>
						{/each}
					</div>
					<button
						class="btn someday"
						class:primary={someday}
						aria-pressed={someday}
						onclick={() => (someday = !someday)}
					>
						<Icon name="archive" size={16} />{m.inbox.someday}
					</button>
				</div>

				{#if swipeHint}
					<div class="stamp {swipeHint}">
						{swipeHint === 'delete' ? m.inbox.delete : m.inbox.skip}
					</div>
				{/if}
			</article>
		{/key}
	</div>

	<p class="hint">{m.inbox.dragHint}</p>

	<section class="targets" aria-label={someday ? m.inbox.someDayPick : m.inbox.assignTo}>
		<h2>{someday ? m.inbox.someDayPick : m.inbox.assignTo}</h2>
		<div class="grid">
			{#each targets as p, i (p.id)}
				<div class="pool-group" style:--c={p.color}>
					<button
						class="tile pool"
						class:over={over === `pool:${p.id}`}
						data-triage-target="pool:{p.id}"
						onclick={() => assign(p.id)}
					>
						<kbd>{i + 1}</kbd><Badge color={p.color} icon={p.icon} />{p.name}
					</button>
					{#each projectsOf(p.id) as pr (pr.id)}
						<button
							class="tile project"
							class:over={over === `project:${pr.id}`}
							data-triage-target="project:{pr.id}"
							onclick={() => assign(p.id, pr.id)}
						>
							<Badge color={pr.color} icon={pr.icon} size={14} />{pr.name}
						</button>
					{/each}
				</div>
			{/each}
		</div>
		<div class="row">
			<button
				class="tile trash"
				class:over={over === 'trash'}
				data-triage-target="trash"
				onclick={remove}
			>
				<Icon name="trash" size={16} />{m.inbox.delete}
			</button>
			{#if !forced}
				<button class="btn ghost" onclick={skip}
					>{m.inbox.skip}<Icon name="chevron" size={16} /></button
				>
			{/if}
		</div>
		<p class="keys">{m.inbox.keyHint}</p>
	</section>
{:else if tasks.loaded}
	<div class="done">
		<p>{m.inbox.done}</p>
		<a class="btn" href={resolve('/inbox')}>{m.inbox.back}</a>
	</div>
{/if}

<style>
	header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 12px;
	}
	.back :global(svg) {
		transform: rotate(180deg);
	}
	h1 {
		font-size: 1.5rem;
		margin: 0;
		flex: 1;
	}
	.progress {
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}
	.forced {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 14px;
		margin-bottom: 14px;
		border-radius: var(--radius-card);
		background: color-mix(in srgb, var(--warn) 16%, var(--bg-raised));
		border: 1px solid color-mix(in srgb, var(--warn) 40%, var(--border));
	}
	.forced div {
		flex: 1;
		display: flex;
		flex-direction: column;
	}
	.forced span {
		font-size: 0.875rem;
		color: var(--text-muted);
	}

	/* ---------- Kartenstapel ---------- */
	.stage {
		position: relative;
		max-width: 560px;
		margin: 0 auto;
	}
	.card.ghost {
		position: absolute;
		inset: 10px 14px -10px;
		opacity: 0.55;
		z-index: 0;
	}
	.triage-card {
		position: relative;
		z-index: 1;
		padding: 18px 18px 16px;
		box-shadow: var(--shadow);
		touch-action: none;
		cursor: grab;
		user-select: none;
		transition:
			transform 220ms ease,
			opacity 220ms ease;
	}
	.triage-card.dragging {
		/* Die Karte darf die Ziele darunter nicht verdecken (Erkennung per elementFromPoint) */
		pointer-events: none;
		transition: none;
		cursor: grabbing;
		z-index: 60;
	}
	.triage-card.flying {
		opacity: 0;
	}
	.triage-card.hint-delete {
		border-color: var(--danger);
	}
	.triage-card.hint-skip {
		border-color: var(--accent);
	}
	.grab {
		position: absolute;
		top: 6px;
		left: 50%;
		transform: translateX(-50%) rotate(90deg);
		color: var(--text-faint);
	}
	.title {
		width: 100%;
		font-size: 1.25rem;
		font-weight: 600;
		border: 0;
		background: transparent;
		outline: none;
		padding: 4px 0;
		user-select: text;
	}
	.meta {
		margin: 2px 0 10px;
		font-size: 0.8125rem;
		color: var(--text-faint);
	}
	.aged {
		color: var(--warn);
		font-weight: 600;
	}
	.notes {
		width: 100%;
		resize: vertical;
		font-size: 0.875rem;
		user-select: text;
	}
	.fields {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 10px;
	}
	.seg {
		display: inline-flex;
		border: 1px solid var(--border);
		border-radius: 8px;
		overflow: hidden;
	}
	.seg > button,
	.seg > .date {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		min-height: 34px;
		padding: 0 10px;
		font-size: 0.875rem;
		color: var(--text-muted);
		border-right: 1px solid var(--border);
		position: relative;
		cursor: pointer;
	}
	.seg > :last-child {
		border-right: 0;
	}
	.seg > [aria-pressed='true'],
	.seg > .date.on {
		background: var(--accent);
		color: var(--accent-contrast);
	}
	.date input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}
	.prio-1:not([aria-pressed='true']) {
		color: var(--prio-1);
	}
	.prio-2:not([aria-pressed='true']) {
		color: var(--prio-2);
	}
	.prio-3:not([aria-pressed='true']) {
		color: var(--prio-3);
	}
	.btn.someday {
		min-height: 36px;
	}
	.stamp {
		position: absolute;
		top: 16px;
		padding: 4px 10px;
		border: 3px solid;
		border-radius: 8px;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		transform: rotate(-12deg);
	}
	.stamp.delete {
		right: 16px;
		color: var(--danger);
	}
	.stamp.skip {
		left: 16px;
		color: var(--accent);
		transform: rotate(12deg);
	}
	.hint {
		text-align: center;
		font-size: 0.8125rem;
		color: var(--text-faint);
		margin: 14px 0 6px;
	}

	/* ---------- Ziele ---------- */
	h2 {
		font-size: 0.875rem;
		color: var(--text-muted);
		margin: 0 0 8px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
		gap: 10px;
	}
	.pool-group {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 6px;
		border-radius: var(--radius-card);
		background: color-mix(in srgb, var(--c) 7%, var(--bg-raised));
		border: 1px solid var(--border);
	}
	.tile {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		padding: 0 12px;
		border-radius: 10px;
		border: 1px dashed transparent;
		text-align: left;
		transition:
			background 120ms,
			border-color 120ms,
			transform 120ms;
	}
	.tile:hover {
		background: var(--bg-hover);
	}
	.tile.pool {
		font-weight: 600;
		min-height: 52px;
		background: var(--bg-raised);
		border-color: var(--border);
	}
	.tile.project {
		min-height: 38px;
		font-size: 0.875rem;
		color: var(--text-muted);
	}
	.tile.over {
		border: 2px solid var(--accent);
		background: color-mix(in srgb, var(--accent) 18%, var(--bg-raised));
		transform: scale(1.03);
		color: var(--text);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 10px;
	}
	.tile.trash {
		color: var(--danger);
		border-color: color-mix(in srgb, var(--danger) 40%, transparent);
	}
	.tile.trash.over {
		border-color: var(--danger);
		background: color-mix(in srgb, var(--danger) 16%, var(--bg-raised));
	}
	kbd {
		font-size: 0.6875rem;
		color: var(--text-faint);
		font-family: inherit;
	}
	.keys {
		font-size: 0.75rem;
		color: var(--text-faint);
	}
	@media (pointer: coarse) {
		kbd,
		.keys {
			display: none;
		}
	}
	.done {
		text-align: center;
		padding: 48px 0;
		font-size: 1.125rem;
	}
</style>
