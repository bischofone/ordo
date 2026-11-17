<script lang="ts">
	/** Hinweis „Zeit zum Aufräumen“ (Modus „Vorschlagen“) – oben über jeder Seite. */
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { m } from '#lib/i18n/index.ts';
	import { markTriageDone, snoozeTriage, triage } from '#lib/state/triage.svelte.ts';
	import Icon from './Icon.svelte';

	let { count }: { count: number } = $props();

	const due = $derived(triage.due);
	const show = $derived(
		!!due &&
			triage.settings.mode === 'suggest' &&
			!page.url.pathname.startsWith('/inbox/aufraeumen')
	);
	const reason = $derived(
		due?.reason === 'time'
			? m.inbox.dueReason.time(due.time ?? '')
			: due?.reason === 'count'
				? m.inbox.dueReason.count
				: m.inbox.dueReason.age
	);
</script>

{#if show && due}
	<div class="banner" role="status" data-testid="triage-banner">
		<Icon name="broom" size={18} />
		<div class="text">
			<strong>{m.inbox.dueTitle(count)}</strong>
			<span>{reason}</span>
		</div>
		<a class="btn primary" href={resolve('/inbox/aufraeumen')}>{m.inbox.startTriage}</a>
		<button class="btn ghost" onclick={() => snoozeTriage(due)}>
			{m.inbox.snooze(triage.settings.snoozeMinutes)}
		</button>
		<button
			class="icon-btn"
			aria-label={m.inbox.dismiss}
			title={m.inbox.dismiss}
			onclick={() => markTriageDone(due.key)}
		>
			<Icon name="x" size={16} />
		</button>
	</div>
{/if}

<style>
	.banner {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
		padding: 8px 12px 8px 16px;
		background: color-mix(in srgb, var(--warn) 14%, var(--bg-raised));
		border-bottom: 1px solid color-mix(in srgb, var(--warn) 35%, var(--border));
		color: var(--text);
	}
	.text {
		flex: 1 1 200px;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.text span {
		font-size: 0.8125rem;
		color: var(--text-muted);
	}
	.btn {
		min-height: 32px;
	}
</style>
