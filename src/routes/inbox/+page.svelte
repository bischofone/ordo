<script lang="ts">
	import { resolve } from '$app/paths';
	import { INBOX_ID } from '#lib/db/repo.ts';
	import { isOpen } from '#lib/domain/types.ts';
	import { DEFAULT_INBOX_AGING_DAYS, isAged } from '#lib/domain/views.ts';
	import { m } from '#lib/i18n/index.ts';
	import { live } from '#lib/state/live.svelte.ts';
	import { q } from '#lib/state/queries.ts';
	import { ui } from '#lib/state/ui.svelte.ts';
	import Icon from '#lib/ui/Icon.svelte';
	import PoolSync from '#lib/ui/PoolSync.svelte';
	import SyncChip from '#lib/ui/SyncChip.svelte';
	import TaskGroup from '#lib/ui/TaskGroup.svelte';
	import QuickAdd from '#lib/ui/QuickAdd.svelte';

	const pools = live(() => q.pools, []);
	const projects = live(() => q.projects, []);
	const tasks = live(() => q.poolTasks(INBOX_ID), []);
	const agingDays = live(
		() => q.setting('inboxAgingDays', DEFAULT_INBOX_AGING_DAYS),
		DEFAULT_INBOX_AGING_DAYS
	);

	const inbox = $derived(pools.current.find((p) => p.id === INBOX_ID));
	const open = $derived(tasks.current.filter((t) => t.parentId === null && isOpen(t)));
	const aged = $derived(open.filter((t) => isAged(t, ui.now, agingDays.current)).length);
	let editing = $state(false);
</script>

<header>
	<h1>{m.inbox.title}</h1>
	<button
		class="icon-btn"
		aria-label={m.inbox.edit}
		aria-expanded={editing}
		onclick={() => (editing = !editing)}><Icon name="edit" size={16} /></button
	>
	{#if inbox}<SyncChip pool={inbox} onclick={() => (editing = !editing)} />{/if}
	<span class="spacer"></span>
	{#if open.length}
		<a class="btn" href={resolve('/inbox/aufraeumen')}
			><Icon name="broom" size={16} />{m.inbox.triage}</a
		>
	{/if}
</header>

{#if editing && inbox}<PoolSync pool={inbox} />{/if}

{#if aged}
	<p class="hint">{m.inbox.aged(aged)}</p>
{/if}

<QuickAdd
	pools={pools.current.filter((p) => !p.archived)}
	projects={projects.current}
	defaultPoolId={INBOX_ID}
/>

{#if inbox}
	<section class="card group" data-testid="pool-section">
		<TaskGroup
			poolId={inbox.id}
			projectId={null}
			tasks={tasks.current}
			agingDays={agingDays.current}
		/>
	</section>
{/if}

<style>
	.group {
		padding: var(--card-pad) 6px;
	}
	.spacer {
		flex: 1;
	}
	header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 12px;
	}
	h1 {
		font-size: 1.5rem;
		margin: 0;
	}
	.hint {
		margin: 0 0 12px;
		padding: 8px 12px;
		border-radius: 8px;
		background: color-mix(in srgb, var(--warn) 14%, transparent);
		color: var(--warn);
	}
</style>
