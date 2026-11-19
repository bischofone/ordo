<script lang="ts">
	/**
	 * Passwort eines Kontos ändern – oder nachtragen, wenn es fehlt (z. B. nach dem
	 * Wiederherstellen einer Sicherung ohne Zugangsdaten). Wird vor dem Speichern geprüft.
	 */
	import type { Account } from '#lib/domain/types.ts';
	import { m } from '#lib/i18n/index.ts';
	import { sync, syncNow } from '#lib/state/sync.svelte.ts';
	import { CaldavError } from '#lib/sync/caldav.ts';
	import { errorText } from '#lib/sync/engine.ts';

	let { account }: { account: Account } = $props();

	const missing = $derived(!account.password);
	let editing = $state(false);
	let password = $state('');
	let busy = $state(false);
	let error = $state('');

	async function save(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		error = '';
		try {
			await sync.setAccountPassword(account.id, password);
			password = '';
			editing = false;
			void syncNow();
		} catch (err) {
			error =
				err instanceof CaldavError && err.status === 401 ? m.nextcloud.badLogin : errorText(err);
		} finally {
			busy = false;
		}
	}
</script>

{#if missing || editing}
	<form class="pw" onsubmit={save} data-testid="account-password">
		{#if missing}<p class="warn">{m.sync.passwordMissing}</p>{/if}
		<div class="row">
			<input
				class="field"
				type="password"
				required
				autocomplete="current-password"
				aria-label={m.sync.newPassword}
				placeholder={m.sync.newPassword}
				bind:value={password}
			/>
			<button class="btn primary" type="submit" disabled={busy || !password}>
				{busy ? m.sync.checking : m.sync.savePassword}
			</button>
			{#if !missing}
				<button class="btn ghost" type="button" onclick={() => (editing = false)}>
					{m.confirm.cancel}
				</button>
			{/if}
		</div>
		{#if error}<p class="error" role="alert">{error}</p>{/if}
	</form>
{:else}
	<button class="btn ghost small" onclick={() => (editing = true)}>{m.sync.changePassword}</button>
{/if}

<style>
	.pw {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin: 6px 0;
	}
	.row {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.row .field {
		flex: 1 1 200px;
	}
	.warn {
		margin: 0;
		color: var(--warn);
		font-size: 0.875rem;
	}
	.error {
		margin: 0;
		color: var(--danger);
		font-size: 0.875rem;
	}
	.small {
		min-height: 30px;
		font-size: 0.8125rem;
		align-self: flex-start;
	}
</style>
