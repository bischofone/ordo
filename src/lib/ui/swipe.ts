/**
 * Wischgeste für Touch (Maus wird ignoriert, damit Textauswahl am PC funktioniert).
 * Das Element folgt dem Finger; ab `threshold` Pixeln wird die Aktion ausgelöst.
 */
export interface SwipeOptions {
	onleft?: () => void;
	onright?: () => void;
	threshold?: number;
}

export function swipe(node: HTMLElement, options: SwipeOptions) {
	let opts = options;
	let startX = 0;
	let startY = 0;
	let dx = 0;
	let active = false;
	let horizontal: boolean | null = null;

	const reset = () => {
		node.style.transform = '';
		node.style.transition = 'transform 150ms ease';
		node.removeAttribute('data-swipe');
		active = false;
		horizontal = null;
		dx = 0;
	};

	const down = (e: PointerEvent) => {
		if (e.pointerType === 'mouse') return;
		active = true;
		startX = e.clientX;
		startY = e.clientY;
		node.style.transition = '';
	};

	const move = (e: PointerEvent) => {
		if (!active) return;
		const x = e.clientX - startX;
		const y = e.clientY - startY;
		if (horizontal === null && Math.hypot(x, y) > 8) horizontal = Math.abs(x) > Math.abs(y) * 1.5;
		if (!horizontal) return;
		if ((x < 0 && !opts.onleft) || (x > 0 && !opts.onright)) return;
		dx = x;
		node.style.transform = `translateX(${dx}px)`;
		const t = opts.threshold ?? 80;
		node.dataset.swipe = dx > t ? 'right' : dx < -t ? 'left' : '';
	};

	const up = () => {
		if (!active) return;
		const t = opts.threshold ?? 80;
		const d = dx;
		reset();
		if (d > t) opts.onright?.();
		else if (d < -t) opts.onleft?.();
	};

	node.addEventListener('pointerdown', down);
	node.addEventListener('pointermove', move);
	node.addEventListener('pointerup', up);
	node.addEventListener('pointercancel', reset);
	return {
		update(o: SwipeOptions) {
			opts = o;
		},
		destroy() {
			node.removeEventListener('pointerdown', down);
			node.removeEventListener('pointermove', move);
			node.removeEventListener('pointerup', up);
			node.removeEventListener('pointercancel', reset);
		}
	};
}
