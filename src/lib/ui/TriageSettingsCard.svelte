<script lang="ts">
	/** Einstellungen: wann das Aufräumen der Inbox vorgeschlagen oder erzwungen wird. */
	import type { TriageMode, TriageTime } from '#lib/domain/triage.ts';
	import { m } from '#lib/i18n/index.ts';
	import { saveTriageSettings, triage } from '#lib/state/triage.svelte.ts';
	import Icon from './Icon.svelte';
	import Segmented from './Segmented.svelte';

	const s = $derived(triage.settings);
	const days = m.timeSettings.weekdays;

	const modeOptions = (Object.entries(m.triageSettings.modes) as [TriageMode, string][]).map(
		([value, label]) => ({ value, label })
	);

	const setTimes = (times: TriageTime[]) => saveTriageSettings({ times });
	const updateTime = (i: number, patch: Partial<TriageTime>) =>
		setTimes(s.times.map((t, j) => (j === i ? { ...t, ...patch } : t)));
	const toggleDay = (i: number, day: number) => {
		const cur = s.times[i].days;
		updateTime(i, {
			days: cur.includes(day) ? cur.filter((d) => d !== day) : [...cur, day].sort()
		});
	};
	const num = (v: string) => {
		const n = Math.round(Number(v));
		return Number.isFinite(n) && n > 0 ? n : null;
	};
</script>

<section class="card" data-testid="triage-settings">
	<header>
		<h2 class="card-title">{m.triageSettings.title}</h2>
		<span class="hint">{m.triageSettings.hint}</span>
	</header>

	{#if triage.loaded}
		<div class="line">
			<span>
				{m.triageSettings.mode}
				<small>{m.triageSettings.modeHint}</small>
			</span>
			<Segmented
				label={m.triageSettings.mode}
				value={s.mode}
				options={modeOptions}
				onchange={(mode) => saveTriageSettings({ mode })}
			/>
		</div>

		{#if s.mode !== 'off'}
			<div class="block">
				<span class="label">{m.triageSettings.times}</span>
				{#each s.times as t, i (i)}
					<div class="time-row" data-testid="triage-time">
						<input
							class="field"
							type="time"
							aria-label={m.triageSettings.timeLabel(i)}
							value={t.time}
							onchange={(e) =>
								e.currentTarget.value && updateTime(i, { time: e.currentTarget.value })}
						/>
						<div class="days" role="group" aria-label={m.triageSettings.timeLabel(i)}>
							{#each days as d, day (d)}
								<button
									class="day"
									aria-pressed={t.days.includes(day)}
									aria-label="{d} {t.time}"
									onclick={() => toggleDay(i, day)}>{d}</button
								>
							{/each}
						</div>
						<button
							class="icon-btn"
							aria-label={m.triageSettings.removeTime}
							title={m.triageSettings.removeTime}
							onclick={() => setTimes(s.times.filter((_, j) => j !== i))}
						>
							<Icon name="trash" size={15} />
						</button>
					</div>
				{/each}
				<button
					class="btn ghost add"
					onclick={() => setTimes([...s.times, { time: '17:00', days: [0, 1, 2, 3, 4] }])}
				>
					<Icon name="plus" size={16} />{m.triageSettings.addTime}
				</button>
			</div>

			<div class="block">
				<span class="label">{m.triageSettings.rules}</span>
				<label class="rule">
					<input
						type="checkbox"
						checked={s.minCount !== null}
						onchange={(e) => saveTriageSettings({ minCount: e.currentTarget.checked ? 5 : null })}
					/>
					{m.triageSettings.ruleCount}
					<input
						class="field small"
						type="number"
						min="1"
						aria-label="{m.triageSettings.ruleCount} … {m.triageSettings.ruleCountUnit}"
						value={s.minCount ?? 5}
						disabled={s.minCount === null}
						onchange={(e) => saveTriageSettings({ minCount: num(e.currentTarget.value) ?? 5 })}
					/>
					{m.triageSettings.ruleCountUnit}
				</label>
				<label class="rule">
					<input
						type="checkbox"
						checked={s.olderThanDays !== null}
						onchange={(e) =>
							saveTriageSettings({ olderThanDays: e.currentTarget.checked ? 3 : null })}
					/>
					{m.triageSettings.ruleAge}
					<input
						class="field small"
						type="number"
						min="1"
						aria-label="{m.triageSettings.ruleAge} … {m.triageSettings.ruleAgeUnit}"
						value={s.olderThanDays ?? 3}
						disabled={s.olderThanDays === null}
						onchange={(e) => saveTriageSettings({ olderThanDays: num(e.currentTarget.value) ?? 3 })}
					/>
					{m.triageSettings.ruleAgeUnit}
				</label>
			</div>

			<label class="line">
				<span>{m.triageSettings.snooze}</span>
				<span class="snooze">
					<input
						class="field small"
						type="number"
						min="1"
						max="240"
						aria-label={m.triageSettings.snooze}
						value={s.snoozeMinutes}
						onchange={(e) =>
							saveTriageSettings({ snoozeMinutes: num(e.currentTarget.value) ?? 15 })}
					/>
					{m.triageSettings.minutes}
				</span>
			</label>
			<p class="note">{m.triageSettings.onlyIfEntries}</p>
		{/if}
	{/if}
</section>

<style>
	section {
		margin-bottom: var(--gap);
		padding: 14px 16px;
	}
	header {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 12px;
		margin-bottom: 8px;
	}
	.hint,
	.note {
		font-size: 0.8125rem;
		color: var(--text-faint);
	}
	.line {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
		min-height: 44px;
		padding: 4px 0;
		border-top: 1px solid var(--border);
	}
	header + .line {
		border-top: 0;
	}
	.line > span:first-child {
		flex: 1 1 200px;
	}
	small {
		display: block;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}
	.block {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px 0;
		border-top: 1px solid var(--border);
	}
	.label {
		font-size: 0.875rem;
	}
	.time-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
	.days {
		display: flex;
		gap: 3px;
	}
	.day {
		min-width: 32px;
		height: 30px;
		border-radius: 8px;
		font-size: 0.8125rem;
		color: var(--text-muted);
		border: 1px solid var(--border);
	}
	.day[aria-pressed='true'] {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-contrast);
	}
	.add {
		align-self: flex-start;
	}
	.rule {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		font-size: 0.9375rem;
	}
	.small {
		width: 72px;
	}
	.snooze {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
</style>
