<script lang="ts">
	/**
	 * Einstellungen → Sicherung: Datei erstellen (optional verschlüsselt, dann auch mit
	 * Zugangsdaten), aus einer Datei wiederherstellen (wird vorher geprüft und zusammengefasst)
	 * und eine Wiederherstellung rückgängig machen.
	 */
	import { onMount } from 'svelte';
	import {
		BackupError,
		readBackup,
		unlock,
		type BackupFile,
		type PreparedRestore
	} from '#lib/backup/backup.ts';
	import { WrongPassword } from '#lib/backup/crypto.ts';
	import { m } from '#lib/i18n/index.ts';
	import {
		downloadBackup,
		LAST_BACKUP_KEY,
		loadSnapshotInfo,
		prepareRestore,
		restore,
		snapshotInfo,
		undoRestore
	} from '#lib/state/backup.svelte.ts';
	import { live } from '#lib/state/live.svelte.ts';
	import { q } from '#lib/state/queries.ts';
	import { ask } from '#lib/state/ui.svelte.ts';
	import Icon from './Icon.svelte';

	const when = (t: number | string) =>
		new Date(t).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });

	onMount(() => void loadSnapshotInfo());

	// ---------- Erstellen ----------
	const last = live(() => q.setting<number | null>(LAST_BACKUP_KEY, null), null);
	let password = $state('');
	let repeat = $state('');
	let secrets = $state(true);
	let creating = $state(false);
	const pwError = $derived(
		!password
			? ''
			: password.length < 8
				? m.backup.tooShort
				: repeat && repeat !== password
					? m.backup.mismatch
					: ''
	);
	const canCreate = $derived(
		!creating && (!password || (password.length >= 8 && repeat === password))
	);

	async function create(e: SubmitEvent) {
		e.preventDefault();
		creating = true;
		try {
			await downloadBackup({ password, secrets });
			password = repeat = '';
		} finally {
			creating = false;
		}
	}

	// ---------- Wiederherstellen ----------
	let locked = $state.raw<BackupFile | null>(null);
	let unlockPassword = $state('');
	let prepared = $state.raw<PreparedRestore | null>(null);
	let error = $state('');
	let busy = $state(false);

	async function choose(e: Event & { currentTarget: HTMLInputElement }) {
		const file = e.currentTarget.files?.[0];
		e.currentTarget.value = '';
		locked = prepared = null;
		error = '';
		if (!file) return;
		await run(async () => {
			const r = readBackup(await file.text());
			if (r.locked) locked = r.file;
			else prepared = await prepareRestore(r.data);
		});
	}

	async function open(e: SubmitEvent) {
		e.preventDefault();
		if (!locked) return;
		const file = locked;
		await run(async () => {
			prepared = await prepareRestore(await unlock(file, unlockPassword));
			locked = null;
			unlockPassword = '';
		});
	}

	async function run(fn: () => Promise<void>) {
		busy = true;
		error = '';
		try {
			await fn();
		} catch (err) {
			error =
				err instanceof BackupError || err instanceof WrongPassword
					? err.message
					: `${m.backup.problems} ${(err as Error).message}`;
		} finally {
			busy = false;
		}
	}

	async function replace() {
		if (!prepared) return;
		const ok = await ask({
			title: m.backup.replaceTitle,
			message: m.backup.replaceText,
			actions: [{ id: 'replace', label: m.backup.replace, variant: 'danger' }]
		});
		if (ok) await restore(prepared);
	}

	async function undo() {
		const ok = await ask({
			title: m.backup.undoTitle,
			message: m.backup.undoConfirm,
			actions: [{ id: 'undo', label: m.backup.undo, variant: 'danger' }]
		});
		if (ok) await undoRestore();
	}
</script>

