import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { davProxy } from './scripts/dav-proxy.ts';

// Versionsangabe für die App: Nummer aus package.json, Stand aus Git (oder ORDO_COMMIT beim Bauen)
const pkgVersion: string = JSON.parse(readFileSync('package.json', 'utf8')).version;
function gitCommit() {
	if (process.env.ORDO_COMMIT) return process.env.ORDO_COMMIT.slice(0, 7);
	try {
		return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
			.toString()
			.trim();
	} catch {
		return '';
	}
}
const commit = gitCommit();

// Tests rechnen mit deutscher Ortszeit – auch auf Servern, die in UTC laufen (z. B. GitHub Actions).
if (process.env.VITEST) process.env.TZ = 'Europe/Berlin';

export default defineConfig({
	plugins: [
		// /ext/<host>/… → https://<host>/… (CalDAV-Server ohne CORS, z. B. Nextcloud)
		davProxy(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Reine Client-App (SPA): eine index.html für PWA, Capacitor und Tauri.
			adapter: adapter({ fallback: 'index.html' }),
			// Neue Version auf dem Server → Hinweis in der App (alle 15 Min. und beim Zurückkehren)
			version: {
				name: commit ? `${pkgVersion}-${commit}` : undefined,
				pollInterval: 15 * 60_000
			}
		})
	],
	define: {
		__ORDO_VERSION__: JSON.stringify(pkgVersion),
		__ORDO_COMMIT__: JSON.stringify(commit)
	},
	server: {
		// Wie auf dem Server (docker/Caddyfile): CalDAV unter /dav auf derselben Adresse →
		// kein CORS nötig. Lokalen Radicale starten mit: pnpm radicale
		proxy: {
			'/dav': {
				target: 'http://127.0.0.1:5232',
				rewrite: (path) => path.replace(/^\/dav/, ''),
				headers: { 'X-Script-Name': '/dav' }
			}
		}
	},
	test: {
		expect: { requireAssertions: true },
		environment: 'node',
		include: ['src/**/*.test.ts'],
		// Startet einen lokalen Radicale für die CalDAV-Integrationstests
		globalSetup: ['src/lib/sync/test/radicale-setup.ts']
	}
});
