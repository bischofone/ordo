/**
 * Schnelleingabe-Parser. Bewusst klein und vorhersagbar:
 *   Datum:     heute, morgen, übermorgen, Wochentage (Montag…Sonntag), 15.12. / 15.12.2026
 *   Uhrzeit:   9:00 (optional gefolgt von „Uhr“)
 *   Priorität: !1 !2 !3
 *   Pool:      #arbeit (Groß-/Kleinschreibung egal, Anfang des Namens reicht)
 *   Projekt:   #umzug (Projektname) oder eindeutig #privat/umzug
 * Jede Art wird nur einmal erkannt (das erste Vorkommen). Alles andere bleibt Titel.
 * Erkannte Teile kommen als Tokens zurück und werden in der UI als Chips angezeigt.
 */
import { addDays, getDay } from 'date-fns';
import { toIsoDate } from './dates';
import type { DateValue, Priority } from './types';

export type TokenKind = 'date' | 'time' | 'priority' | 'pool';

export interface Token {
	kind: TokenKind;
	start: number;
	end: number;
	raw: string;
	/** Stabiler Schlüssel, um einen Chip „abzuwählen“ (dann bleibt der Text im Titel). */
	key: string;
	error?: string;
}

export interface PoolRef {
	id: string;
	name: string;
}

export interface ProjectRef {
	id: string;
	name: string;
	poolId: string;
}

export interface ParseContext {
	now: Date;
	pools: PoolRef[];
	projects?: ProjectRef[];
	/** Token-Schlüssel, die der Nutzer per Chip entfernt hat → werden als normaler Text behandelt. */
	ignored?: readonly string[];
}

export interface ParseResult {
	title: string;
	tokens: Token[];
	due?: DateValue;
	priority?: Priority;
	poolId?: string;
	projectId?: string;
}

const WEEKDAYS = ['sonntag', 'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag'];
const RELATIVE: Record<string, number> = { heute: 0, morgen: 1, übermorgen: 2, uebermorgen: 2 };

export const normalizePoolName = (s: string) => s.toLocaleLowerCase('de').replace(/\s+/g, '');

export function matchPool(query: string, pools: PoolRef[]): PoolRef | undefined {
	const q = normalizePoolName(query);
	if (!q) return undefined;
	return (
		pools.find((p) => normalizePoolName(p.name) === q) ??
		pools.find((p) => normalizePoolName(p.name).startsWith(q))
	);
}

export interface Target {
	poolId: string;
	projectId?: string;
}

/**
 * `#…` auflösen. Reihenfolge: Pool exakt, Projekt exakt, Pool-Anfang, Projekt-Anfang.
 * Mit Schrägstrich (`privat/umzug`) wird das Projekt nur im genannten Pool gesucht.
 */
export function matchTarget(query: string, pools: PoolRef[], projects: ProjectRef[] = []) {
	const slash = query.indexOf('/');
	if (slash >= 0) {
		const pool = matchPool(query.slice(0, slash), pools);
		if (!pool) return undefined;
		const rest = query.slice(slash + 1);
		if (!rest) return { poolId: pool.id };
		const project = matchPool(
			rest,
			projects.filter((p) => p.poolId === pool.id)
		) as ProjectRef | undefined;
		return project ? { poolId: pool.id, projectId: project.id } : undefined;
	}
	const q = normalizePoolName(query);
	if (!q) return undefined;
	const exact = <T extends PoolRef>(list: T[]) => list.find((p) => normalizePoolName(p.name) === q);
	const prefix = <T extends PoolRef>(list: T[]) =>
		list.find((p) => normalizePoolName(p.name).startsWith(q));
	const pool = exact(pools);
	if (pool) return { poolId: pool.id };
	const project = exact(projects);
	if (project) return { poolId: project.poolId, projectId: project.id };
	const poolPrefix = prefix(pools);
	if (poolPrefix) return { poolId: poolPrefix.id };
	const projectPrefix = prefix(projects);
	if (projectPrefix) return { poolId: projectPrefix.poolId, projectId: projectPrefix.id };
	return undefined;
}

