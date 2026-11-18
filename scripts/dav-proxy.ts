/**
 * Weiterleitung für CalDAV-Server ohne CORS (z. B. Nextcloud) – für den Vite-Server
 * (`pnpm dev` und `pnpm preview`). Im Betrieb macht das Caddy (docker/Caddyfile, install/).
 *
 *   /ext/cloud.example.com/remote.php/dav/…  →  https://cloud.example.com/remote.php/dav/…
 *
 * Nur https. Optional nur bestimmte Server: ORDO_PROXY_HOSTS=cloud.example.com,andere.de
 * Die Kopfzeile „WWW-Authenticate“ wird entfernt, damit der Browser bei falschem Passwort
 * kein eigenes Anmeldefenster öffnet – Ordo zeigt dann seine eigene Meldung.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

const FORWARD = [
	'authorization',
	'content-type',
	'depth',
	'if-match',
	'if-none-match',
	'prefer',
	'accept'
];
const DROP = [
	'www-authenticate',
	'content-encoding',
	'content-length',
	'transfer-encoding',
	'connection',
	'set-cookie'
];

export function davProxy(): Plugin {
	const allowed = (process.env.ORDO_PROXY_HOSTS ?? '')
		.split(',')
		.map((h) => h.trim().toLowerCase())
		.filter(Boolean);

	async function handle(req: IncomingMessage, res: ServerResponse) {
		// req.url ist hier ohne das „/ext“-Präfix: „/cloud.example.com/remote.php/dav/…“
		const m = /^\/([a-z0-9.-]+(?::\d+)?)(\/.*)?$/i.exec(req.url ?? '');
		if (!m || (allowed.length && !allowed.includes(m[1].toLowerCase()))) {
			res.statusCode = 403;
			res.end('Weiterleitung zu diesem Server nicht erlaubt');
			return;
		}
		const headers: Record<string, string> = {};
		for (const k of FORWARD) {
			const v = req.headers[k];
			if (typeof v === 'string') headers[k] = v;
		}
		const chunks: Buffer[] = [];
		for await (const c of req) chunks.push(c as Buffer);
		try {
			const upstream = await fetch(`https://${m[1]}${m[2] ?? '/'}`, {
				method: req.method,
				headers,
				body: chunks.length ? Buffer.concat(chunks) : undefined,
				redirect: 'manual'
			});
			res.statusCode = upstream.status;
			upstream.headers.forEach((v, k) => {
				if (!DROP.includes(k)) res.setHeader(k, v);
			});
			res.end(Buffer.from(await upstream.arrayBuffer()));
		} catch (e) {
			res.statusCode = 502;
			res.end(`Server nicht erreichbar: ${(e as Error).message}`);
		}
	}

	return {
		name: 'ordo-dav-proxy',
		configureServer(server) {
			server.middlewares.use('/ext', (req, res) => void handle(req, res));
		},
		configurePreviewServer(server) {
			server.middlewares.use('/ext', (req, res) => void handle(req, res));
		}
	};
}
