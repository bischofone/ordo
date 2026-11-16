<script lang="ts">
	import '../app.css';
	import { untrack } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { DEFAULT_INBOX_AGING_DAYS } from '#lib/domain/views.ts';
	import { m } from '#lib/i18n/index.ts';
	import { repo } from '#lib/state/app.ts';
	import { live } from '#lib/state/live.svelte.ts';
	import { q } from '#lib/state/queries.ts';
	import { startAutoSync } from '#lib/state/sync.svelte.ts';
	import { ui } from '#lib/state/ui.svelte.ts';
	import Icon from '#lib/ui/Icon.svelte';
	import DragLayer from '#lib/ui/DragLayer.svelte';
	import MobileToolbar from '#lib/ui/MobileToolbar.svelte';
	import Overlays from '#lib/ui/Overlays.svelte';
	import Sidebar from '#lib/ui/Sidebar.svelte';
	import TaskDetail from '#lib/ui/TaskDetail.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const pools = live(() => q.pools, []);
	const projects = live(() => q.projects, []);
	const tasks = live(() => q.allTasks, []);
	const agingDays = live(
		() => q.setting('inboxAgingDays', DEFAULT_INBOX_AGING_DAYS),
		DEFAULT_INBOX_AGING_DAYS
	);

	// untrack: der Start darf nicht von reaktivem Zustand abhängen (sonst Neustart-Schleife)
	$effect(() => untrack(() => startAutoSync()));

	$effect(() => {
		repo.ensureDefaults();
		const timer = setInterval(() => (ui.now = new Date()), 60_000);
		const onVisible = () => document.visibilityState === 'visible' && (ui.now = new Date());
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			clearInterval(timer);
			document.removeEventListener('visibilitychange', onVisible);
		};
	});

	afterNavigate(() => {
		ui.sidebarOpen = false;
		ui.postponeId = null;
	});
</script>

<svelte:head>
	<title>{m.appName}</title>
</svelte:head>

<div class="app">
	<Sidebar
		pools={pools.current}
		projects={projects.current}
		tasks={tasks.current}
		agingDays={agingDays.current}
	/>
	<div class="main-col">
		<header class="topbar">
			<button class="icon-btn" aria-label={m.nav.menu} onclick={() => (ui.sidebarOpen = true)}>
				<Icon name="menu" />
			</button>
			<span class="brand">{m.appName}</span>
		</header>
		<main>
			{@render children()}
		</main>
	</div>
</div>

<TaskDetail
	pools={pools.current.filter((p) => !p.archived)}
	projects={projects.current.filter((p) => !p.archived)}
/>
<DragLayer />
<Overlays />
<MobileToolbar />

<style>
	.app {
		display: flex;
		min-height: 100dvh;
	}
	.main-col {
		flex: 1;
		min-width: 0;
	}
	main {
		max-width: 820px;
		margin: 0 auto;
		padding: 20px 20px 120px;
	}
	.topbar {
		display: none;
	}
	@media (max-width: 800px) {
		.topbar {
			display: flex;
			align-items: center;
			gap: 8px;
			position: sticky;
			top: 0;
			z-index: 20;
			padding: 8px 8px calc(8px) 8px;
			padding-top: calc(8px + env(safe-area-inset-top));
			background: var(--bg);
			border-bottom: 1px solid var(--border);
		}
		.brand {
			font-weight: 600;
		}
		main {
			padding: 12px 10px 140px;
		}
	}
</style>
