/**
 * Hält den Wert eines Eingabefelds mit der Datenbank synchron – aber nur, solange es nicht
 * fokussiert ist. Sonst könnten verspätete Zwischenstände aus der DB das Getippte überschreiben.
 * Beim Verlassen des Felds wird der letzte DB-Stand übernommen.
 */
export function syncValue(node: HTMLInputElement | HTMLTextAreaElement, value: string) {
	let latest = value;
	const apply = () => {
		if (document.activeElement !== node && node.value !== latest) node.value = latest;
	};
	node.value = value;
	node.addEventListener('blur', apply);
	return {
		update(v: string) {
			latest = v;
			apply();
		},
		destroy() {
			node.removeEventListener('blur', apply);
		}
	};
}
