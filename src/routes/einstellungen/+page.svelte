<script lang="ts">
	import { DEFAULT_INBOX_AGING_DAYS } from '#lib/domain/views.ts';
	import { m } from '#lib/i18n/index.ts';
	import { deletePool, deleteProject } from '#lib/state/actions.ts';
	import { repo } from '#lib/state/app.ts';
	import { live } from '#lib/state/live.svelte.ts';
	import { q } from '#lib/state/queries.ts';
	import { formatDuration, parseTotalInput } from '#lib/domain/time.ts';
	import { appearance } from '#lib/state/appearance.svelte.ts';
	import { timeSettings } from '#lib/state/time-settings.svelte.ts';
	import type { Pool } from '#lib/domain/types.ts';
	import ColorPicker from '#lib/ui/ColorPicker.svelte';
	import Editor from '#lib/ui/Editor.svelte';
	import Segmented from '#lib/ui/Segmented.svelte';
	import SyncSettings from '#lib/ui/SyncSettings.svelte';
	import TriageSettingsCard from '#lib/ui/TriageSettingsCard.svelte';
	import Icon, { type IconName } from '#lib/ui/Icon.svelte';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';

	const pools = live(() => q.pools, []);
	const projects = live(() => q.projects, []);
	const agingDays = live(
		() => q.setting('inboxAgingDays', DEFAULT_INBOX_AGING_DAYS),
		DEFAULT_INBOX_AGING_DAYS
	);

	const a = $derived(appearance.current);
	/** Standard-Akzent des aktuellen Farbschemas (für die Anzeige im Farbknopf) */
	let defaultAccent = $state('#0b6bcb');
	$effect(() => {
		void a.theme;
		if (!a.accent) {
			defaultAccent = getComputedStyle(document.documentElement)
				.getPropertyValue('--accent')
				.trim();
		}
	});
	/** Soll-Zeit eines Wochentags ändern (gleiche Formate wie überall: 8:00, 7,5h, 0 = frei) */
	function setTarget(index: number, input: HTMLInputElement) {
		const current = timeSettings.current.targets[index] ?? 0;
		const parsed = parseTotalInput(input.value.replace(/^[+\-−]/, ''), current);
		if (parsed !== null && parsed !== current) {
			void timeSettings.set({ targets: timeSettings.current.targets.with(index, parsed) });
		}
		input.value = formatDuration(parsed ?? current);
	}

	const opts = <T extends string>(labels: Record<T, string>) =>
		(Object.entries(labels) as [T, string][]).map(([value, label]) => ({ value, label }));
	let newName = $state('');

	/** Bereiche der Einstellungsseite; der gewählte steht im Adress-Anker (#zeit …) */
	const SECTIONS = [
		{ id: 'darstellung', icon: 'palette' },
		{ id: 'zeit', icon: 'clock' },
		{ id: 'inbox', icon: 'inbox' },
		{ id: 'pools', icon: 'layers' },
		{ id: 'sync', icon: 'sync' }
	] as const satisfies { id: string; icon: IconName }[];
	type SectionId = (typeof SECTIONS)[number]['id'];
	const isSection = (v: string): v is SectionId => SECTIONS.some((x) => x.id === v);
	const fromHash = (h: string) => {
		const id = h.replace('#', '');
		return isSection(id) ? id : 'darstellung';
	};
	let section = $derived<SectionId>(fromHash(page.url.hash));
	function show(id: SectionId) {
		section = id;
		replaceState(`#${id}`, page.state);
	}

	const active = $derived(pools.current.filter((p) => !p.archived));
	const archived = $derived(pools.current.filter((p) => p.archived));
</script>

<h1>{m.settings.title}</h1>

