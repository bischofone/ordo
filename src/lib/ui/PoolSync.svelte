<script lang="ts">
	/** Sync-Ziel eines Pools wählen: kein Sync, neue Liste oder vorhandene Liste eines Kontos. */
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { formatDistanceToNow } from 'date-fns';
	import { de } from 'date-fns/locale';
	import type { Pool } from '#lib/domain/types.ts';
	import { m } from '#lib/i18n/index.ts';
	import { db } from '#lib/state/app.ts';
	import { live } from '#lib/state/live.svelte.ts';
	import { ensureLists, loadLists, remoteLists } from '#lib/state/remote-lists.svelte.ts';
	import { sync, syncNow, syncStatus } from '#lib/state/sync.svelte.ts';
	import { errorText } from '#lib/sync/engine.ts';
	import Icon from './Icon.svelte';

	let { pool }: { pool: Pool } = $props();

	const accounts = live(() => () => db.accounts.toArray(), []);
	const pools = live(() => () => db.pools.toArray(), []);
	const syncState = live(() => {
		const id = pool.id;
		return () => db.syncState.get(id);
	}, undefined);

	$effect(() => {
		const ids = accounts.current.map((a) => a.id);
		untrack(() => ensureLists(ids));
	});

	let error = $state('');
	let busy = $state(false);

	const value = $derived(
		pool.caldav ? `list|${pool.caldav.accountId}|${pool.caldav.collectionUrl}` : ''
	);
	/** Pool, der eine Liste schon benutzt (eine Liste gehört zu genau einem Pool) */
	const usedBy = (url: string) =>
		pools.current.find((p) => p.id !== pool.id && p.caldav?.collectionUrl === url);

	async function change(next: string) {
		error = '';
		busy = true;
		try {
			if (!next) await sync.unbindPool(pool.id);
			else {
				const [kind, accountId, url] = next.split('|');
				await sync.bindPool(pool.id, accountId, kind === 'new' ? undefined : url);
				await loadLists(accountId);
			}
			await syncNow();
		} catch (e) {
			error = errorText(e);
		} finally {
			busy = false;
		}
	}
</script>

<div class="pool-sync" data-testid="pool-sync">
	<span class="lbl"><Icon name="repeat" size={16} />{m.sync.poolLabel}</span>
	{#if accounts.loaded && !accounts.current.length}
		<span class="muted">
			{m.sync.noAccount}
			<a href="{resolve('/einstellungen')}#sync">{m.sync.addAccount}</a>
		</span>
	{:else}
		<select
			class="field"
			aria-label={m.sync.poolLabel}
			{value}
			disabled={busy}
			onchange={(e) => change(e.currentTarget.value)}
		>
			<option value="">{m.sync.notSynced}</option>
			{#each accounts.current as acc (acc.id)}
				<optgroup label={acc.name}>
					<option value="new|{acc.id}|">{m.sync.newList(acc.name)}</option>
					{#each remoteLists.byAccount[acc.id] ?? [] as l (l.url)}
						{@const other = usedBy(l.url)}
						<option value="list|{acc.id}|{l.url}" disabled={!!other}>
							{l.displayName}{other ? ` ${m.sync.usedBy(other.name)}` : ''}
						</option>
					{/each}
				</optgroup>
			{/each}
		</select>
		{#if pool.caldav}
			<span class="status">
				{#if syncState.current?.lastError}
					<span class="error" title={syncState.current.lastError}
						>{syncState.current.lastError}</span
					>
				{:else if syncState.current?.lastSync}
					<span class="ok">
						<Icon name="check" size={14} />
						{formatDistanceToNow(syncState.current.lastSync, { locale: de, addSuffix: true })}
					</span>
				{/if}
			</span>
			<button
				class="icon-btn"
				aria-label={m.sync.syncNow}
				title={m.sync.syncNow}
				disabled={syncStatus.running}
				onclick={() => syncNow()}
			>
				<span class:spin={syncStatus.running}><Icon name="repeat" size={16} /></span>
			</button>
		{/if}
	{/if}
	{#if error}<p class="error" role="alert">{error}</p>{/if}
</div>

<style>
	.pool-sync {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		padding: 4px 0 10px;
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
	.muted {
		color: var(--text-muted);
		font-size: 0.875rem;
	}
	.muted a {
		color: var(--accent);
		text-decoration: underline;
	}
	.status {
		font-size: 0.8125rem;
	}
	.ok {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: var(--ok);
	}
	.error {
		color: var(--danger);
		font-size: 0.8125rem;
		margin: 0;
	}
	.spin {
		display: inline-grid;
		animation: spin 1s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