<section class="card" data-testid="backup-create">
	<header>
		<h2 class="card-heading">{m.backup.title}</h2>
		<p class="card-sub">{m.backup.intro}</p>
	</header>
	<form onsubmit={create}>
		<div class="two">
			<label>
				{m.backup.password}
				<input class="field" type="password" autocomplete="new-password" bind:value={password} />
			</label>
			<label>
				{m.backup.passwordRepeat}
				<input
					class="field"
					type="password"
					autocomplete="new-password"
					disabled={!password}
					bind:value={repeat}
				/>
			</label>
		</div>
		<p class="hint">{m.backup.passwordHint}</p>
		{#if pwError}<p class="error" role="alert">{pwError}</p>{/if}
		<label class="check" class:off={!password}>
			<input
				type="checkbox"
				checked={!!password && secrets}
				disabled={!password}
				onchange={(e) => (secrets = e.currentTarget.checked)}
			/>
			<span>
				{m.backup.secrets}
				{#if !password}<small>{m.backup.secretsHint}</small>{/if}
			</span>
		</label>
		<div class="actions">
			<button class="btn primary" type="submit" disabled={!canCreate}>
				<Icon name={password ? 'lock' : 'download'} size={16} />
				{creating ? m.backup.working : m.backup.download}
			</button>
			<span class="hint">{last.current ? m.backup.last(when(last.current)) : m.backup.never}</span>
		</div>
	</form>
</section>

<section class="card" data-testid="backup-restore">
	<header>
		<h2 class="card-heading">{m.backup.restoreTitle}</h2>
		<p class="card-sub">{m.backup.restoreIntro}</p>
	</header>
	<label class="btn file">
		<Icon name="upload" size={16} />
		{m.backup.chooseFile}
		<input type="file" accept=".json,application/json" onchange={choose} />
	</label>

	{#if locked}
		<form class="unlock" onsubmit={open}>
			<p><Icon name="lock" size={16} /> {m.backup.locked}</p>
			<div class="two">
				<input
					class="field"
					type="password"
					autocomplete="off"
					aria-label={m.backup.password}
					placeholder={m.backup.password}
					bind:value={unlockPassword}
				/>
				<button class="btn primary" type="submit" disabled={busy || !unlockPassword}>
					{busy ? m.backup.checking : m.backup.unlock}
				</button>
			</div>
		</form>
	{/if}
	{#if busy && !locked}<p class="hint">{m.backup.checking}</p>{/if}
	{#if error}<p class="error" role="alert">{error}</p>{/if}

	{#if prepared}
		<div class="found" data-testid="backup-summary">
			<strong
				>{m.backup.from(when(prepared.data.createdAt), prepared.data.app?.version ?? '?')}</strong
			>
			<span>{m.backup.summary(prepared.summary)}</span>
			<span class="hint"
				>{prepared.data.secrets ? m.backup.withSecrets : m.backup.withoutSecrets}</span
			>
			{#if prepared.problems.length}
				<div class="error" role="alert">
					<p>{m.backup.problems}</p>
					<ul>
						{#each prepared.problems.slice(0, 8) as p (p)}<li>{p}</li>{/each}
					</ul>
				</div>
			{:else}
				<button class="btn danger" onclick={replace}>{m.backup.replace}</button>
			{/if}
		</div>
	{/if}

	{#if snapshotInfo.createdAt}
		<div class="undo" data-testid="backup-undo">
			<span>{m.backup.undoText(when(snapshotInfo.createdAt))}</span>
			<button class="btn ghost" onclick={undo}>{m.backup.undo}</button>
		</div>
	{/if}
	<p class="hint server">{m.backup.serverHint}</p>
</section>

<style>
	section {
		margin-bottom: var(--gap);
		padding: 14px 16px;
	}
	header {
		margin-bottom: 10px;
	}
	form,
	.found {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.two,
	.actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		align-items: center;
	}
	.two > * {
		flex: 1 1 200px;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}
	.field {
		color: var(--text);
	}
	.check {
		flex-direction: row;
		align-items: flex-start;
		gap: 8px;
		font-size: 0.875rem;
		color: var(--text);
	}
	.check.off {
		color: var(--text-muted);
	}
	.check small {
		display: block;
		color: var(--text-muted);
		font-size: 0.8125rem;
	}
	.hint {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.8125rem;
	}
	.error {
		margin: 0;
		color: var(--danger);
		font-size: 0.875rem;
	}
	.error p,
	.error ul {
		margin: 0;
	}
	.btn :global(svg) {
		margin-right: 6px;
	}
	.file {
		position: relative;
		flex-direction: row;
		align-self: flex-start;
		color: var(--text);
		font-size: 0.875rem;
		cursor: pointer;
	}
	.file input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}
	.unlock,
	.found,
	.undo {
		margin-top: 12px;
		padding-top: 12px;
		border-top: 1px solid var(--border);
	}
	.unlock p {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 0;
	}
	.found .btn {
		align-self: flex-start;
	}
	.undo {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		font-size: 0.875rem;
	}
	.undo span {
		flex: 1 1 200px;
	}
	.server {
		margin-top: 12px;
	}
</style>
