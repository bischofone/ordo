<script lang="ts">
	/** Bearbeiten von Pool oder Projekt: Farbe, Icon, Name, Reihenfolge, Archivieren, Löschen. */
	import { m } from '#lib/i18n/index.ts';
	import ColorPicker from './ColorPicker.svelte';
	import Icon from './Icon.svelte';
	import IconPicker from './IconPicker.svelte';

	interface Item {
		name: string;
		color: string;
		icon?: string;
		archived: boolean;
	}

	let {
		item,
		onupdate,
		onmove,
		onarchive,
		ondelete
	}: {
		item: Item;
		onupdate: (patch: Partial<Item>) => void;
		onmove?: (dir: -1 | 1) => void;
		onarchive?: () => void;
		ondelete?: () => void;
	} = $props();
</script>

<div class="editor" class:archived={item.archived} data-testid="editor">
	<ColorPicker value={item.color} onchange={(color) => onupdate({ color })} />
	<IconPicker value={item.icon} color={item.color} onchange={(icon) => onupdate({ icon })} />
	<input
		class="field name"
		value={item.name}
		aria-label={m.pool.name}
		onchange={(e) =>
			e.currentTarget.value.trim() && onupdate({ name: e.currentTarget.value.trim() })}
	/>
	<div class="actions">
		{#if onmove && !item.archived}
			<button
				class="icon-btn"
				aria-label={m.pool.moveUp}
				title={m.pool.moveUp}
				onclick={() => onmove(-1)}><Icon name="up" size={16} /></button
			>
			<button
				class="icon-btn"
				aria-label={m.pool.moveDown}
				title={m.pool.moveDown}
				onclick={() => onmove(1)}><Icon name="down" size={16} /></button
			>
		{/if}
		{#if onarchive}
			{@const label = item.archived ? m.pool.unarchive : m.pool.archive}
			<button
				class="icon-btn"
				class:on={item.archived}
				aria-label={label}
				title={label}
				onclick={onarchive}
			>
				<Icon name="archive" size={16} />
			</button>
		{/if}
		{#if ondelete}
			<button
				class="icon-btn danger"
				aria-label={m.task.delete}
				title={m.task.delete}
				onclick={ondelete}
			>
				<Icon name="trash" size={16} />
			</button>
		{/if}
	</div>
</div>

<style>
	.editor {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
		padding: 8px 0;
	}
	.archived .name {
		color: var(--text-muted);
		text-decoration: line-through;
	}
	.name {
		flex: 1 1 160px;
		min-width: 0;
	}
	.actions {
		display: flex;
		gap: 4px;
		align-items: center;
	}
	.icon-btn.on {
		color: var(--accent);
	}
	.icon-btn.danger:hover {
		color: var(--danger);
	}
</style>