<div class="settings">
	<nav class="sections" aria-label={m.settings.sectionsLabel}>
		{#each SECTIONS as sec (sec.id)}
			<button
				class="sec"
				class:on={section === sec.id}
				aria-current={section === sec.id ? 'page' : undefined}
				onclick={() => show(sec.id)}
			>
				<Icon name={sec.icon} size={18} />
				<span>{m.settings.sections[sec.id]}</span>
			</button>
		{/each}
	</nav>

	<div class="content">
		{#if section === 'darstellung'}
			<section class="card" data-testid="appearance">
				<header>
					<h2 class="card-heading">{m.settings.appearance}</h2>
					<p class="card-sub">{m.settings.appearanceHint}</p>
				</header>
				<div class="line">
					<span>{m.settings.theme}</span>
					<Segmented
						label={m.settings.theme}
						value={a.theme}
						options={opts(m.settings.themes)}
						onchange={(theme) => appearance.set({ theme })}
					/>
				</div>
				<div class="line">
					<span>{m.settings.accent}</span>
					<div class="accent">
						<ColorPicker
							value={a.accent ?? defaultAccent}
							onchange={(accent) => appearance.set({ accent })}
						/>
						{#if a.accent}
							<button class="btn ghost" onclick={() => appearance.set({ accent: null })}>
								{m.settings.accentDefault}
							</button>
						{/if}
					</div>
				</div>
				<div class="line">
					<span>{m.settings.density}</span>
					<Segmented
						label={m.settings.density}
						value={a.density}
						options={opts(m.settings.densities)}
						onchange={(density) => appearance.set({ density })}
					/>
				</div>
				<div class="line">
					<span>{m.settings.fontSize}</span>
					<Segmented
						label={m.settings.fontSize}
						value={a.fontSize}
						options={opts(m.settings.fontSizes)}
						onchange={(fontSize) => appearance.set({ fontSize })}
					/>
				</div>
				<label class="line">
					<span>
						{m.settings.tintGroups}
						<small>{m.settings.tintGroupsHint}</small>
					</span>
					<input
						type="checkbox"
						class="switch"
						role="switch"
						checked={a.tintGroups}
						onchange={(e) => appearance.set({ tintGroups: e.currentTarget.checked })}
					/>
				</label>
				<label class="line">
					<span>
						{m.settings.openDetailOnClick}
						<small>{m.settings.openDetailOnClickHint}</small>
					</span>
					<input
						type="checkbox"
						class="switch"
						role="switch"
						checked={a.openDetailOnClick}
						onchange={(e) => appearance.set({ openDetailOnClick: e.currentTarget.checked })}
					/>
				</label>
				<div class="line end">
					<button class="btn ghost" onclick={() => appearance.reset()}>
						{m.settings.resetAppearance}
					</button>
				</div>
			</section>
		{:else if section === 'zeit'}
			<section class="card" data-testid="time-settings">
				<header>
					<h2 class="card-heading">{m.timeSettings.title}</h2>
					<p class="card-sub">{m.timeSettings.hint}</p>
				</header>
				{#if timeSettings.loaded}
					<label class="line">
						<span>
							{m.timeSettings.enable}
							<small>{m.timeSettings.enableHint}</small>
						</span>
						<input
							type="checkbox"
							class="switch"
							role="switch"
							checked={timeSettings.enabled}
							onchange={(e) => timeSettings.set({ enabled: e.currentTarget.checked })}
						/>
					</label>
				{/if}
				{#if timeSettings.enabled}
					<div class="line">
						<span>
							{m.timeSettings.targets}
							<small>{m.timeSettings.targetsHint}</small>
						</span>
						<div class="week">
							{#each m.timeSettings.weekdays as day, i (day)}
								<label>
									<span>{day}</span>
									<input
										class="field"
										aria-label="{m.timeSettings.targets} {day}"
										value={formatDuration(timeSettings.current.targets[i] ?? 0)}
										onchange={(e) => setTarget(i, e.currentTarget)}
									/>
								</label>
							{/each}
						</div>
					</div>
					<div class="line">
						<span>{m.timeSettings.weekTotal}</span>
						<strong data-testid="week-target">
							{formatDuration(timeSettings.current.targets.reduce((a, b) => a + b, 0))}
							{m.time.hours}
						</strong>
					</div>
					<div class="line">
						<span>
							{m.timeSettings.round}
							<small>{m.timeSettings.roundHint}</small>
						</span>
						<Segmented
							label={m.timeSettings.round}
							value={String(timeSettings.current.roundTo)}
							options={[
								{ value: '1', label: m.timeSettings.roundExact },
								{ value: '5', label: '5 min' },
								{ value: '15', label: '15 min' }
							]}
							onchange={(v) => timeSettings.set({ roundTo: Number(v) })}
						/>
					</div>
				{/if}
			</section>
		{:else if section === 'inbox'}
			<section class="card">
				<header>
					<h2 class="card-heading">{m.settings.inbox}</h2>
					<p class="card-sub">{m.settings.inboxHint}</p>
				</header>
				<label class="line">
					<span>{m.settings.agingDays}</span>
					<input
						class="field number"
						type="number"
						min="1"
						max="90"
						value={agingDays.current}
						onchange={(e) =>
							repo.setSetting('inboxAgingDays', Math.max(1, Number(e.currentTarget.value) || 7))}
					/>
				</label>
			</section>

			<TriageSettingsCard />
		{:else if section === 'pools'}
			<section class="card">
				<header>
					<h2 class="card-heading">{m.settings.pools}</h2>
					<p class="card-sub">{m.settings.poolsHint}</p>
				</header>
				{#each active as p (p.id)}
					<div class="pool-block">
						{@render poolEditor(p, true)}
						{#if projects.current.some((pr) => pr.poolId === p.id)}
							<div class="projects">
								{#each projects.current.filter((pr) => pr.poolId === p.id) as pr (pr.id)}
									<Editor
										item={pr}
										onupdate={(patch) => repo.updateProject(pr.id, patch)}
										onmove={(dir) => repo.moveProject(pr.id, dir)}
										onarchive={() => repo.updateProject(pr.id, { archived: !pr.archived })}
										ondelete={() => deleteProject(pr)}
									/>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
				<form
					class="line new-pool"
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
						<div class="pool-block">{@render poolEditor(p, false)}</div>
					{/each}
				{/if}
			</section>
		{:else}
			<section class="card">
				<SyncSettings />
			</section>
			<p class="about">{m.settings.about}</p>
		{/if}
	</div>
</div>

{#snippet poolEditor(p: Pool, reorder: boolean)}
	<Editor
		item={p}
		onupdate={(patch) => repo.updatePool(p.id, patch)}
		onmove={reorder && p.kind === 'pool' ? (dir) => repo.movePool(p.id, dir) : undefined}
		onarchive={p.kind === 'pool'
			? () => repo.updatePool(p.id, { archived: !p.archived })
			: undefined}
		ondelete={p.kind === 'pool' ? () => deletePool(p) : undefined}
	/>
{/snippet}

<style>
	h1 {
		font-size: 1.5rem;
		margin: 0 0 16px;
	}
	section {
		margin-bottom: var(--gap);
		padding: 14px 16px;
	}
	header {
		margin-bottom: 10px;
	}
	/* Zweispaltig am PC: Bereichsliste links, Inhalt rechts */
	.settings {
		display: grid;
		grid-template-columns: 190px minmax(0, 1fr);
		gap: 20px;
		align-items: start;
	}
	.sections {
		position: sticky;
		top: 12px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.sec {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 40px;
		padding: 0 12px;
		border-radius: var(--radius);
		color: var(--text-muted);
		text-align: left;
		white-space: nowrap;
	}
	.sec:hover {
		background: var(--bg-hover);
		color: var(--text);
	}
	.sec.on {
		background: color-mix(in srgb, var(--accent) 14%, transparent);
		color: var(--text);
		font-weight: 600;
	}
	.sec.on :global(svg) {
		color: var(--accent);
	}
	@media (max-width: 760px) {
		.settings {
			grid-template-columns: minmax(0, 1fr);
			gap: 12px;
		}
		/* Am Handy: Bereiche als waagrechte Leiste zum Wischen */
		.sections {
			position: static;
			flex-direction: row;
			overflow-x: auto;
			scrollbar-width: none;
			margin: 0 -10px;
			padding: 0 10px 2px;
		}
		.sec {
			flex: none;
			min-height: 36px;
			border: 1px solid var(--border);
		}
		.sec.on {
			border-color: var(--accent);
		}
	}
	h3 {
		font-size: 0.875rem;
		color: var(--text-muted);
		margin: 16px 0 4px;
	}
	.line {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
		min-height: 44px;
		padding: 4px 0;
		border-top: 1px solid var(--border);
	}
	header + .line {
		border-top: 0;
	}
	.line > span {
		flex: 1 1 110px;
	}
	.line small {
		display: block;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}
	.line.end {
		justify-content: flex-end;
	}
	.accent {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.number {
		width: 90px;
	}
	.switch {
		appearance: none;
		width: 40px;
		height: 24px;
		border-radius: 12px;
		background: var(--border-strong);
		position: relative;
		cursor: pointer;
		flex: none;
		transition: background 120ms;
	}
	.switch::after {
		content: '';
		position: absolute;
		top: 3px;
		left: 3px;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: #fff;
		transition: transform 120ms;
	}
	.switch:checked {
		background: var(--accent);
	}
	.switch:checked::after {
		transform: translateX(16px);
	}
	.week {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 4px;
		flex: 1 1 320px;
		max-width: 420px;
	}
	.week label {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		font-size: 0.75rem;
		color: var(--text-muted);
	}
	.week .field {
		width: 100%;
		min-width: 0;
		padding: 6px 2px;
		text-align: center;
		font-variant-numeric: tabular-nums;
		color: var(--text);
	}
	.pool-block {
		border-top: 1px solid var(--border);
		padding: 2px 0;
	}
	header + .pool-block {
		border-top: 0;
	}
	.projects {
		padding-left: 20px;
		border-left: 2px solid var(--border);
		margin: 0 0 6px 13px;
	}
	.new-pool {
		padding-top: 10px;
	}
	.new-pool .field {
		flex: 1 1 200px;
	}
	.about {
		color: var(--text-faint);
		font-size: 0.8125rem;
	}
</style>
