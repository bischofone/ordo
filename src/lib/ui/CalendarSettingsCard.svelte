<script lang="ts">
	/** Einstellungen → Sync: Standarddauer der Termine und ob Aufgaben ohne Uhrzeit ganztägig erscheinen. */
	import { DEFAULT_CALENDAR_SETTINGS, type CalendarSettings } from '#lib/domain/events.ts';
	import { formatDuration, parseTotalInput } from '#lib/domain/time.ts';
	import { m } from '#lib/i18n/index.ts';
	import { repo } from '#lib/state/app.ts';
	import { live } from '#lib/state/live.svelte.ts';
	import { q } from '#lib/state/queries.ts';
	import { syncNow } from '#lib/state/sync.svelte.ts';
	import { CALENDAR_SETTINGS_KEY } from '#lib/sync/calendar.ts';

	const stored = live(
		() => q.setting<Partial<CalendarSettings>>(CALENDAR_SETTINGS_KEY, {}),
		{} as Partial<CalendarSettings>
	);
	const s = $derived({ ...DEFAULT_CALENDAR_SETTINGS, ...stored.current });

	async function save(patch: Partial<CalendarSettings>) {
		await repo.setSetting(CALENDAR_SETTINGS_KEY, { ...s, ...patch });
		void syncNow();
	}
	function setDuration(input: HTMLInputElement) {
		const v = parseTotalInput(input.value, s.durationMin);
		if (v !== null && v >= 5 && v !== s.durationMin) void save({ durationMin: v });
		input.value = formatDuration(v !== null && v >= 5 ? v : s.durationMin);
	}
</script>

<section class="card" data-testid="calendar-settings">
	<header>
		<h2 class="card-heading">{m.calendar.settingsTitle}</h2>
		<p class="card-sub">{m.calendar.settingsHint}</p>
	</header>
	<label class="line">
		<span>
			{m.calendar.duration}
			<small>{m.calendar.durationHint}</small>
		</span>
		<input
			class="field small"
			aria-label={m.calendar.duration}
			value={formatDuration(s.durationMin)}
			onchange={(e) => setDuration(e.currentTarget)}
		/>
	</label>
	<label class="line">
		<span>
			{m.calendar.allDay}
			<small>{m.calendar.allDayHint}</small>
		</span>
		<input
			type="checkbox"
			class="switch"
			role="switch"
			checked={s.allDay}
			onchange={(e) => save({ allDay: e.currentTarget.checked })}
		/>
	</label>
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
	.line > span {
		flex: 1 1 200px;
	}
	small {
		display: block;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}
	.small {
		width: 80px;
		text-align: right;
		font-variant-numeric: tabular-nums;
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
