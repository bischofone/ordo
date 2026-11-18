<script lang="ts">
	/**
	 * Nextcloud verbinden: Adresse, Benutzer, App-Passwort – Ordo findet Aufgabenlisten und
	 * Kalender selbst. Blockiert der Browser die Anfragen (CORS), geht es automatisch über
	 * die Weiterleitung des eigenen Ordo-Servers; fehlt die, steht da, wie man sie einrichtet.
	 */
	import { m } from '#lib/i18n/index.ts';
	import { loadLists } from '#lib/state/remote-lists.svelte.ts';
	import { sync } from '#lib/state/sync.svelte.ts';
	import { CaldavError } from '#lib/sync/caldav.ts';
	import { errorText, ProxyUnavailable } from '#lib/sync/engine.ts';
	import Icon from './Icon.svelte';

	let { ondone, oncancel }: { ondone?: () => void; oncancel?: () => void } = $props();

	let url = $state('');
	let user = $state('');
	let password = $state('');
	let busy = $state(false);
	let error = $state<{ text: string; proxyHost?: string } | null>(null);

	/** „cloud.example.com“, „https://cloud.example.com/remote.php/dav/…“ → Basisadresse */
	function base(input: string) {
		let v = input.trim();
		if (!v) return null;
		if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
		try {
			const u = new URL(v);
			const path = u.pathname.split('/remote.php')[0].split('/index.php')[0].replace(/\/+$/, '');
			return `${u.origin}${path}`;
		} catch {
			return null;
		}
	}
	const baseUrl = $derived(base(url));
	const securityUrl = $derived(baseUrl ? `${baseUrl}/index.php/settings/user/security` : null);

	async function connect(e: SubmitEvent) {
		e.preventDefault();
		if (!baseUrl) return;
		busy = true;
		error = null;
		const serverUrl = `${baseUrl}/remote.php/dav/`;
		try {
			const probe = await sync.probe({ serverUrl, username: user.trim(), password });
			const acc = await sync.addAccount({
				name: `Nextcloud (${new URL(baseUrl).host})`,
				serverUrl,
				username: user.trim(),
				password,
				proxy: probe.proxy,
				kind: 'nextcloud'
			});
			await loadLists(acc.id);
			url = user = password = '';
			ondone?.();
		} catch (err) {
			if (err instanceof ProxyUnavailable) error = { text: err.message, proxyHost: err.host };
			else if (err instanceof CaldavError && err.status === 401)
				error = { text: m.nextcloud.badLogin };
			else error = { text: errorText(err) };
		} finally {
			busy = false;
		}
	}
</script>

<form class="nc" onsubmit={connect} data-testid="nextcloud-connect">
	<div class="head">
		<span class="logo" aria-hidden="true"><Icon name="layers" size={18} /></span>
		<div>
			<strong>{m.nextcloud.title}</strong>
			<p class="muted">{m.nextcloud.intro}</p>
		</div>
	</div>

	<label>
		{m.nextcloud.url}
		<input
			class="field"
			required
			inputmode="url"
			autocomplete="url"
			placeholder={m.nextcloud.urlPlaceholder}
			bind:value={url}
		/>
	</label>
	<div class="two">
		<label>
			{m.nextcloud.user}
			<input class="field" required autocomplete="username" bind:value={user} />
		</label>
		<label>
			{m.nextcloud.appPassword}
			<input
				class="field"
				type="password"
				required
				autocomplete="current-password"
				bind:value={password}
			/>
		</label>
	</div>
	<p class="muted small">
		{m.nextcloud.appPasswordHint}
		{#if securityUrl}
			<!-- Externe Seite der eigenen Nextcloud – kein App-Pfad, daher kein resolve() -->
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<a href={securityUrl} target="_blank" rel="noopener noreferrer"
				>{m.nextcloud.openSecurity} ↗</a
			>
		{/if}
	</p>

	{#if error}
		<div class="error" role="alert">
			{#if error.proxyHost}
				<p>{m.nextcloud.proxyMissing(error.proxyHost)}</p>
				<ul>
					<li><code>{m.nextcloud.proxyLxc(error.proxyHost)}</code></li>
					<li><code>{m.nextcloud.proxyDocker(error.proxyHost)}</code></li>
					<li>{m.nextcloud.proxyDev}</li>
				</ul>
			{:else}
				<p>{error.text}</p>
			{/if}
		</div>
	{/if}

	<div class="actions">
		<button class="btn primary" type="submit" disabled={busy || !baseUrl}>
			{busy ? m.nextcloud.connecting : m.nextcloud.connect}
		</button>
		{#if oncancel}
			<button class="btn ghost" type="button" onclick={oncancel}>{m.confirm.cancel}</button>
		{/if}
	</div>
</form>

<style>
	.nc {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 14px;
		margin-bottom: 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg);
	}
	.head {
		display: flex;
		gap: 10px;
		align-items: flex-start;
	}
	.logo {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		flex: none;
		border-radius: 9px;
		color: #fff;
		background: #0082c9;
	}
	.muted {
		margin: 2px 0 0;
		color: var(--text-muted);
		font-size: 0.875rem;
	}
	.small {
		font-size: 0.8125rem;
	}
	.small a {
		color: var(--accent);
		text-decoration: underline;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		flex: 1;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}
	.field {
		color: var(--text);
	}
	.two,
	.actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.error {
		color: var(--danger);
		font-size: 0.875rem;
	}
	.error p {
		margin: 0 0 6px;
	}
	.error ul {
		margin: 0;
		padding-left: 18px;
		color: var(--text);
	}
	.error li {
		margin: 4px 0;
	}
	code {
		font-size: 0.8125rem;
		background: var(--bg-sunken);
		padding: 1px 6px;
		border-radius: 4px;
	}
	.btn[disabled] {
		opacity: 0.5;
	}
</style>
