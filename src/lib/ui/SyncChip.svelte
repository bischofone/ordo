<script lang="ts">
	/** Kleiner Hinweis neben dem Pool-Namen: wird synchronisiert (mit welchem Konto) – oder Fehler. */
	import type { Pool } from '#lib/domain/types.ts';
	import { m } from '#lib/i18n/index.ts';
	import { db } from '#lib/state/app.ts';
	import { live } from '#lib/state/live.svelte.ts';
	import Icon from './Icon.svelte';

	let { pool, onclick }: { pool: Pool; onclick: () => void } = $props();

	const info = live(() => {
		const { id, caldav } = pool;
		return async () => ({
			account: caldav ? await db.accounts.get(caldav.accountId) : undefined,
			state: await db.syncState.get(id)
		});
	}, undefined);
</script>

{#if pool.caldav && info.current?.account}
	<button
		class="chip"
		class:error={!!info.current.state?.lastError}
		data-testid="sync-chip"
		title={info.current.state?.lastError ?? m.sync.syncedWith(info.current.account.name)}
		{onclick}
	>
		<Icon name="repeat" size={13} />{info.current.account.name}
	</button>
{/if}

<style>
	.chip {
		padding: 0 10px 0 8px;
		gap: 6px;
		color: var(--text-muted);
		max-width: 200px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.chip.error {
		color: var(--danger);
		border-color: var(--danger);
	}
</style>
