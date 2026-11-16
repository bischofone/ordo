<script lang="ts">
	import { DEFAULT_INBOX_AGING_DAYS } from '#lib/domain/views.ts';
	import { m } from '#lib/i18n/index.ts';
	import { repo } from '#lib/state/app.ts';
	import { live } from '#lib/state/live.svelte.ts';
	import { q } from '#lib/state/queries.ts';
	import { getTheme, setTheme, type Theme } from '#lib/state/theme.ts';
	import type { Pool } from '#lib/domain/types.ts';
	import Editor from '#lib/ui/Editor.svelte';
	import SyncSettings from '#lib/ui/SyncSettings.svelte';

	const pools = live(() => q.pools, []);
	const projects = live(() => q.projects, []);
	const agingDays = live(
		() => q.setting('inboxAgingDays', DEFAULT_INBOX_AGING_DAYS),
		DEFAULT_INBOX_AGING_DAYS
	);

	let theme = $state<Theme>(getTheme());
	let newName = $state('');

	const active = $derived(pools.current.filter((p) => !p.archived));
	const archived = $derived(pools.current.filter((p) => p.archived));
</script>

<h1>{m.settings.title}</h1>

<section>
	<h2>{m.settings.appearance}</h2>
	<label class="line">
		<span>{m.settings.theme}</span>
		<select class="field" bind:value={theme} onchange={() => setTheme(theme)}>
			{#each Object.entries(m.settings.themes) as [value, label] (value)}
				<option {value}>{label}</option>
			{/each}
		</select>
	</label>
</section>

<section>
	<h2>{m.settings.inbox}</h2>
	<label class="line">
		<span>{m.settings.agingDays}</span>
		<input
			class="field"
			type="number"
			min="1"
			max="90"
			value={agingDays.current}
			onchange={(e) =>
				repo.setSetting('inboxAgingDays', Math.max(1, Number(e.currentTarget.value) || 7))}
		/>
	</label>
</section>

<section>
	<h2>{m.settings.pools}</h2>
	{#each active as p (p.id)}
		{@render poolEditor(p, true)}
		<div class="projects">
			{#each projects.current.filter((pr) => pr.poolId === p.id) as pr (pr.id)}
				<Editor
					item={pr}
					onupdate={(patch) => repo.updateProject(pr.id, patch)}
					onmove={(dir) => repo.moveProject(pr.id, dir)}
					onarchive={() => repo.updateProject(pr.id, { archived: !pr.archived })}
				/>
			{/each}
		</div>
	{/each}
	<form
		class="line"
		onsubmit={async (e) => {
			e.preventDefault();
			if (newName.trim()) await repo.createPool(newName);
			newName = '';
		}}
	>
		<input
			class="field"
			bind:value={newName}
			placeholder={m.pool.newName}
			aria-label={m.pool.newName}
		/>
		<button class="btn" type="submit" disabled={!newName.trim()}>{m.nav.newPool}</button>
	</form>

	{#if archived.length}
		<h3>{m.pool.archived}</h3>
		{#each archived as p (p.id)}
			{@render poolEditor(p, false)}
		{/each}
	{/if}
</section>

<SyncSettings />

<p class="about">{m.settings.about}</p>

{#snippet poolEditor(p: Pool, reorder: boolean)}
	<Editor
		item={p}
		onupdate={(patch) => repo.updatePool(p.id, patch)}
		onmove={reorder && p.kind === 'pool' ? (dir) => repo.movePool(p.id, dir) : undefined}
		onarchive={p.kind === 'pool'
			? () => repo.updatePool(p.id, { archived: !p.archived })
			: undefined}
	/>
{/snippet}

<style>
	h1 {
		font-size: 24px;
		margin: 0 0 16px;
	}
	section {
		margin-bottom: 28px;
	}
	h2 {
		font-size: 16px;
		margin: 0 0 8px;
	}
	h3 {
		font-size: 14px;
		color: var(--text-muted);
		margin: 16px 0 0;
	}
	.line {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
		padding: 6px 0;
	}
	.line span {
		flex: 1 1 200px;
	}
	.projects {
		padding-left: 28px;
		border-left: 2px solid var(--border);
		margin: 0 0 8px 12px;
	}
	.about {
		color: var(--text-faint);
		font-size: 13px;
	}
</style>
