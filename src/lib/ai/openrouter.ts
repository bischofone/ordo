/**
 * Schlanker Client für OpenRouter (https://openrouter.ai) – eine Schnittstelle für viele Modelle.
 * Die HTTP-Schicht (`fetch`) ist austauschbar, damit Tests ohne Netz und ohne Kosten laufen.
 *
 * Datenschutz: Standardmäßig nur Anbieter, die Eingaben weder speichern noch zum Training
 * verwenden (`data_collection: 'deny'`), und nur solche, die strukturierte Antworten können.
 */

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1';

export interface ChatMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

/** JSON-Schema, das die Antwort einhalten muss */
export interface ResponseSchema {
	name: string;
	schema: Record<string, unknown>;
}

export interface ChatRequest {
	/** Modelle in Reihenfolge: das erste, bei Ausfall das nächste */
	models: string[];
	messages: ChatMessage[];
	schema?: ResponseSchema;
	maxTokens?: number;
	temperature?: number;
	/** Nur Anbieter ohne Datenspeicherung (Standard: ja) */
	privateOnly?: boolean;
}

export interface ChatResult {
	content: string;
	/** Tatsächlich benutztes Modell */
	model: string;
	/** Kosten in US-Dollar (laut OpenRouter) */
	cost: number;
	tokens: { prompt: number; completion: number };
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** Fehler mit verständlicher Meldung für die Oberfläche */
export class AiError extends Error {
	constructor(
		message: string,
		readonly kind:
			'key' | 'credits' | 'busy' | 'network' | 'answer' | 'limit' | 'disabled' | 'other'
	) {
		super(message);
	}
}

function errorFor(status: number, detail: string) {
	if (status === 401) return new AiError('Der API-Schlüssel ist ungültig.', 'key');
	if (status === 402)
		return new AiError('Das OpenRouter-Guthaben ist aufgebraucht oder zu niedrig.', 'credits');
	if (status === 429)
		return new AiError('Das Modell ist gerade überlastet. Bitte gleich nochmal versuchen.', 'busy');
	if (status === 404)
		return new AiError(
			'Für dieses Modell gibt es gerade keinen passenden Anbieter (z. B. ohne Datenspeicherung).',
			'other'
		);
	return new AiError(`OpenRouter meldet einen Fehler (${status}). ${detail}`.trim(), 'other');
}

export function createOpenRouter(opts: { apiKey: string; fetch?: FetchLike; title?: string }) {
	const doFetch: FetchLike = opts.fetch ?? ((url, init) => fetch(url, init));
	const headers = {
		Authorization: `Bearer ${opts.apiKey}`,
		'Content-Type': 'application/json',
		// Damit OpenRouter die Aufrufe „Ordo“ zuordnet (Spalte „App“ im Log)
		'HTTP-Referer': 'https://github.com/bischofone/ordo',
		'X-Title': opts.title ?? 'Ordo'
	};

	async function request(path: string, init: RequestInit) {
		let res: Response;
		try {
			res = await doFetch(`${OPENROUTER_URL}${path}`, { ...init, headers });
		} catch {
			throw new AiError(
				'OpenRouter ist nicht erreichbar. Besteht eine Internetverbindung?',
				'network'
			);
		}
		const body = await res.json().catch(() => ({}));
		if (!res.ok) {
			const detail = String(body?.error?.message ?? '').slice(0, 160);
			throw errorFor(res.status, detail);
		}
		return body;
	}

	return {
		async chat(req: ChatRequest): Promise<ChatResult> {
			const [model, ...fallback] = req.models;
			const body: Record<string, unknown> = {
				model,
				messages: req.messages,
				max_tokens: req.maxTokens ?? 1500,
				temperature: req.temperature ?? 0.4,
				usage: { include: true },
				// Denk-Modelle knapp halten – spart Zeit und Geld
				reasoning: { effort: 'low', exclude: true },
				provider: {
					...(req.privateOnly === false ? {} : { data_collection: 'deny' }),
					require_parameters: !!req.schema,
					sort: 'price'
				}
			};
			if (fallback.length) body.models = req.models;
			if (req.schema) {
				body.response_format = {
					type: 'json_schema',
					json_schema: { name: req.schema.name, strict: true, schema: req.schema.schema }
				};
			}
			const json = await request('/chat/completions', {
				method: 'POST',
				body: JSON.stringify(body)
			});
			if (json.error) throw errorFor(Number(json.error.code) || 500, json.error.message ?? '');
			const content = json.choices?.[0]?.message?.content;
			if (typeof content !== 'string' || !content.trim())
				throw new AiError('Das Modell hat keine Antwort geliefert.', 'answer');
			return {
				content,
				model: json.model ?? model,
				cost: Number(json.usage?.cost) || 0,
				tokens: {
					prompt: Number(json.usage?.prompt_tokens) || 0,
					completion: Number(json.usage?.completion_tokens) || 0
				}
			};
		},

		/** Schlüssel prüfen und Guthaben abfragen (kostet nichts) */
		async keyInfo(): Promise<{ label: string; usage: number; limit: number | null }> {
			const json = await request('/key', { method: 'GET' });
			const d = json.data ?? {};
			return {
				label: String(d.label ?? ''),
				usage: Number(d.usage) || 0,
				limit: d.limit == null ? null : Number(d.limit)
			};
		}
	};
}

export type OpenRouter = ReturnType<typeof createOpenRouter>;

/** JSON aus einer Antwort lesen – auch wenn ein Modell ihn in ```-Blöcke oder Text einbettet */
export function parseJson<T>(text: string): T {
	const start = text.indexOf('{');
	const end = text.lastIndexOf('}');
	if (start < 0 || end < start) throw new AiError('Die Antwort war kein gültiges JSON.', 'answer');
	try {
		return JSON.parse(text.slice(start, end + 1)) as T;
	} catch {
		throw new AiError('Die Antwort war kein gültiges JSON.', 'answer');
	}
}
