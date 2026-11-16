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
		repeat: 'M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4',
		grip: 'M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01',
		subtask: 'M6 4v9a3 3 0 0 0 3 3h9M15 13l3 3-3 3',
		// Auswahl-Icons für Pools und Projekte
		folder: 'M3 6h6l2 2h10v11H3z',
		home: 'M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6',
		briefcase: 'M3 8h18v12H3zM8 8V5h8v3M3 13h18',
		heart: 'M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.5A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z',
		star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
		book: 'M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2zM4 21V5M8 7h8',
		cart: 'M3 4h2l2.5 11h11L21 7H6.5M9 20h.01M18 20h.01',
		code: 'M8 8l-5 4 5 4M16 8l5 4-5 4M14 5l-4 14',
		plane: 'M2 14l20-8-6 15-3-6-6-1zM13 15l9-9',
		dumbbell: 'M3 10v4M7 7v10M17 7v10M21 10v4M7 12h10',
		music: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
		money: 'M17 6a7 7 0 1 0 0 12M4 10h9M4 14h9',
		gift: 'M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8S10 3 7.5 4.5 9 8 12 8zM12 8s2-5 4.5-3.5S15 8 12 8z',
		leaf: 'M5 19C5 9 11 4 20 4c0 9-5 15-15 15zM5 19l8-8',
		car: 'M5 17h14v-5l-2-5H7l-2 5zM5 12h14M7 17v2M17 17v2M8 14.5h.01M16 14.5h.01',
		tool: 'M14.5 6.5a4 4 0 0 0 5 5L12 19a2 2 0 0 1-3-3l7.5-7.5zM14.5 6.5L17 4a4 4 0 0 0-5 5',
		bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z',
		camera: 'M3 8h4l2-3h6l2 3h4v12H3zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
		users:
			'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7M22 21v-1a6 6 0 0 0-4-5.7',
		school: 'M2 9l10-5 10 5-10 5zM6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5M22 9v6',
		paw: 'M12 21c-3 0-5-2-5-4s2-4 5-4 5 2 5 4-2 4-5 4zM5 11h.01M9 7h.01M15 7h.01M19 11h.01',
		coffee: 'M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h2a2 2 0 0 1 0 4h-2M8 3v2M12 3v2',
		game: 'M6 9h12a4 4 0 0 1 4 4v1a3 3 0 0 1-5.5 1.7L15 14H9l-1.5 1.7A3 3 0 0 1 2 14v-1a4 4 0 0 1 4-4zM7 11v3M5.5 12.5h3M16 12h.01M18 13.5h.01',
		target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01'
	} as const;
	export type IconName = keyof typeof PATHS;

	/** Icons, die für Pools und Projekte zur Auswahl stehen. */
	export const PICKER_ICONS: IconName[] = [
		'folder',
		'home',
		'briefcase',
		'heart',
		'star',
		'target',
		'book',
		'school',
		'code',
		'bulb',
		'tool',
		'cart',
		'money',
		'gift',
		'plane',
		'car',
		'dumbbell',
		'leaf',
		'paw',
		'coffee',
		'music',
		'camera',
		'game',
		'users'
	];

	export const isIconName = (s: string | undefined): s is IconName => !!s && s in PATHS;
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
