import { afterEach, expect, it, vi } from 'vitest';
import { uuid } from './id';

afterEach(() => vi.unstubAllGlobals());

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

it('liefert UUIDs – auch ohne crypto.randomUUID (http im WLAN)', () => {
	expect(uuid()).toMatch(V4);
	vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
	const ids = Array.from({ length: 50 }, uuid);
	for (const id of ids) expect(id).toMatch(V4);
	expect(new Set(ids).size).toBe(50);
});
