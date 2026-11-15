<script lang="ts">
	import { POOL_COLORS, type Pool } from '#lib/domain/types.ts';
	import { m } from '#lib/i18n/index.ts';
	import { repo } from '#lib/state/app.ts';
	import Icon from './Icon.svelte';

	let { pool, reorder = false }: { pool: Pool; reorder?: boolean } = $props();
</script>

<div class="editor" class:archived={pool.archived}>
	<input
		class="field name"
		value={pool.name}
		aria-label={m.pool.name}
		onchange={(e) =>
			e.currentTarget.value.trim() &&
			repo.updatePool(pool.id, { name: e.currentTarget.value.trim() })}
	/>
	<div class="colors" role="radiogroup" aria-label={m.pool.color}>
		{#each POOL_COLORS as c (c)}
			<button
				role="radio"
				aria-checked={pool.color === c}
				aria-label={c}
				class="swatch"
				class:on={pool.color === c}
				style:background={c}
				onclick={() => repo.updatePool(pool.id, { color: c })}
			></button>
		{/each}
	</div>
	{#if pool.kind === 'pool'}
		<div class="actions">
			{#if reorder && !pool.archived}
				<button
					class="icon-btn"
					aria-label={m.pool.moveUp}
					onclick={() => repo.movePool(pool.id, -1)}><Icon name="up" size={16} /></button
				>
				<button
					class="icon-btn"
					aria-label={m.pool.moveDown}
					onclick={() => repo.movePool(pool.id, 1)}><Icon name="down" size={16} /></button
				>
			{/if}
			<button class="btn" onclick={() => repo.updatePool(pool.id, { archived: !pool.archived })}>
				<Icon name="archive" size={16} />{pool.archived ? m.pool.unarchive : m.pool.archive}
			</button>
		</div>
	{/if}
</div>

<style>
	.editor {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		align-items: center;
		padding: 10px 0;
	}
	.archived .name {
		color: var(--text-muted);
		text-decoration: line-through;
	}
	.name {
		flex: 1 1 160px;
	}
	.colors {
		display: flex;
		gap: 4px;
	}
	.swatch {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		border: 2px solid transparent;
	}
	.swatch.on {
		border-color: var(--text);
	}
	.actions {
		display: flex;
		gap: 4px;
		align-items: center;
	}
</style>
