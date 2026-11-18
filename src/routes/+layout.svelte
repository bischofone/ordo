<script lang="ts">
	/**
	 * App-Rahmen: Seitenleiste, Kopfzeile (Handy), Timer- und Aufräum-Hinweis, Detailansicht.
	 * Startet Sync, Zeit-Einstellungen und den Aufräum-Zeitplan; leitet beim „Erzwingen“ ins Aufräumen.
	 */
	import '../app.css';
	import { untrack } from 'svelte';
	import { afterNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { INBOX_ID } from '#lib/db/repo.ts';
	import { triageDue } from '#lib/domain/triage.ts';
	import { isOpen } from '#lib/domain/types.ts';
	import { DEFAULT_INBOX_AGING_DAYS } from '#lib/domain/views.ts';
	import { m } from '#lib/i18n/index.ts';
	import { repo } from '#lib/state/app.ts';
	import { live } from '#lib/state/live.svelte.ts';
	import { q } from '#lib/state/queries.ts';
	import { startAutoSync } from '#lib/state/sync.svelte.ts';
	import { watchTimeSettings } from '#lib/state/time-settings.svelte.ts';
	import { watchTimer } from '#lib/state/timer.svelte.ts';
	import { triage, watchTriage } from '#lib/state/triage.svelte.ts';
	import { watchAi } from '#lib/state/ai.svelte.ts';
	import { watchPlanning } from '#lib/state/planning.svelte.ts';
	import { ui } from '#lib/state/ui.svelte.ts';
	import Icon from '#lib/ui/Icon.svelte';
	import Logo from '#lib/ui/Logo.svelte';
	import DragLayer from '#lib/ui/DragLayer.svelte';
	import MobileToolbar from '#lib/ui/MobileToolbar.svelte';
	import Overlays from '#lib/ui/Overlays.svelte';
	import AiPanel from '#lib/ui/AiPanel.svelte';
	import Sidebar from '#lib/ui/Sidebar.svelte';
	import TimerBar from '#lib/ui/TimerBar.svelte';
	import TriageBanner from '#lib/ui/TriageBanner.svelte';
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
	$effect(() => untrack(() => watchTimer()));
	$effect(() => untrack(() => watchTimeSettings()));
	$effect(() => untrack(() => watchTriage()));
	$effect(() => untrack(() => watchAi()));
	$effect(() => untrack(() => watchPlanning()));

	// Inbox aufräumen: fällig? (minütlich und bei jeder Änderung neu berechnet)
	const inboxStats = $derived.by(() => {
		const open = tasks.current.filter(
			(t) => t.poolId === INBOX_ID && t.parentId === null && isOpen(t)
		);
		return {
			count: open.length,
			oldest: open.length ? Math.min(...open.map((t) => t.createdAt)) : undefined
		};
	});
	$effect(() => {
		triage.due = triage.loaded
			? triageDue(ui.now, triage.settings, triage.state, inboxStats)
			: null;
	});
	// Erzwingen: solange fällig, bleibt man im Aufräumen
	$effect(() => {
		if (triage.forced && !page.url.pathname.startsWith('/inbox/aufraeumen')) {
			void goto(resolve('/inbox/aufraeumen'));
		}
	});

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

	// Ab dieser Breite stehen die Details als Spalte neben der Liste.
	$effect(() => {
		const mq = matchMedia('(min-width: 1100px)');
		const update = () => (ui.docked = mq.matches);
		update();
		mq.addEventListener('change', update);
		return () => mq.removeEventListener('change', update);
	});

	afterNavigate(() => {
		ui.detailId = null;
		ui.sidebarOpen = false;
		ui.postponeId = null;
	});
</script>

<svelte:head>
	<title>{m.appName}</title>
</svelte:head>

<div class="app" class:with-detail={ui.docked && !!ui.detailId}>
	<Sidebar
		pools={pools.current}
		projects={projects.current}
		tasks={tasks.current}
		agingDays={agingDays.current}
	/>
	<div class="main-col">
		<div class="top">
			<header class="topbar">
				<button class="icon-btn" aria-label={m.nav.menu} onclick={() => (ui.sidebarOpen = true)}>
					<Icon name="menu" />
				</button>
				<span class="brand"><Logo size={22} />{m.appName}</span>
			</header>
			<TimerBar />
			<TriageBanner count={inboxStats.count} />
		</div>
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
<AiPanel />
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
	.with-detail .main-col {
		padding-right: var(--detail-w);
	}
	main {
		max-width: 820px;
		margin: 0 auto;
		padding: 20px 20px 120px;
	}
	.top {
		position: sticky;
		top: 0;
		z-index: 20;
	}
	.topbar {
		display: none;
	}
	@media (max-width: 800px) {
		.topbar {
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 8px 8px calc(8px) 8px;
			padding-top: calc(8px + env(safe-area-inset-top));
			background: var(--bg);
			border-bottom: 1px solid var(--border);
		}
		.brand {
			display: inline-flex;
			align-items: center;
			gap: 8px;
			font-weight: 700;
		}
		main {
			padding: 12px 10px 140px;
		}
	}
</style>
