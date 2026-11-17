<script lang="ts">
	/**
	 * Eine Aufgabenzeile im Outliner: Häkchen, editierbarer Titel, Datum/Priorität, Zeit und Aktionen.
	 * Tastatur (Enter, Tab, Pfeile …) meldet sie über `onkey` an die Liste; Wischen am Handy = erledigt/zurückschieben.
	 */
	import { daysFromToday, formatDateValue } from '#lib/domain/dates.ts';
	import type { Row } from '#lib/domain/tree.ts';
	import {
		entryMinutes,
		formatDuration,
		formatElapsed,
		parseTotalInput
	} from '#lib/domain/time.ts';
	import { isDone } from '#lib/domain/types.ts';
	import { isAged } from '#lib/domain/views.ts';
	import { m } from '#lib/i18n/index.ts';
	import { toggleDone } from '#lib/state/actions.ts';
	import { db, repo } from '#lib/state/app.ts';
	import { appearance } from '#lib/state/appearance.svelte.ts';
	import { timeSettings } from '#lib/state/time-settings.svelte.ts';
	import { timer, toggleTimer } from '#lib/state/timer.svelte.ts';
	import { replayKeys, ui } from '#lib/state/ui.svelte.ts';
	import { drag } from './drag.svelte';
	import Icon from './Icon.svelte';
	import { swipe } from './swipe';
	import { syncValue } from './sync-value';

	let {
		row,
		progress,
		minutes = 0,
		dim = false,
		showScheduled = false,
		agingDays,
		onkey,
		ondragstart,
		onaddsubtask,
		tree = true
	}: {
		row: Row;
		/** Gibt es in der Liste überhaupt Unteraufgaben? Sonst entfällt die Spalte fürs Aufklappen. */
		tree?: boolean;
		progress: { done: number; total: number } | null;
		/** Erfasste Minuten einschließlich Unteraufgaben */
		minutes?: number;
		dim?: boolean;
		showScheduled?: boolean;
		/** Gesetzt in der Inbox: Einträge älter als so viele Tage werden markiert. */
		agingDays?: number;
		onkey: (e: KeyboardEvent & { currentTarget: HTMLInputElement }) => void;
		/** Gesetzt, wenn die Zeile gezogen werden darf. */
		ondragstart?: (e: PointerEvent) => void;
		onaddsubtask?: () => void;
	} = $props();

	const task = $derived(row.task);
	const done = $derived(isDone(task));
	const dueIn = $derived(task.due ? daysFromToday(task.due, ui.now) : null);
	const aged = $derived(
		agingDays !== undefined && row.depth === 0 && !done && isAged(task, ui.now, agingDays)
	);
	let input = $state<HTMLInputElement>();
	const selected = $derived(ui.detailId === task.id);
	const running = $derived(timer.current?.taskId === task.id);

	/**
	 * Unsichtbare Kopie des Titels: Das Eingabefeld ist dadurch nur so breit wie sein Text.
	 * Der Rest der Zeile bleibt frei – ein Klick/Tipp dorthin öffnet die Details.
	 */
	let mirror = $state('');
	$effect(() => {
		const title = task.title;
		if (document.activeElement !== input) mirror = title;
	});

	/**
	 * Klick auf die Zeile öffnet die Details (abschaltbar in den Einstellungen).
	 * - Knöpfe der Zeile behalten ihre eigene Funktion.
	 * - Klick in den Titel: Am PC (Details als Spalte daneben) wird zusätzlich der Cursor
	 *   gesetzt; am Handy/schmalen Fenster nur bearbeitet, damit das Tippen frei bleibt.
	 */
	// ---------- Zeitfeld neben dem Play-Knopf ----------
	const ownMinutes = $derived(entryMinutes(task.timeEntries));
	let timeInvalid = $state(false);

	/** Eingabe übernehmen: Wert = neue Gesamtzeit, „+0:15“ = dazu, leer/0 = löschen. */
	function commitTime(field: HTMLInputElement) {
		const shown = ownMinutes ? formatDuration(ownMinutes) : '';
		if (field.value.trim() === shown) return;
		const total = parseTotalInput(field.value, ownMinutes);
		if (total === null) {
			// Unverständlich: nichts ändern, kurz rot markieren, alten Wert zurück
			timeInvalid = true;
			setTimeout(() => (timeInvalid = false), 1200);
		} else if (total !== ownMinutes) {
			void repo.setTimeTotal(task.id, total);
		}
		field.value = total === null ? shown : total ? formatDuration(total) : '';
	}

	function ontimekey(e: KeyboardEvent & { currentTarget: HTMLInputElement }) {
		if (e.key === 'Enter') {
			e.preventDefault();
			e.currentTarget.blur();
		} else if (e.key === 'Escape') {
			e.stopPropagation();
			e.currentTarget.value = ownMinutes ? formatDuration(ownMinutes) : '';
			e.currentTarget.blur();
		}
	}

	function onrowclick(e: MouseEvent) {
		if (!appearance.current.openDetailOnClick) return;
		const target = e.target as HTMLElement;
		if (target.closest('button, a, .time-edit')) return;
		if (target === input && !ui.docked) return;
		ui.detailId = task.id;
	}

	function onfocus() {
		ui.editingId = task.id;
		// Offene Detail-Spalte folgt der Zeile, in der man gerade ist (auch per Tastatur).
		if (ui.docked && ui.detailId && appearance.current.openDetailOnClick) ui.detailId = task.id;
	}

	// Fokus-Anfragen (nach Enter, Tab, Pfeiltasten …) erfüllen, sobald die Zeile existiert.
	$effect(() => {
		const f = ui.focus;
		if (!f || f.id !== task.id || !input) return;
		input.focus();
		const len = input.value.length;
		const pos = f.caret === undefined || f.caret === 'end' ? len : Math.min(f.caret, len);
		input.setSelectionRange(pos, pos);
		ui.focus = null;
		replayKeys(input);
	});

	function onblur() {
		if (ui.editingId === task.id) ui.editingId = null;
		if (input) mirror = input.value;
		// Leere Zeilen ohne Unteraufgaben verschwinden beim Verlassen.
		if (input?.value.trim() || row.hasChildren) return;
		const id = task.id;
		setTimeout(async () => {
			if (document.activeElement === input) return;
			const t = await db.tasks.get(id);
			if (t && !t.deletedAt && !t.title.trim()) await repo.deleteTask(id);
		}, 200);
	}
