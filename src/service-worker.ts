/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/**
 * Service Worker: hält die App-Dateien im Cache, damit die App offline startet.
 * Daten liegen ohnehin lokal in IndexedDB.
 */
import { version } from '$app/env';
import { assets, immutable } from '$app/manifest';
import { self } from '$app/service-worker';

const CACHE = `app-${version}`;
const SHELL = '/index.html';
const FILES = [...immutable.map((f) => f.path), ...assets.map((f) => f.path), SHELL];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(FILES))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (event) => {
	const req = event.request;
	if (req.method !== 'GET') return;
	const url = new URL(req.url);
	if (url.origin !== self.location.origin) return;

	// Seitenaufrufe: erst Netz (für Updates), offline die App-Hülle aus dem Cache.
	if (req.mode === 'navigate') {
		event.respondWith(
			fetch(req).catch(async () => (await caches.match(SHELL)) ?? Response.error())
		);
		return;
	}

	// Dateien: erst Cache, sonst Netz.
	event.respondWith(caches.match(req).then((cached) => cached ?? fetch(req)));
});
