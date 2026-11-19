<script lang="ts">
	/** Einstellungen: CalDAV-Konten verwalten. Welcher Pool wohin synchronisiert, steht im Pool. */
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import type { Account } from '#lib/domain/types.ts';
	import { m } from '#lib/i18n/index.ts';
	import { db } from '#lib/state/app.ts';
	import { live } from '#lib/state/live.svelte.ts';
	import { ensureLists, loadLists, remoteLists } from '#lib/state/remote-lists.svelte.ts';
	import { sync, syncNow } from '#lib/state/sync.svelte.ts';
	import { ask } from '#lib/state/ui.svelte.ts';
	import { errorText } from '#lib/sync/engine.ts';
	import type { TodoList } from '#lib/sync/caldav.ts';
	import Badge from './Badge.svelte';
	import NextcloudConnect from './NextcloudConnect.svelte';
	import AccountPassword from './AccountPassword.svelte';
	import Icon from './Icon.svelte';

	const accounts = live(() => () => db.accounts.toArray(), []);
	const pools = live(() => () => db.pools.toArray(), []);

	$effect(() => {
		const ids = accounts.current.map((a) => a.id);
		untrack(() => ensureLists(ids));
	});

	// ---------- Konto hinzufügen ----------
	let form = $state({ name: '', serverUrl: '', username: '', password: '' });
	/** Was gerade offen ist: Nextcloud-Dialog oder allgemeines CalDAV-Formular */
	let open = $state<'nextcloud' | 'caldav' | null>(null);
	let adding = $state(false);
	let addError = $state('');
	const none = $derived(accounts.loaded && !accounts.current.length);
	const mode = $derived(open ?? (none ? 'nextcloud' : null));

	async function addAccount(e: SubmitEvent) {
		e.preventDefault();
		adding = true;
		addError = '';
		try {
			const data = $state.snapshot(form);
			// Direkt oder – falls der Browser wegen CORS blockt – über den Ordo-Server
			const probe = await sync.probe(data);
			const acc = await sync.addAccount({ ...data, proxy: probe.proxy, kind: 'caldav' });
			form = { name: '', serverUrl: '', username: '', password: '' };
			open = null;
			await loadLists(acc.id);
		} catch (err) {
			addError = errorText(err);
		} finally {
			adding = false;
		}
	}

	async function removeAccount(acc: Account) {
		const ok = await ask({
			title: m.sync.removeTitle,
			message: m.sync.removeText(acc.name),
			actions: [{ id: 'remove', label: m.sync.remove, variant: 'danger' }]
		});
		if (ok) await sync.removeAccount(acc.id);
	}

	const poolOf = (url: string) => pools.current.find((p) => p.caldav?.collectionUrl === url);

	async function adopt(acc: Account, list: TodoList) {
		await sync.adoptList(acc.id, list);
		await syncNow();
	}
</script>