</script>

<div
	class="row"
	class:dim
	class:done
	class:selected
	class:moving={drag.moving.includes(task.id)}
	style:--depth={row.depth}
	data-testid="task-row"
	data-row-id={task.id}
	data-depth={row.depth}
	use:swipe={{
		onright: () => toggleDone(task),
		onleft: () => (ui.postponeId = task.id)
	}}
	onclick={onrowclick}
	role="presentation"
>
	{#if ondragstart}
		<button
			class="grip"
			tabindex="-1"
			aria-label={m.task.drag}
			title={m.task.drag}
			onpointerdown={ondragstart}
		>
			<Icon name="grip" size={16} />
		</button>
	{:else}
		<span class="grip"></span>
	{/if}

	{#if tree}
		<button
			class="twisty"
			class:open={!task.collapsed}
			class:hidden={!row.hasChildren}
			tabindex="-1"
			aria-label={task.collapsed ? m.task.expand : m.task.collapse}
			onclick={() => repo.updateTask(task.id, { collapsed: !task.collapsed })}
		>
			<Icon name="chevron" size={14} />
		</button>
	{/if}

	<button
		class="check prio-{task.priority ?? 0}"
		role="checkbox"
		aria-checked={done}
		aria-label={m.task.done}
		tabindex="-1"
		onclick={() => toggleDone(task)}
	>
		{#if done}<Icon name="check" size={14} />{/if}
	</button>

	<span class="title-wrap" data-value={mirror || m.task.newPlaceholder}>
		<input
			bind:this={input}
			class="title"
			size="1"
			use:syncValue={task.title}
			placeholder={m.task.newPlaceholder}
			aria-label={m.task.title}
			enterkeyhint="next"
			autocomplete="off"
			oninput={(e) => {
				mirror = e.currentTarget.value;
				repo.updateTask(task.id, { title: e.currentTarget.value });
			}}
			onkeydown={onkey}
			{onfocus}
			{onblur}
		/>
	</span>
	<span class="spacer"></span>

	<span class="meta">
		{#if aged}
			<span class="aged" data-testid="aged">{m.inbox.agedBadge}</span>
		{/if}
		{#if progress}
			<span class="progress" title="Unteraufgaben">{progress.done}/{progress.total}</span>
		{/if}
		{#if task.priority}
			<span class="prio prio-{task.priority}">!{task.priority}</span>
		{/if}
		{#if task.due}
			<span class="due" class:overdue={!done && dueIn! < 0} class:today={!done && dueIn === 0}>
				{formatDateValue(task.due, ui.now)}
			</span>
		{/if}
		{#if showScheduled && task.scheduled}
			<span class="sched">→ {formatDateValue(task.scheduled, ui.now)}</span>
		{/if}
		{#if minutes !== ownMinutes && timeSettings.enabled}
			<span class="sum" title={m.time.sumTitle} data-testid="row-sum">
				Σ {formatDuration(minutes)}
			</span>
		{/if}
		{#if task.postponeCount > 0}
			<span class="count" title={m.task.postponedTimes(task.postponeCount)}>
				<Icon name="repeat" size={12} />{task.postponeCount}
			</span>
		{/if}
	</span>

	<span class="actions">
		{#if onaddsubtask && !done}
			<button
				class="icon-btn subtask-btn"
				aria-label={m.task.addSubtask}
				title={m.task.addSubtask}
				onclick={onaddsubtask}
			>
				<Icon name="subtask" size={16} />
			</button>
		{/if}
		{#if !done}
			<button
				class="icon-btn postpone-btn"
				aria-label={m.task.postpone}
				title={m.task.postpone}
				onclick={() => (ui.postponeId = ui.postponeId === task.id ? null : task.id)}
			>
				<Icon name="clock" size={16} />
			</button>
		{/if}
		<button
			class="icon-btn"
			aria-label={m.task.details}
			title={m.task.details}
			onclick={() => (ui.detailId = task.id)}
		>
			<Icon name="more" size={16} />
		</button>
	</span>

	{#if timeSettings.enabled}
		<input
			class="time-edit"
			class:empty={!ownMinutes}
			class:invalid={timeInvalid}
			value={ownMinutes ? formatDuration(ownMinutes) : ''}
			placeholder="0:00"
			aria-label={m.time.rowLabel}
			title={m.time.rowHint}
			autocomplete="off"
			size="4"
			data-testid="row-time"
			onfocus={(e) => e.currentTarget.select()}
			onkeydown={ontimekey}
			onblur={(e) => commitTime(e.currentTarget)}
		/>
	{/if}
	{#if timeSettings.enabled && (!done || running)}
		<button
			class="timer"
			class:running
			aria-label={running ? m.time.stop : m.time.start}
			aria-pressed={running}
			title={running ? m.time.stop : m.time.start}
			data-testid="timer-button"
			onclick={() => toggleTimer(task.id)}
		>
			<Icon name={running ? 'stop' : 'play'} size={14} />
			{#if running}<span>{formatElapsed(timer.elapsed)}</span>{/if}
		</button>
	{/if}
</div>

<style>
	.row {
		display: flex;
		align-items: center;
		gap: 4px;
		min-height: var(--row-h);
		/* schmaler Rand links: dort erscheint beim Drüberfahren der Ziehgriff */
		padding-left: calc(var(--depth) * var(--indent) + var(--gutter));
		padding-right: 4px;
		border-radius: 8px;
		touch-action: pan-y;
		position: relative;
	}
	.row:hover,
	.row:focus-within {
		background: var(--bg-hover);
	}
	.row.moving {
		opacity: 0.35;
	}
	.grip {
		position: absolute;
		left: calc(var(--depth) * var(--indent) - 1px);
		top: 50%;
		translate: 0 -50%;
		width: 16px;
		height: 28px;
		display: grid;
		place-items: center;
		color: var(--text-faint);
		cursor: grab;
		touch-action: none;
		opacity: 0;
	}
	.row:hover .grip,
	.row:focus-within .grip {
		opacity: 1;
	}
	@media (pointer: coarse) {
		.grip {
			opacity: 0.6;
		}
	}
	.row:global([data-swipe='right']) {
		box-shadow: inset 4px 0 0 var(--ok);
	}
	.row:global([data-swipe='left']) {
		box-shadow: inset -4px 0 0 var(--warn);
	}
	.dim .title,
	.done .title {
		color: var(--text-muted);
	}
	.done .title {
		text-decoration: line-through;
	}
	.twisty {
		width: 20px;
		height: 28px;
		display: grid;
		place-items: center;
		color: var(--text-faint);
		flex: none;
		transition: transform 120ms;
	}
	.twisty.open :global(svg) {
		transform: rotate(90deg);
	}
	.twisty.hidden {
		visibility: hidden;
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
	.row.selected {
		background: color-mix(in srgb, var(--accent) 12%, transparent);
	}
	/* Feld und unsichtbare Textkopie liegen übereinander → Feld ist so breit wie der Text */
	.title-wrap {
		display: inline-grid;
		flex: 0 1 auto;
		min-width: 0;
	}
	.title-wrap::after {
		content: attr(data-value) ' ';
		grid-area: 1 / 1;
		visibility: hidden;
		white-space: pre;
		height: 0;
		padding: 0 8px;
		overflow: hidden;
	}
	.spacer {
		flex: 1;
		align-self: stretch;
		min-width: 12px;
		cursor: pointer;
	}
	.title {
		grid-area: 1 / 1;
		/* size="1" + 100 %: die Breite kommt allein von der Textkopie */
		width: 100%;
		min-width: 0;
		border: 0;
		background: transparent;
		/* Höhe folgt der Dichte-Einstellung */
		height: calc(var(--row-h) - 2px);
		padding: 0 6px;
		outline: none;
	}
	.meta {
		display: flex;
		gap: 6px;
		align-items: center;
		font-size: 0.75rem;
		color: var(--text-muted);
		flex: none;
	}
	.progress {
		font-variant-numeric: tabular-nums;
	}
	.prio {
		font-weight: 600;
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
	.due.today {
		color: var(--accent);
		font-weight: 600;
	}
	.due.overdue {
		color: var(--danger);
		font-weight: 600;
	}
	.aged {
		padding: 1px 6px;
		border-radius: 6px;
		background: color-mix(in srgb, var(--warn) 18%, transparent);
		color: var(--warn);
		font-weight: 600;
	}
	.count {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		color: var(--warn);
	}
	.actions {
		display: flex;
		opacity: 0;
		flex: none;
	}
	.row:hover .actions,
	.row:focus-within .actions {
		opacity: 1;
	}
	@media (pointer: coarse) {
		.actions {
			opacity: 1;
		}
	}
	.sum {
		font-variant-numeric: tabular-nums;
	}
	/* Erfasste Zeit: sieht aus wie Text, ist aber ein Feld – anklicken und überschreiben */
	.time-edit {
		width: 5.2ch;
		box-sizing: content-box;
		height: 24px;
		padding: 0 5px;
		flex: none;
		text-align: right;
		font-size: 0.8125rem;
		font-variant-numeric: tabular-nums;
		font-weight: 600;
		border: 1px solid transparent;
		border-radius: 6px;
		background: transparent;
		outline: none;
	}
	.time-edit.empty {
		font-weight: 400;
	}
	.time-edit::placeholder {
		color: var(--text-faint);
		opacity: 0.6;
	}
	.row:hover .time-edit,
	.time-edit:hover {
		border-color: var(--border);
	}
	.time-edit:focus {
		border-color: var(--accent);
		background: var(--bg-raised);
	}
	.time-edit.invalid {
		border-color: var(--danger);
		color: var(--danger);
	}
	/* Play/Stop: immer sichtbar */
	.timer {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		height: 26px;
		min-width: 26px;
		padding: 0 5px;
		justify-content: center;
		border-radius: 13px;
		border: 1px solid var(--border-strong);
		color: var(--text-muted);
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
		flex: none;
	}
	.timer:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
	.timer.running {
		padding: 0 9px 0 7px;
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-contrast);
		font-weight: 600;
	}
	@media (max-width: 520px) {
		.actions .icon-btn {
			width: 28px;
		}
		/*
		 * Schmale Bildschirme: der Titel braucht den Platz.
		 * Unteraufgaben gehen über die Leiste über der Tastatur, Zurückschieben per Wisch nach
		 * links. Das Zeitfeld erscheint erst, wenn Zeit erfasst ist (sonst über Play oder Details).
		 */
		.actions .subtask-btn,
		.actions .postpone-btn,
		.time-edit.empty:not(:focus) {
			display: none;
		}
		.meta .sched,
		.meta .count {
			display: none;
		}
	}
</style>
