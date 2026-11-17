<script lang="ts">
	/**
	 * Globale Einblendungen: Hinweis-Toasts (mit „Rückgängig“) und Rückfragen.
	 */
	import { m } from '#lib/i18n/index.ts';
	import { dismissToast, ui } from '#lib/state/ui.svelte.ts';

	let dialogEl = $state<HTMLDialogElement>();

	$effect(() => {
		if (!dialogEl) return;
		if (ui.dialog && !dialogEl.open) dialogEl.showModal();
		if (!ui.dialog && dialogEl.open) dialogEl.close();
	});

	function answer(id: string | null) {
		const d = ui.dialog;
		ui.dialog = null;
		d?.resolve(id);
	}
</script>

<dialog bind:this={dialogEl} onclose={() => ui.dialog && answer(null)} aria-labelledby="dlg-title">
	{#if ui.dialog}
		<h2 id="dlg-title">{ui.dialog.title}</h2>
		<p>{ui.dialog.message}</p>
		<div class="actions">
			{#each ui.dialog.actions as a (a.id)}
				<button class="btn {a.variant ?? ''}" onclick={() => answer(a.id)}>{a.label}</button>
			{/each}
			<button class="btn ghost" onclick={() => answer(null)}>{m.confirm.cancel}</button>
		</div>
	{/if}
</dialog>

<div class="toasts" role="status" aria-live="polite">
	{#each ui.toasts as t (t.id)}
		<div class="toast">
			<span>{t.message}</span>
			{#if t.action}
				<button
					class="btn ghost"
					onclick={() => {
						t.action!.run();
						dismissToast(t.id);
					}}>{t.action.label}</button
				>
			{/if}
		</div>
	{/each}
</div>

<style>
	dialog {
		border: 0;
		border-radius: 14px;
		padding: 20px;
		max-width: min(440px, calc(100vw - 32px));
		background: var(--bg-raised);
		color: var(--text);
		box-shadow: var(--shadow);
	}
	dialog::backdrop {
		background: rgb(0 0 0 / 0.35);
	}
	h2 {
		margin: 0 0 8px;
		font-size: 1.125rem;
	}
	p {
		margin: 0 0 16px;
		color: var(--text-muted);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		justify-content: flex-end;
	}
	.toasts {
		position: fixed;
		left: 50%;
		bottom: calc(16px + env(safe-area-inset-bottom) + var(--toolbar-h, 0px));
		transform: translateX(-50%);
		display: flex;
		flex-direction: column;
		gap: 8px;
		z-index: 60;
		width: max-content;
		max-width: calc(100vw - 32px);
	}
	.toast {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 6px 6px 6px 14px;
		border-radius: 10px;
		background: var(--text);
		color: var(--bg);
		box-shadow: var(--shadow);
	}
	.toast .btn {
		color: var(--bg);
		min-height: 30px;
	}
	.toast .btn:hover {
		background: color-mix(in srgb, var(--bg) 20%, transparent);
	}
</style>