<section class="sync" data-testid="sync-settings">
	<h2 class="card-heading">{m.sync.title}</h2>
	<p class="muted">{m.sync.intro}</p>
	{#if accounts.current.length}<p class="muted">{m.sync.poolHint}</p>{/if}

	{#each accounts.current as acc (acc.id)}
		<div class="card" data-testid="account">
			<div class="acc-head">
				<strong>{acc.name}</strong>
				<span class="muted">{acc.username} · {acc.serverUrl}</span>
				{#if acc.proxy}
					<span class="tag" title={m.nextcloud.viaProxyHint}>{m.nextcloud.viaProxy}</span>
				{/if}
				<button class="btn ghost danger" onclick={() => removeAccount(acc)}>{m.sync.remove}</button>
			</div>
			<AccountPassword account={acc} />
			{#if remoteLists.errors[acc.id] && acc.password}<p class="error">
					{remoteLists.errors[acc.id]}
				</p>{/if}
			{#if remoteLists.byAccount[acc.id]}
				<p class="label">{m.sync.accountLists}</p>
				{#each remoteLists.byAccount[acc.id] as l (l.url)}
					{@const pool = poolOf(l.url)}
					<div class="list-row">
						<span class="dot" style:background={l.color ?? 'var(--text-faint)'}></span>
						<span class="name">{l.displayName}</span>
						{#if pool}
							<a class="linked" href={resolve('/pool/[id]', { id: pool.id })}>
								<Icon name="check" size={14} />
								<Badge color={pool.color} icon={pool.icon} size={14} />
								{m.sync.linkedTo(pool.name)}
							</a>
						{:else}
							<button class="btn" onclick={() => adopt(acc, l)}>{m.sync.adopt}</button>
						{/if}
					</div>
				{:else}
					<p class="muted small">{m.sync.noLists}</p>
				{/each}
			{/if}
		</div>
	{/each}

	{#if mode === 'nextcloud'}
		<NextcloudConnect
			ondone={() => (open = null)}
			oncancel={none ? undefined : () => (open = null)}
		/>
		{#if none}
			<button class="btn ghost" onclick={() => (open = 'caldav')}>{m.nextcloud.other}</button>
		{/if}
	{:else if mode === 'caldav'}
		<form class="card add" onsubmit={addAccount}>
			<strong>{m.sync.addAccount}</strong>
			<label
				>{m.sync.serverUrl}
				<input
					class="field"
					type="url"
					required
					bind:value={form.serverUrl}
					placeholder={m.sync.serverUrlHint}
				/></label
			>
			<div class="two">
				<label
					>{m.sync.username}
					<input class="field" required autocomplete="username" bind:value={form.username} /></label
				>
				<label
					>{m.sync.password}
					<input
						class="field"
						type="password"
						autocomplete="current-password"
						bind:value={form.password}
					/></label
				>
			</div>
			<label>{m.sync.accountName} <input class="field" bind:value={form.name} /></label>
			{#if addError}<p class="error" role="alert">{addError}</p>{/if}
			<div class="form-actions">
				<button class="btn primary" type="submit" disabled={adding}>
					{adding ? m.sync.connecting : m.sync.connect}
				</button>
				<button class="btn ghost" type="button" onclick={() => (open = null)}>
					{m.confirm.cancel}
				</button>
			</div>
			<p class="muted small">{m.sync.passwordNote}</p>
		</form>
	{:else}
		<div class="add-buttons">
			<button class="btn" onclick={() => (open = 'nextcloud')}>
				<Icon name="plus" size={16} />{m.nextcloud.title}
			</button>
			<button class="btn ghost" onclick={() => (open = 'caldav')}>
				<Icon name="plus" size={16} />{m.nextcloud.other}
			</button>
		</div>
	{/if}
</section>

<style>
	h2 {
		margin-bottom: 8px;
	}
	.muted {
		color: var(--text-muted);
		font-size: 0.875rem;
		margin: 0 0 8px;
	}
	.small {
		font-size: 0.75rem;
	}
	.card {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 12px;
		margin-bottom: 10px;
		background: var(--bg);
		box-shadow: none;
		border-radius: var(--radius);
	}
	.acc-head {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: baseline;
	}
	.acc-head .muted {
		margin: 0;
	}
	.acc-head .btn {
		margin-left: auto;
	}
	.add {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.add label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 0.8125rem;
		color: var(--text-muted);
		flex: 1;
	}
	.add .field {
		color: var(--text);
	}
	.two,
	.form-actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.label {
		font-size: 0.8125rem;
		color: var(--text-muted);
		margin: 10px 0 4px;
	}
	.list-row {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 36px;
	}
	.list-row .name {
		flex: 1;
	}
	.linked {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 0.875rem;
		color: var(--text-muted);
	}
	.linked:hover {
		color: var(--text);
	}
	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
	}
	.tag {
		font-size: 0.75rem;
		padding: 1px 7px;
		border-radius: 6px;
		background: var(--bg-sunken);
		color: var(--text-muted);
	}
	.add-buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.error {
		color: var(--danger);
		font-size: 0.8125rem;
	}
	.btn[disabled] {
		opacity: 0.5;
	}
</style>
