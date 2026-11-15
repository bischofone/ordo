<script lang="ts" module>
	const PATHS = {
		chevron: 'M9 6l6 6-6 6',
		check: 'M5 12.5l4.5 4.5L19 7.5',
		clock: 'M12 7v5l3 2M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z',
		more: 'M5 12h.01M12 12h.01M19 12h.01',
		plus: 'M12 5v14M5 12h14',
		menu: 'M4 7h16M4 12h16M4 17h16',
		inbox: 'M4 13h4l2 3h4l2-3h4M5 6h14l1 7v5H4v-5z',
		layers: 'M12 4l8 4-8 4-8-4 8-4zM4 12l8 4 8-4M4 16l8 4 8-4',
		calendar: 'M4 7h16v13H4zM4 11h16M8 4v4M16 4v4',
		flag: 'M6 21V4M6 4h11l-2 4 2 4H6',
		hash: 'M5 9h14M5 15h14M10 4L8 20M16 4l-2 16',
		trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
		x: 'M6 6l12 12M18 6L6 18',
		outdent: 'M20 6H10M20 12H10M20 18H10M7 9l-3 3 3 3',
		indent: 'M20 6H10M20 12H10M20 18H10M4 9l3 3-3 3',
		up: 'M12 19V5M6 11l6-6 6 6',
		down: 'M12 5v14M6 13l6 6 6-6',
		keyboard: 'M3 7h18v10H3zM7 11h.01M11 11h.01M15 11h.01M8 14h8',
		settings:
			'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
		archive: 'M4 5h16v4H4zM5 9v10h14V9M10 13h4',
		broom: 'M14 4l6 6M12 6l6 6-7 7H7l-2-2v-4z',
		edit: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
		repeat: 'M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4'
	} as const;
	export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
	let { name, size = 18 }: { name: IconName; size?: number } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	<path d={PATHS[name]} />
</svg>
