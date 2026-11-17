<script lang="ts">
	/** Ordo-Logo: offenes O, der Punkt ist das zuletzt Einsortierte. Folgt der Akzentfarbe. */
	let { size = 26 }: { size?: number } = $props();
</script>

<svg class="logo" width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
	<rect width="512" height="512" rx="128" fill="var(--accent)" />
	<g transform="translate(-8 8)" fill="var(--accent-contrast)">
		<path
			d="M391.2 219.8A140 140 0 1 1 292.2 120.8"
			fill="none"
			stroke="var(--accent-contrast)"
			stroke-width="56"
			stroke-linecap="round"
		/>
		<circle cx="355" cy="157" r="34" />
	</g>
</svg>

<style>
	.logo {
		flex: none;
		display: block;
	}
</style>
