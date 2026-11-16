<script lang="ts">
	/** Zeit an einer Aufgabe: Timer, Eingabe (z. B. „0,5h“ oder „0:30“) mit Datum, Liste der Einträge. */
	import { todayIso } from '#lib/domain/dates.ts';
	import {
		entryMinutes,
		formatDuration,
		formatElapsed,
		parseDuration,
		totalsWithChildren
	} from '#lib/domain/time.ts';
	import type { Task } from '#lib/domain/types.ts';
	import { m } from '#lib/i18n/index.ts';
	import { db, repo } from '#lib/state/app.ts';
	import { live } from '#lib/state/live.svelte.ts';
	import { timer, toggleTimer } from '#lib/state/timer.svelte.ts';
	import { ui } from '#lib/state/ui.svelte.ts';
	import Icon from './Icon.svelte';

	let { task }: { task: Task } = $props();

	const running = $derived(timer.current?.taskId === task.id);
	const entries = $derived(
		[...(task.timeEntries ?? [])].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
	);
	const own = $derived(entryMinutes(task.timeEntries));

	// Summe einschließlich Unteraufgaben (nur anzeigen, wenn sie sich unterscheidet)
	const poolTasks = live(() => {
		const poolId = task.poolId;
		return () =>
			db.tasks
				.where('poolId')
				.equals(poolId)
				.filter((t) => !t.deletedAt)
				.toArray();
	}, []);
	const withChildren = $derived(totalsWithChildren(poolTasks.current).get(task.id) ?? own);

	// ---------- Eingabe ----------
	let text = $state('');
	let date = $state('');
	const minutes = $derived(parseDuration(text));
	const today = $derived(todayIso(ui.now));

	async function add(e: SubmitEvent) {
		e.preventDefault();
		if (!minutes) return;
		const entry = { minutes, date: date || today };
		// Sofort leeren – wer gleich weitertippt, beginnt schon den nächsten Eintrag.
		// Das Datum springt zurück: der nächste Eintrag gilt wieder für heute.
		text = '';
		date = '';
		await repo.addTime(task.id, entry);
	}

	function changeDuration(entryId: string, input: HTMLInputElement, before: number) {
		const parsed = parseDuration(input.value);
		if (parsed) void repo.updateTime(task.id, entryId, { minutes: parsed });
		input.value = formatDuration(parsed ?? before);
	}
</script>

<section class="time" data-testid="time-section">
	<div class="head">
		<span class="lbl">{m.time.section}</span>
		<span class="total" data-testid="time-total">
			{formatDuration(own)}
			{#if withChildren !== own}
				<small>{m.time.withChildren(formatDuration(withChildren))}</small>
			{/if}
		</span>
		<button
			class="btn"
			class:primary={running}
			aria-pressed={running}
			onclick={() => toggleTimer(task.id)}
		>
			<Icon name={running ? 'stop' : 'play'} size={15} />
			{running ? formatElapsed(timer.elapsed) : m.time.start}
		</button>
	</div>

	<form class="add" onsubmit={add}>
		<input
			class="field duration"
			bind:value={text}
			placeholder={m.time.durationPlaceholder}
			aria-label={m.time.duration}
			aria-invalid={!!text && !minutes}
			autocomplete="off"
			inputmode="text"
		/>
		<input
			class="field"
			type="date"
			aria-label={m.time.date}
			value={date || today}
			max={today}
			onchange={(e) => (date = e.currentTarget.value)}
		/>
		<button class="btn" type="submit" disabled={!minutes}>{m.time.add}</button>
		<span class="hint" class:error={!!text && !minutes}>
			{#if minutes}
				= {formatDuration(minutes)} {m.time.hours}
			{:else if text}
				{m.time.invalid}
			{:else}
				{m.time.durationHint}
			{/if}
		</span>
	</form>

	{#if entries.length}
		<ul>
			{#each entries as e (e.id)}
				<li data-testid="time-entry">
					<input
						class="field"
						type="date"
						aria-label={m.time.date}
						value={e.date}
						onchange={(ev) =>
							ev.currentTarget.value &&
							repo.updateTime(task.id, e.id, { date: ev.currentTarget.value })}
					/>
					<input
						class="field duration"
						aria-label={m.time.duration}
						value={formatDuration(e.minutes)}
						onchange={(ev) => changeDuration(e.id, ev.currentTarget, e.minutes)}
					/>
					<button
						class="icon-btn"
						aria-label={m.time.deleteEntry}
						title={m.time.deleteEntry}
						onclick={() => repo.deleteTime(task.id, e.id)}
					>
						<Icon name="trash" size={15} />
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.time {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg);
	}
	.head {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.lbl {
		font-size: 0.8125rem;
		color: var(--text-muted);
	}
	.total {
		flex: 1;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.total small {
		font-weight: 400;
		color: var(--text-muted);
		margin-left: 6px;
	}
	.btn {
		min-height: 32px;
		font-variant-numeric: tabular-nums;
	}
	.add {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
	}
	.field {
		min-width: 0;
		flex: 1 1 110px;
	}
	.duration {
		flex: 1 1 90px;
	}
	.field[aria-invalid='true'] {
		border-color: var(--danger);
	}
	.hint {
		flex: 1 1 100%;
		font-size: 0.75rem;
		color: var(--text-faint);
	}
	.hint.error {
		color: var(--danger);
	}
	.btn[disabled] {
		opacity: 0.45;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 6px 0 0;
		border-top: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	li {
		display: flex;
		gap: 6px;
		align-items: center;
	}
</style>