function parseDateWord(word: string, now: Date): string | undefined {
	const w = word.toLocaleLowerCase('de');
	if (w in RELATIVE) return toIsoDate(addDays(now, RELATIVE[w]));

	const wd = WEEKDAYS.indexOf(w);
	if (wd >= 0) {
		const diff = (wd - getDay(now) + 7) % 7;
		return toIsoDate(addDays(now, diff));
	}

	const m = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})?$/.exec(word);
	if (m) {
		const day = Number(m[1]);
		const month = Number(m[2]);
		let year = m[3] ? Number(m[3]) : now.getFullYear();
		if (m[3] && m[3].length === 2) year += 2000;
		const d = new Date(year, month - 1, day);
		if (d.getMonth() !== month - 1 || d.getDate() !== day) return undefined; // z. B. 31.02.
		if (!m[3]) {
			// Ohne Jahr: liegt das Datum bereits hinter uns, ist das nächste Jahr gemeint.
			const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
			if (d < today) d.setFullYear(year + 1);
		}
		return toIsoDate(d);
	}
	return undefined;
}

function parseTime(word: string): string | undefined {
	const m = /^(\d{1,2}):(\d{2})$/.exec(word);
	if (!m) return undefined;
	const h = Number(m[1]);
	const min = Number(m[2]);
	if (h > 23 || min > 59) return undefined;
	return `${String(h).padStart(2, '0')}:${m[2]}`;
}

const TRAILING_PUNCT = /[,;!?]+$/;

export function parseQuickAdd(input: string, ctx: ParseContext): ParseResult {
	const ignored = new Set(ctx.ignored ?? []);
	const tokens: Token[] = [];
	const result: ParseResult = { title: '', tokens };
	let date: string | undefined;
	let time: string | undefined;

	const words = [...input.matchAll(/\S+/g)].map((m) => ({ text: m[0], start: m.index }));

	for (let i = 0; i < words.length; i++) {
		const { text, start } = words[i];
		const has = (k: TokenKind) => tokens.some((t) => t.kind === k);
		const push = (kind: TokenKind, raw: string, end: number, error?: string) => {
			const key = `${kind}:${raw.toLocaleLowerCase('de')}`;
			if (ignored.has(key)) return false;
			tokens.push({ kind, start, end, raw, key, error });
			return true;
		};

		// Priorität
		const prio = /^!([1-3])$/.exec(text);
		if (prio && !has('priority')) {
			if (push('priority', text, start + text.length))
				result.priority = Number(prio[1]) as Priority;
			continue;
		}

		// Pool
		if (text.startsWith('#') && text.length > 1 && !has('pool')) {
			const name = text.slice(1).replace(TRAILING_PUNCT, '');
			const raw = '#' + name;
			const target = matchTarget(name, ctx.pools, ctx.projects);
			if (push('pool', raw, start + raw.length, target ? undefined : 'Unbekannter Pool')) {
				if (target) {
					result.poolId = target.poolId;
					result.projectId = target.projectId;
				}
			}
			continue;
		}

		const bare = text.replace(TRAILING_PUNCT, '');

		// Datum
		if (!has('date')) {
			const d = parseDateWord(bare, ctx.now);
			if (d && push('date', bare, start + bare.length)) {
				date = d;
				continue;
			}
		}

		// Uhrzeit (optional „Uhr“ dahinter)
		if (!has('time')) {
			const t = parseTime(bare);
			if (t) {
				const next = words[i + 1];
				const withUhr =
					bare === text && next && next.text.replace(TRAILING_PUNCT, '').toLowerCase() === 'uhr';
				const end = withUhr
					? next.start + next.text.replace(TRAILING_PUNCT, '').length
					: start + bare.length;
				const raw = input.slice(start, end);
				if (push('time', raw, end)) {
					time = t;
					if (withUhr) i++;
					continue;
				}
			}
		}
	}

	if (date || time) {
		if (!date) {
			// Nur Uhrzeit: heute, falls noch nicht vorbei, sonst morgen.
			const [h, m] = time!.split(':').map(Number);
			const candidate = new Date(ctx.now);
			candidate.setHours(h, m, 0, 0);
			date = toIsoDate(candidate > ctx.now ? candidate : addDays(candidate, 1));
		}
		result.due = time ? { date, time } : { date };
	}

	// Titel = Eingabe ohne erkannte Teile
	let title = '';
	let pos = 0;
	for (const t of [...tokens].sort((a, b) => a.start - b.start)) {
		title += input.slice(pos, t.start);
		pos = t.end;
	}
	title += input.slice(pos);
	result.title = title.replace(/\s+/g, ' ').trim();
	return result;
}
