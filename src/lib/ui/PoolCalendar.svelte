<script lang="ts">
	/** Pool-Einstellung: geplante Aufgaben als Termine in einen Kalender eintragen (oder nicht). */
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { DEFAULT_CALENDAR_SETTINGS, type CalendarSettings } from '#lib/domain/events.ts';
	import { formatDuration } from '#lib/domain/time.ts';
	import type { Pool } from '#lib/domain/types.ts';
	import { m } from '#lib/i18n/index.ts';
	import { db } from '#lib/state/app.ts';
	import { live } from '#lib/state/live.svelte.ts';
	import { q } from '#lib/state/queries.ts';
	import { ensureCalendars, remoteLists } from '#lib/state/remote-lists.svelte.ts';
	import { sync, syncNow } from '#lib/state/sync.svelte.ts';
	import { CALENDAR_SETTINGS_KEY } from '#lib/sync/calendar.ts';
	import Icon from './Icon.svelte';

	let { pool }: { pool: Pool } = $props();

	const accounts = live(() => () => db.accounts.toArray(), []);
	const settings = live(
		() => q.setting<Partial<CalendarSettings>>(CALENDAR_SETTINGS_KEY, {}),
		{} as Partial<CalendarSettings>
	);
	const duration = $derived(settings.current.durationMin ?? DEFAULT_CALENDAR_SETTINGS.durationMin);

	$effect(() => {
		const ids = accounts.current.map((a) => a.id);
		untrack(() => ensureCalendars(ids));
	});

	const value = $derived(
		pool.settings.calendar
			? `${pool.settings.calendar.accountId}|${pool.settings.calendar.url}`
			: ''
	);
	const loading = $derived(
		accounts.current.some((a) => !remoteLists.calendars[a.id] && !remoteLists.calendarErrors[a.id])
	);

	async function change(v: string) {
		if (!v) await sync.setPoolCalendar(pool.id, undefined);
		else {
			const [accountId, url] = v.split('|');
			const cal = remoteLists.calendars[accountId]?.find((c) => c.url === url);
			await sync.setPoolCalendar(pool.id, { accountId, url, name: cal?.displayName ?? '' });
		}
		await syncNow();
	}
</script>

<div class="pool-cal" data-testid="pool-calendar">
	<span class="lbl"><Icon name="calendar" size={16} />{m.calendar.poolLabel}</span>
	{#if accounts.loaded && !accounts.current.length}
		<span class="muted">
			{m.calendar.noAccount}
			<a href="{resolve('/einstellungen')}#sync">{m.sync.addAccount}</a>
		</span>
	{:else}
		<select
			class="field"
			aria-label={m.calendar.poolLabel}
			{value}
			onchange={(e) => change(e.currentTarget.value)}
		>
			<option value="">{m.calendar.none}</option>
			{#if pool.settings.calendar && !remoteLists.calendars[pool.settings.calendar.accountId]}
				<option {value}>{pool.settings.calendar.name}</option>
			{/if}
			{#each accounts.current as acc (acc.id)}
				{#if remoteLists.calendars[acc.id]?.length}
					<optgroup label={acc.name}>
						{#each remoteLists.calendars[acc.id] as cal (cal.url)}
							<option value="{acc.id}|{cal.url}">{cal.displayName}</option>
						{/each}
					</optgroup>
				{/if}
			{/each}
		</select>
		{#if loading}<span class="muted">{m.calendar.loading}</span>{/if}
		{#each accounts.current as acc (acc.id)}
			{#if remoteLists.calendarErrors[acc.id]}
				<p class="error">{acc.name}: {remoteLists.calendarErrors[acc.id]}</p>
			{/if}
		{/each}
		{#if pool.settings.calendar}
			<p class="hint">{m.calendar.hint(formatDuration(duration))}</p>
		{/if}
	{/if}
</div>

<style>
	.pool-cal {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		padding: 0 0 10px;
	}
	.lbl {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 0.875rem;
		color: var(--text-muted);
	}
	select {
		flex: 1 1 200px;
		min-width: 0;
		max-width: 360px;
	}
	.muted,
	.hint {
		color: var(--text-muted);
		font-size: 0.8125rem;
	}
	.hint {
		flex-basis: 100%;
		margin: 0;
	}
	.muted a {
		color: var(--accent);
		text-decoration: underline;
	}
	.error {
		flex-basis: 100%;
		margin: 0;
		color: var(--danger);
		font-size: 0.8125rem;
	}
</style>
