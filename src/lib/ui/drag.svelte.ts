/**
 * Drag & Drop für Aufgaben (Maus und Touch, über Pointer-Events).
 * - Gezogen wird am Griff einer Zeile; Unteraufgaben wandern mit.
 * - Senkrecht bestimmt die Position, waagrecht die Ebene (Ein-/Ausrücken).
 * - Ziele: Aufgabenlisten desselben Bereichs (auch anderer Projekte/Pools) und
 *   Pools/Projekte in der Seitenleiste.
 * Die Berechnung der Zielposition steckt in `domain/dnd.ts` (getestet).
 */
import { dropPlacement, type DropPlacement } from '#lib/domain/dnd.ts';
import type { Row } from '#lib/domain/tree.ts';
import { repo } from '#lib/state/app.ts';

export const INDENT_PX = 22;
const START_THRESHOLD = 4;

export interface DropList {
	el: HTMLElement;
	poolId: string;
	projectId: string | null;
	section: string;
	rows: () => Row[];
}

let lists: DropList[] = [];

export function registerDropList(list: DropList) {
	lists = [...lists, list];
	return () => {
		lists = lists.filter((l) => l !== list);
	};
}

class DragUi {
	/** Schwebende Vorschau am Zeiger */
	ghost = $state<{ title: string; x: number; y: number } | null>(null);
	/** Einfügelinie (Viewport-Koordinaten) */
	indicator = $state<{ top: number; left: number; width: number } | null>(null);
	/** Seitenleisten-Ziel unter dem Zeiger, z. B. "pool:<id>" oder "project:<id>" */
	overTarget = $state<string | null>(null);
	/** IDs der gezogenen Aufgaben (zum Abblenden) */
	moving = $state.raw<readonly string[]>([]);
}

export const drag = new DragUi();

interface Session {
	id: string;
	title: string;
	section: string;
	originDepth: number;
	startX: number;
	startY: number;
	x: number;
	y: number;
	started: boolean;
	drop:
		| { kind: 'list'; list: DropList; placement: DropPlacement }
		| { kind: 'target'; poolId: string; projectId: string | null; name: string }
		| null;
	scrollTimer?: ReturnType<typeof setInterval>;
}

let session: Session | null = null;

export function startDrag(
	e: PointerEvent,
	opts: { row: Row; section: string; moving: string[] },
	ondrop?: (result: { name?: string }) => void
) {
	if (e.button !== 0 || session) return;
	e.preventDefault();
	session = {
		id: opts.row.task.id,
		title: opts.row.task.title,
		section: opts.section,
		originDepth: opts.row.depth,
		startX: e.clientX,
		startY: e.clientY,
		x: e.clientX,
		y: e.clientY,
		started: false,
		drop: null
	};
	const moving = opts.moving;

	const onMove = (ev: PointerEvent) => {
		if (!session) return;
		session.x = ev.clientX;
		session.y = ev.clientY;
		if (!session.started) {
			if (Math.hypot(ev.clientX - session.startX, ev.clientY - session.startY) < START_THRESHOLD)
				return;
			session.started = true;
			drag.moving = moving;
			document.body.classList.add('is-dragging');
			session.scrollTimer = setInterval(autoScroll, 16);
		}
		ev.preventDefault();
		update(moving);
	};

	const finish = async (commit: boolean) => {
		window.removeEventListener('pointermove', onMove);
		window.removeEventListener('pointerup', onUp);
		window.removeEventListener('pointercancel', onCancel);
		window.removeEventListener('keydown', onKey);
		const s = session;
		session = null;
		if (s?.scrollTimer) clearInterval(s.scrollTimer);
		document.body.classList.remove('is-dragging');
		drag.ghost = null;
		drag.indicator = null;
		drag.overTarget = null;
		drag.moving = [];
		if (!commit || !s?.started || !s.drop) return;
		if (s.drop.kind === 'target') {
			await repo.moveTo(s.id, { poolId: s.drop.poolId, projectId: s.drop.projectId });
			ondrop?.({ name: s.drop.name });
		} else {
			const { list, placement } = s.drop;
			await repo.placeTask(s.id, {
				poolId: list.poolId,
				projectId: list.projectId,
				parentId: placement.parentId,
				sortOrder: placement.sortOrder
			});
			ondrop?.({});
		}
	};
	const onUp = () => finish(true);
	const onCancel = () => finish(false);
	const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && finish(false);

	window.addEventListener('pointermove', onMove, { passive: false });
	window.addEventListener('pointerup', onUp);
	window.addEventListener('pointercancel', onCancel);
	window.addEventListener('keydown', onKey);
}

function update(moving: readonly string[]) {
	const s = session;
	if (!s) return;
	drag.ghost = { title: s.title, x: s.x, y: s.y };
	s.drop = null;
	drag.indicator = null;
	drag.overTarget = null;

	const el = document.elementFromPoint(s.x, s.y);

	// Pool/Projekt in der Seitenleiste
	const target = el?.closest<HTMLElement>('[data-drop-target]');
	if (target) {
		const { poolId, projectId, name } = target.dataset;
		if (poolId) {
			drag.overTarget = target.dataset.dropTarget!;
			s.drop = { kind: 'target', poolId, projectId: projectId || null, name: name ?? '' };
		}
		return;
	}

	// Aufgabenliste desselben Bereichs – direkt unter dem Zeiger oder (beim Ausrücken über den
	// linken Rand hinaus) die Liste, deren Höhe der Zeiger gerade überstreicht.
	const hit = el?.closest<HTMLElement>('[data-drop-list]');
	const candidates = lists.filter((l) => l.section === s.section);
	const list =
		candidates.find((l) => l.el === hit) ??
		candidates.find((l) => {
			const b = l.el.getBoundingClientRect();
			return s.y >= b.top - 4 && s.y <= b.bottom + 4 && s.x >= b.left - 240 && s.x <= b.right;
		});
	if (!list) return;
	const listEl = list.el;

	const rows = list.rows().filter((r) => !moving.includes(r.task.id));
	const rowEls = [...listEl.querySelectorAll<HTMLElement>('[data-row-id]')].filter(
		(r) => !moving.includes(r.dataset.rowId!)
	);
	let slot = rowEls.findIndex((r) => {
		const b = r.getBoundingClientRect();
		return s.y < b.top + b.height / 2;
	});
	if (slot < 0) slot = rowEls.length;

	const desired = s.originDepth + Math.round((s.x - s.startX) / INDENT_PX);
	const placement = dropPlacement(rows, slot, desired);
	s.drop = { kind: 'list', list, placement };

	const listBox = listEl.getBoundingClientRect();
	const top =
		slot < rowEls.length
			? rowEls[slot].getBoundingClientRect().top
			: rowEls.length
				? rowEls[rowEls.length - 1].getBoundingClientRect().bottom
				: listBox.top;
	const left = listBox.left + placement.depth * INDENT_PX + 22;
	drag.indicator = { top, left, width: Math.max(40, listBox.right - left) };
}

function autoScroll() {
	if (!session) return;
	const edge = 60;
	const { y } = session;
	let dy = 0;
	if (y < edge) dy = -Math.ceil((edge - y) / 4);
	else if (y > window.innerHeight - edge) dy = Math.ceil((y - (window.innerHeight - edge)) / 4);
	if (dy) {
		window.scrollBy(0, dy);
		update(drag.moving);
	}
}
