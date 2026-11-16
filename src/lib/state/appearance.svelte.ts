/**
 * Darstellung pro Gerät (localStorage): Farbschema, Akzentfarbe, Dichte, Schriftgröße,
 * farbige Gruppen. Wird in app.html schon vor dem ersten Rendern angewendet
 * (dort steht dieselbe Logik in Kurzform – beim Ändern beide Stellen anpassen).
 */
export type Theme = 'system' | 'light' | 'dark';
export type Density = 'compact' | 'normal' | 'cozy';
export type FontSize = 'small' | 'normal' | 'large';

export interface Appearance {
	theme: Theme;
	/** Eigene Akzentfarbe (#rrggbb) oder null = Standard des Farbschemas */
	accent: string | null;
	density: Density;
	fontSize: FontSize;
	/** Gruppen (Pools/Projekte) in ihrer Farbe tönen */
	tintGroups: boolean;
	/** Klick auf eine Aufgabe öffnet ihre Details */
	openDetailOnClick: boolean;
}

export const DEFAULT_APPEARANCE: Appearance = {
	theme: 'system',
	accent: null,
	density: 'normal',
	fontSize: 'normal',
	tintGroups: true,
	openDetailOnClick: true
};

const KEY = 'appearance';

function load(): Appearance {
	try {
		const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}');
		// Früher wurde nur das Farbschema unter „theme“ gespeichert.
		const legacy = localStorage.getItem('theme');
		return {
			...DEFAULT_APPEARANCE,
			...(legacy === 'light' || legacy === 'dark' ? { theme: legacy } : {}),
			...stored
		};
	} catch {
		return { ...DEFAULT_APPEARANCE };
	}
}

/** Schwarz oder Weiß – je nachdem, was auf der Farbe besser lesbar ist. */
export function contrastOn(hex: string): string {
	const n = parseInt(hex.slice(1), 16);
	const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
		const v = c / 255;
		return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#111111' : '#ffffff';
}

export function applyAppearance(a: Appearance) {
	const root = document.documentElement;
	if (a.theme === 'system') delete root.dataset.theme;
	else root.dataset.theme = a.theme;
	root.dataset.density = a.density;
	root.dataset.font = a.fontSize;
	root.dataset.tint = a.tintGroups ? 'on' : 'off';
	if (a.accent && /^#[0-9a-f]{6}$/i.test(a.accent)) {
		root.style.setProperty('--accent', a.accent);
		root.style.setProperty('--accent-contrast', contrastOn(a.accent));
	} else {
		root.style.removeProperty('--accent');
		root.style.removeProperty('--accent-contrast');
	}
}

class AppearanceState {
	current = $state<Appearance>(typeof localStorage === 'undefined' ? DEFAULT_APPEARANCE : load());

	set(patch: Partial<Appearance>) {
		this.current = { ...this.current, ...patch };
		try {
			localStorage.setItem(KEY, JSON.stringify(this.current));
			localStorage.removeItem('theme');
		} catch {
			/* privater Modus o. ä. – dann eben nur für diese Sitzung */
		}
		applyAppearance(this.current);
	}

	reset() {
		this.set({ ...DEFAULT_APPEARANCE });
	}
}

export const appearance = new AppearanceState();
