<script lang="ts">
	/**
	 * „Neue Version da“: Wurde Ordo auf dem Server aktualisiert (ordo update, docker compose pull …),
	 * merkt SvelteKit das und die App bietet an, neu zu laden. Beim nächsten Seitenwechsel lädt sie
	 * ohnehin vollständig neu, damit alte und neue Dateien nicht gemischt werden.
	 */
	import { beforeNavigate } from '$app/navigation';
	import { updated } from '$app/state';
	import { m } from '#lib/i18n/index.ts';
	import Icon from './Icon.svelte';

	let dismissed = $state(false);

	beforeNavigate(({ willUnload, to }) => {
		if (updated.current && !willUnload && to?.url) location.href = to.url.href;
	});
</script>

{#if updated.current && !dismissed}
	<div class="banner" role="status" data-testid="update-banner">
		<Icon name="sync" size={18} />
		<div class="text">
			<strong>{m.update.title}</strong>
			<span>{m.update.hint}</span>
		</div>
		<button class="btn primary" onclick={() => location.reload()}>{m.update.reload}</button>
		<button
			class="icon-btn"
			aria-label={m.update.later}
			title={m.update.later}
			onclick={() => (dismissed = true)}
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
		background: color-mix(in srgb, var(--accent) 10%, var(--bg-raised));
		border-bottom: 1px solid color-mix(in srgb, var(--accent) 30%, var(--border));
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
