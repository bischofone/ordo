<script lang="ts">
	import { untrack } from 'svelte';
	import { formatDistanceToNow } from 'date-fns';
	import { de } from 'date-fns/locale';
	import type { Account } from '#lib/domain/types.ts';
	import { m } from '#lib/i18n/index.ts';
	import { db } from '#lib/state/app.ts';
	import { live } from '#lib/state/live.svelte.ts';
	import { sync, syncNow, syncStatus } from '#lib/state/sync.svelte.ts';
	import { ask } from '#lib/state/ui.svelte.ts';
	import { errorText } from '#lib/sync/engine.ts';
	import type { TodoList } from '#lib/sync/caldav.ts';
	import Badge from './Badge.svelte';
	import Icon from './Icon.svelte';

	const accounts = live(() => () => db.accounts.toArray(), []);
	const pools = live(
		() => () => db.pools.toArray().then((ps) => ps.filter((p) => !p.archived)),
		[]
	);
	const states = live(() => () => db.syncState.toArray(), []);

	let lists = $state<Record<string, TodoList[]>>({});
	let listErrors = $state<Record<string, string>>({});

	async function loadLists(acc: Account) {
		try {
			lists[acc.id] = await sync.remoteLists(acc.id);
			delete listErrors[acc.id];
		} catch (e) {
			listErrors[acc.id] = errorText(e);
		}
	}

	// Listen je Konto einmal laden (nicht reaktiv merken, sonst Schleife bei Fehlern)
	const requested: string[] = [];
	$effect(() => {
		for (const acc of accounts.current) {
			if (requested.includes(acc.id)) continue;
			requested.push(acc.id);
			void untrack(() => loadLists(acc));
		}
	});

	// ---------- Konto hinzufügen ----------
	let form = $state({ name: '', serverUrl: '', username: '', password: '' });
	let adding = $state(false);
	let addError = $state('');

	async function addAccount(e: SubmitEvent) {
		e.preventDefault();
		adding = true;
		addError = '';
		try {
			const acc = await sync.addAccount($state.snapshot(form));
			form = { name: '', serverUrl: '', username: '', password: '' };
			await loadLists(acc);
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

	// ---------- Pools ↔ Listen ----------
	const boundUrls = $derived(
		new Set(pools.current.map((p) => p.caldav?.collectionUrl).filter(Boolean))
	);
	const unboundOf = (accountId: string) =>
		(lists[accountId] ?? []).filter((l) => !boundUrls.has(l.url));
	const bindingValue = (p: (typeof pools.current)[number]) =>
		p.caldav ? `list|${p.caldav.accountId}|${p.caldav.collectionUrl}` : '';

	async function changeBinding(poolId: string, value: string) {
		try {
			if (!value) await sync.unbindPool(poolId);
			else {
				const [kind, accountId, url] = value.split('|');
				await sync.bindPool(poolId, accountId, kind === 'new' ? undefined : url);
				const acc = accounts.current.find((a) => a.id === accountId);
				if (acc) await loadLists(acc);
			}
			await syncNow();
		} catch (e) {
			listErrors[poolId] = errorText(e);
		}
	}

	async function adopt(acc: Account, list: TodoList) {
		await sync.adoptList(acc.id, list);
		await syncNow();
	}

	const stateOf = (poolId: string) => states.current.find((s) => s.poolId === poolId);
	const ago = (t: number) => formatDistanceToNow(t, { locale: de, addSuffix: true });
</script>

<section class="sync" data-testid="sync-settings">
	<h2>{m.sync.title}</h2>
	<p class="muted">{m.sync.intro}</p>

	<h3>{m.sync.accounts}</h3>
	{#each accounts.current as acc (acc.id)}
		<div class="card" data-testid="account">
			<div class="acc-head">
				<strong>{acc.name}</strong>
				<span class="muted">{acc.username} · {acc.serverUrl}</span>
				<button class="btn ghost danger" onclick={() => removeAccount(acc)}>{m.sync.remove}</button>
			</div>
			{#if listErrors[acc.id]}<p class="error">{listErrors[acc.id]}</p>{/if}
			{#if unboundOf(acc.id).length}
				<p class="label">{m.sync.unboundLists}</p>
				{#each unboundOf(acc.id) as l (l.url)}
					<div class="list-row">
						<span class="dot" style:background={l.color ?? 'var(--text-faint)'}></span>
						<span class="name">{l.displayName}</span>
						<button class="btn" onclick={() => adopt(acc, l)}>{m.sync.adopt}</button>
					</div>
				{/each}
			{/if}
		</div>
	{/each}

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
		<div>
			<button class="btn primary" type="submit" disabled={adding}>
				{adding ? m.sync.connecting : m.sync.connect}
			</button>
		</div>
		<p class="muted small">{m.sync.passwordNote}</p>
	</form>

	{#if accounts.current.length}
		<h3>{m.sync.poolsTitle}</h3>
		<div class="pools">
			{#each pools.current as p (p.id)}
				{@const st = stateOf(p.id)}
				<div class="pool-row" data-testid="pool-binding">
					<span class="pool-name"><Badge color={p.color} icon={p.icon} />{p.name}</span>
					<select
						class="field"
						aria-label="Sync {p.name}"
						value={bindingValue(p)}
						onchange={(e) => changeBinding(p.id, e.currentTarget.value)}
					>
						<option value="">{m.sync.notSynced}</option>
						{#each accounts.current as acc (acc.id)}
							<optgroup label={acc.name}>
								<option value="new|{acc.id}|">{m.sync.newList(acc.name)}</option>
								{#each lists[acc.id] ?? [] as l (l.url)}
									<option
										value="list|{acc.id}|{l.url}"
										disabled={boundUrls.has(l.url) && p.caldav?.collectionUrl !== l.url}
										>{l.displayName}</option
									>
								{/each}
							</optgroup>
						{/each}
					</select>
					<span class="status">
						{#if p.caldav}
							{#if st?.lastError}
								<span class="error" title={st.lastError}
									><Icon name="x" size={14} />{st.lastError}</span
								>
							{:else if st?.lastSync}
								<span class="ok"><Icon name="check" size={14} />{ago(st.lastSync)}</span>
							{:else}
								<span class="muted">…</span>
							{/if}
						{/if}
						{#if listErrors[p.id]}<span class="error">{listErrors[p.id]}</span>{/if}
					</span>
				</div>
			{/each}
		</div>
		<button class="btn" onclick={() => syncNow()} disabled={syncStatus.running}>
			<Icon name="repeat" size={16} />
			{syncStatus.running ? m.sync.syncing : m.sync.syncNow}
		</button>
	{/if}
</section>

<style>
	h2 {
		font-size: 16px;
		margin: 0 0 4px;
	}
	h3 {
		font-size: 14px;
		margin: 16px 0 8px;
		color: var(--text-muted);
	}
	.muted {
		color: var(--text-muted);
		font-size: 14px;
	}
	.small {
		font-size: 12px;
	}
	.card {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 12px;
		margin-bottom: 10px;
		background: var(--bg-raised);
	}
	.acc-head {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: baseline;
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
		font-size: 13px;
		color: var(--text-muted);
		flex: 1;
	}
	.add .field {
		color: var(--text);
	}
	.two {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.label {
		font-size: 13px;
		color: var(--text-muted);
		margin: 10px 0 4px;
	}
	.list-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 0;
	}
	.list-row .name {
		flex: 1;
	}
	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
	}
	.pools {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-bottom: 12px;
	}
	.pool-row {
		display: grid;
		grid-template-columns: minmax(120px, 1fr) minmax(180px, 2fr) minmax(120px, 1.5fr);
		gap: 8px;
		align-items: center;
	}
	@media (max-width: 640px) {
		.pool-row {
			grid-template-columns: 1fr;
			gap: 4px;
			padding-bottom: 8px;
			border-bottom: 1px solid var(--border);
		}
	}
	.pool-name {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}
	.status {
		font-size: 13px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.status span {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.ok {
		color: var(--ok);
	}
	.error {
		color: var(--danger);
		font-size: 13px;
	}
	.btn[disabled] {
		opacity: 0.5;
	}
</style>
