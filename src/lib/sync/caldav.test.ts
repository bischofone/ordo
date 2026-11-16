import { describe, expect, inject, it } from 'vitest';
import { makeTask } from '#lib/domain/test-helpers.ts';
import { createClient, PreconditionFailed } from './caldav';
import { pickSyncFields } from './fields';
import { parseTodo, writeTodo } from './vtodo';

const serverUrl = inject('radicaleUrl');
const user = () => ({ serverUrl, username: 'test', password: 'test' });

describe.skipIf(!serverUrl)('CalDAV-Client gegen Radicale', () => {
	it('falsches Passwort wird erkannt', async () => {
		const c = createClient({ ...user(), password: 'falsch' });
		await expect(c.discover()).rejects.toThrow('401');
	});

	it('Liste anlegen, Aufgaben schreiben, lesen, ändern, löschen', async () => {
		const c = createClient(user());
		const { homeUrl } = await c.discover();
		const listUrl = await c.createList(homeUrl, 'Privat (Test)', '#46a758');

		const lists = await c.lists(homeUrl);
		const list = lists.find((l) => l.url === listUrl)!;
		expect(list).toMatchObject({ displayName: 'Privat (Test)', color: '#46a758' });
		expect(list.syncToken).toBeTruthy();

		// Anlegen
		const f = pickSyncFields(makeTask({ title: 'Hallo CalDAV', priority: 1 }));
		const url = `${listUrl}abc.ics`;
		const etag = await c.putItem(url, writeTodo('abc', f), { create: true });
		expect(etag).toBeTruthy();
		// Doppelt anlegen geht nicht
		await expect(c.putItem(url, writeTodo('abc', f), { create: true })).rejects.toBeInstanceOf(
			PreconditionFailed
		);

		// Änderungen seit dem Token
		const changes = await c.changesSince(listUrl, list.syncToken!);
		expect(changes.changed.map((i) => i.url)).toEqual([url]);
		expect(changes.token).not.toBe(list.syncToken);

		// Lesen
		const [item] = await c.fetchItems(listUrl, [url]);
		expect(parseTodo(item.ics).fields).toMatchObject({ title: 'Hallo CalDAV', priority: 1 });
		expect((await c.listItems(listUrl)).map((i) => i.etag)).toEqual([etag]);

		// Ändern mit falschem ETag schlägt fehl, mit richtigem klappt es
		const f2 = { ...f, title: 'Geändert' };
		await expect(
			c.putItem(url, writeTodo('abc', f2, { previous: item.ics }), { etag: '"falsch"' })
		).rejects.toBeInstanceOf(PreconditionFailed);
		const etag2 = await c.putItem(url, writeTodo('abc', f2, { previous: item.ics }), { etag });
		expect(etag2).not.toBe(etag);

		// Löschen erscheint als „gelöscht“ im Änderungsprotokoll
		await c.deleteItem(url, etag2);
		const after = await c.changesSince(listUrl, changes.token!);
		expect(after.deleted).toEqual([url]);
		await c.deleteItem(url); // 404 ist kein Fehler
	});

	it('Projekte und Name als Eigenschaften der Liste', async () => {
		const c = createClient(user());
		const { homeUrl } = await c.discover();
		const listUrl = await c.createList(homeUrl, 'Arbeit');
		const json = JSON.stringify([{ id: 'p1', name: 'Website <neu> & mehr' }]);
		await c.updateList(listUrl, { projects: json, displayName: 'Arbeit 2', color: '#e5484d' });
		const info = await c.listInfo(listUrl);
		expect(info).toMatchObject({ displayName: 'Arbeit 2', color: '#e5484d', projects: json });
	});

	it('ungültiger sync-token führt zum vollständigen Abgleich', async () => {
		const c = createClient(user());
		const { homeUrl } = await c.discover();
		const listUrl = await c.createList(homeUrl, 'Token');
		await expect(c.changesSince(listUrl, 'http://radicale.org/ns/sync/kaputt')).rejects.toThrow();
	});
});
