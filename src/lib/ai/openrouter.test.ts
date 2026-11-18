import { describe, expect, it } from 'vitest';
import { AiError, createOpenRouter, parseJson } from './openrouter';
import { readTree } from './features';

/** Gefälschtes fetch: merkt sich die Anfrage, liefert eine feste Antwort */
function fake(status: number, body: unknown) {
	const calls: { url: string; init: RequestInit }[] = [];
	const fetch = async (url: string, init: RequestInit) => {
		calls.push({ url, init });
		return new Response(JSON.stringify(body), { status });
	};
	return { calls, fetch };
}

const answer = (content: string) => ({
	model: 'z-ai/glm-5.3-flash',
	choices: [{ message: { content } }],
	usage: { cost: 0.00009, prompt_tokens: 100, completion_tokens: 400 }
});

describe('OpenRouter-Client', () => {
	it('schickt Modell, Ersatzmodell, Schema und Datenschutz-Vorgabe', async () => {
		const f = fake(200, answer('{"tasks":[]}'));
		const or = createOpenRouter({ apiKey: 'sk-test', fetch: f.fetch });
		const r = await or.chat({
			models: ['a/eins', 'b/zwei'],
			messages: [{ role: 'user', content: 'Hallo' }],
			schema: { name: 'x', schema: { type: 'object' } }
		});
		const body = JSON.parse(String(f.calls[0].init.body));
		const headers = f.calls[0].init.headers as Record<string, string>;
		expect(f.calls[0].url).toBe('https://openrouter.ai/api/v1/chat/completions');
		expect(headers.Authorization).toBe('Bearer sk-test');
		expect(headers['X-Title']).toBe('Ordo');
		expect(body.model).toBe('a/eins');
		expect(body.models).toEqual(['a/eins', 'b/zwei']);
		expect(body.provider.data_collection).toBe('deny');
		expect(body.provider.require_parameters).toBe(true);
		expect(body.response_format.json_schema.strict).toBe(true);
		expect(body.usage).toEqual({ include: true });
		expect(r.cost).toBe(0.00009);
		expect(r.model).toBe('z-ai/glm-5.3-flash');
	});

	it('ohne Datenschutz-Vorgabe, wenn ausgeschaltet', async () => {
		const f = fake(200, answer('ok'));
		await createOpenRouter({ apiKey: 'k', fetch: f.fetch }).chat({
			models: ['m'],
			messages: [],
			privateOnly: false
		});
		expect(JSON.parse(String(f.calls[0].init.body)).provider.data_collection).toBeUndefined();
	});

	it('verständliche Fehler', async () => {
		const cases: [number, AiError['kind']][] = [
			[401, 'key'],
			[402, 'credits'],
			[429, 'busy'],
			[500, 'other']
		];
		for (const [status, kind] of cases) {
			const or = createOpenRouter({
				apiKey: 'k',
				fetch: fake(status, { error: { message: 'x' } }).fetch
			});
			await expect(or.chat({ models: ['m'], messages: [] })).rejects.toMatchObject({ kind });
		}
		const offline = createOpenRouter({
			apiKey: 'k',
			fetch: async () => {
				throw new TypeError('Failed to fetch');
			}
		});
		await expect(offline.chat({ models: ['m'], messages: [] })).rejects.toMatchObject({
			kind: 'network'
		});
	});

	it('leere Antwort ist ein Fehler', async () => {
		const or = createOpenRouter({ apiKey: 'k', fetch: fake(200, answer('  ')).fetch });
		await expect(or.chat({ models: ['m'], messages: [] })).rejects.toMatchObject({
			kind: 'answer'
		});
	});
});

describe('Antworten lesen', () => {
	it('JSON auch mit Text oder Code-Block drumherum', () => {
		expect(parseJson('Hier: ```json\n{"a":1}\n```')).toEqual({ a: 1 });
		expect(() => parseJson('kein json')).toThrow(AiError);
	});

	it('Aufgabenbaum: säubert Titel, verwirft Leeres, begrenzt Tiefe', () => {
		const tree = readTree([
			{ title: '1. Kartons besorgen', children: [{ title: '- Supermarkt fragen', children: [] }] },
			{ title: '   ', children: [] },
			{ title: 'Termin', priority: 1, due: '2026-12-01', children: [] },
			{ title: 'Falsch', priority: 7, due: 'morgen' },
			{
				title: 'A',
				children: [{ title: 'B', children: [{ title: 'C', children: [{ title: 'D' }] }] }]
			}
		]);
		expect(tree.map((t) => t.title)).toEqual(['Kartons besorgen', 'Termin', 'Falsch', 'A']);
		expect(tree[0].children[0].title).toBe('Supermarkt fragen');
		expect(tree[1]).toMatchObject({ priority: 1, due: '2026-12-01' });
		expect(tree[2].priority).toBeUndefined();
		expect(tree[2].due).toBeUndefined();
		// höchstens drei Ebenen
		expect(tree[3].children[0].children[0].children).toEqual([]);
	});
});
