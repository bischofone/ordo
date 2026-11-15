/** Farbschema pro Gerät (localStorage). Wird in app.html schon vor dem ersten Rendern gesetzt. */
export type Theme = 'system' | 'light' | 'dark';

export function getTheme(): Theme {
	try {
		const t = localStorage.getItem('theme');
		return t === 'light' || t === 'dark' ? t : 'system';
	} catch {
		return 'system';
	}
}

export function setTheme(theme: Theme) {
	try {
		if (theme === 'system') localStorage.removeItem('theme');
		else localStorage.setItem('theme', theme);
	} catch {
		/* privater Modus o. ä. – dann eben nur für diese Sitzung */
	}
	if (theme === 'system') delete document.documentElement.dataset.theme;
	else document.documentElement.dataset.theme = theme;
}
