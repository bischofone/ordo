/** Flüchtiger UI-Zustand (nicht in der Datenbank). */

export interface DialogAction {
	id: string;
	label: string;
	variant?: 'primary' | 'danger';
}

interface DialogRequest {
	title: string;
	message: string;
	actions: DialogAction[];
	resolve: (id: string | null) => void;
}

export interface Toast {
	id: number;
	message: string;
	action?: { label: string; run: () => unknown };
}

class UiState {
	/** Zeile, die nach dem nächsten Rendern den Fokus bekommen soll. */
	focus = $state<{ id: string; caret?: number | 'end' } | null>(null);
	/** Aktuell bearbeitete Zeile (für die Mobil-Leiste). */
	editingId = $state<string | null>(null);
	detailId = $state<string | null>(null);
	postponeId = $state<string | null>(null);
	sidebarOpen = $state(false);
	dialog = $state<DialogRequest | null>(null);
	toasts = $state<Toast[]>([]);
	/** Minütlich aktualisiert, damit „heute/morgen“ stimmt. */
	now = $state(new Date());
}

export const ui = new UiState();

export function ask(opts: Omit<DialogRequest, 'resolve'>): Promise<string | null> {
	ui.dialog?.resolve(null);
	return new Promise((resolve) => {
		ui.dialog = { ...opts, resolve };
	});
}

let toastId = 0;
export function toast(message: string, action?: Toast['action'], ms = 5000) {
	const id = ++toastId;
	ui.toasts = [...ui.toasts.slice(-2), { id, message, action }];
	setTimeout(() => dismissToast(id), ms);
}

export function dismissToast(id: number) {
	ui.toasts = ui.toasts.filter((t) => t.id !== id);
}

export function requestFocus(id: string, caret: number | 'end' = 'end') {
	ui.focus = { id, caret };
}

/*
 * Tastenpuffer für den Outliner: Zwischen Enter/Tab und dem Erscheinen der neuen Zeile
 * vergehen einige Millisekunden. Tastendrücke in dieser Zeit werden gesammelt und danach
 * in der richtigen Zeile abgespielt – so geht beim schnellen Tippen nichts verloren.
 */
interface KeyInit {
	key: string;
	shiftKey: boolean;
	altKey: boolean;
	ctrlKey: boolean;
	metaKey: boolean;
}

let keyQueue: KeyInit[] | null = null;
let keyTimer: ReturnType<typeof setTimeout> | undefined;

const MODIFIERS = ['Shift', 'Control', 'Alt', 'Meta'];
const PLAIN = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false };

function onBufferedKey(e: KeyboardEvent) {
	if (!keyQueue || !e.isTrusted) return;
	e.preventDefault();
	e.stopImmediatePropagation();
	if (MODIFIERS.includes(e.key)) return;
	const { key, shiftKey, altKey, ctrlKey, metaKey } = e;
	keyQueue.push({ key, shiftKey, altKey, ctrlKey, metaKey });
}

/** Texteingaben ohne keydown (Android-Tastaturen, Einfügen) ebenfalls puffern. */
function onBufferedInput(e: InputEvent) {
	if (!keyQueue) return;
	if (e.inputType.startsWith('insert') && e.data) {
		e.preventDefault();
		for (const ch of e.data) keyQueue.push({ key: ch, ...PLAIN });
	} else if (e.inputType === 'deleteContentBackward') {
		e.preventDefault();
		keyQueue.push({ key: 'Backspace', ...PLAIN });
	}
}

function stopKeyBuffer() {
	keyQueue = null;
	clearTimeout(keyTimer);
	window.removeEventListener('keydown', onBufferedKey, true);
	window.removeEventListener('beforeinput', onBufferedInput, true);
}

/** Ab jetzt alle Eingaben sammeln, bis eine Zeile per `replayKeys` den Fokus übernimmt. */
export function beginKeyBuffer() {
	if (!keyQueue) {
		keyQueue = [];
		window.addEventListener('keydown', onBufferedKey, true);
		window.addEventListener('beforeinput', onBufferedInput, true);
	}
	clearTimeout(keyTimer);
	keyTimer = setTimeout(stopKeyBuffer, 4000);
}

const CARET_MOVES: Record<string, (start: number, end: number, len: number) => number> = {
	ArrowLeft: (s, e) => (e > s ? s : Math.max(0, s - 1)),
	ArrowRight: (s, e, len) => (e > s ? e : Math.min(len, e + 1)),
	Home: () => 0,
	End: (_s, _e, len) => len
};

export function replayKeys(input: HTMLInputElement) {
	const queued = keyQueue;
	stopKeyBuffer();
	if (!queued?.length) return;
	for (let i = 0; i < queued.length; i++) {
		// Eine abgespielte Taste (z. B. Enter) hat einen neuen Puffer begonnen → Rest dorthin.
		if (keyQueue) {
			(keyQueue as KeyInit[]).push(...queued.slice(i));
			return;
		}
		const k = queued[i];
		const start = input.selectionStart ?? input.value.length;
		const end = input.selectionEnd ?? start;
		if (k.key.length === 1 && !k.ctrlKey && !k.metaKey) {
			input.setRangeText(k.key, start, end, 'end');
			input.dispatchEvent(new Event('input', { bubbles: true }));
		} else if (k.key === 'Backspace' && (start > 0 || end > start)) {
			input.setRangeText('', end > start ? start : start - 1, end, 'end');
			input.dispatchEvent(new Event('input', { bubbles: true }));
		} else if (k.key === 'Delete' && end < input.value.length) {
			input.setRangeText('', start, end > start ? end : end + 1, 'start');
			input.dispatchEvent(new Event('input', { bubbles: true }));
		} else if (CARET_MOVES[k.key]) {
			// Synthetische Pfeiltasten bewegen den Cursor nicht – also selbst setzen.
			const pos = CARET_MOVES[k.key](start, end, input.value.length);
			input.setSelectionRange(pos, pos);
		} else {
			input.dispatchEvent(new KeyboardEvent('keydown', { ...k, bubbles: true, cancelable: true }));
		}
	}
}
