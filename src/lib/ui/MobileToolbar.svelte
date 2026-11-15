<script lang="ts">
	/**
	 * Leiste über der Bildschirmtastatur (Touch-Geräte), solange eine Aufgabenzeile bearbeitet wird.
	 * Die Buttons lösen dieselben Tastendrücke aus wie am PC – die Logik liegt nur im Outliner.
	 */
	import { m } from '#lib/i18n/index.ts';
	import { ui } from '#lib/state/ui.svelte.ts';
	import Icon, { type IconName } from './Icon.svelte';

	let bottom = $state(0);
	let coarse = $state(false);

	$effect(() => {
		const mq = matchMedia('(pointer: coarse)');
		coarse = mq.matches;
		const onMq = () => (coarse = mq.matches);
		mq.addEventListener('change', onMq);
		const vv = window.visualViewport;
		const onVv = () => {
			if (vv) bottom = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
		};
		vv?.addEventListener('resize', onVv);
		vv?.addEventListener('scroll', onVv);
		onVv();
		return () => {
			mq.removeEventListener('change', onMq);
			vv?.removeEventListener('resize', onVv);
			vv?.removeEventListener('scroll', onVv);
		};
	});

	function key(k: string, opts: KeyboardEventInit = {}) {
		const el = document.activeElement;
		if (!(el instanceof HTMLInputElement)) return;
		el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...opts }));
	}

	const buttons: { icon: IconName; label: string; run: () => void }[] = [
		{ icon: 'outdent', label: m.toolbar.outdent, run: () => key('Tab', { shiftKey: true }) },
		{ icon: 'indent', label: m.toolbar.indent, run: () => key('Tab') },
		{ icon: 'up', label: m.toolbar.up, run: () => key('ArrowUp', { altKey: true }) },
		{ icon: 'down', label: m.toolbar.down, run: () => key('ArrowDown', { altKey: true }) },
		{ icon: 'check', label: m.toolbar.done, run: () => key('Enter', { ctrlKey: true }) },
		{
			icon: 'keyboard',
			label: m.toolbar.hide,
			run: () => (document.activeElement as HTMLElement)?.blur()
		}
	];
</script>

{#if coarse && ui.editingId}
	<div class="toolbar" style:bottom="{bottom}px" role="toolbar" aria-label="Gliederung">
		{#each buttons as b (b.icon)}
			<button
				aria-label={b.label}
				onpointerdown={(e) => {
					e.preventDefault(); // Fokus (und Tastatur) bleibt im Eingabefeld
					b.run();
				}}><Icon name={b.icon} size={20} /></button
			>
		{/each}
	</div>
{/if}

<style>
	.toolbar {
		position: fixed;
		left: 0;
		right: 0;
		z-index: 50;
		display: flex;
		justify-content: space-around;
		background: var(--bg-raised);
		border-top: 1px solid var(--border);
		padding: 4px 8px;
	}
	button {
		width: 48px;
		height: 40px;
		display: grid;
		place-items: center;
		border-radius: 8px;
		color: var(--text-muted);
	}
	button:active {
		background: var(--bg-hover);
	}
</style>
