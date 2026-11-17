import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';

// Tests rechnen mit deutscher Ortszeit – auch auf Servern, die in UTC laufen (z. B. GitHub Actions).
if (process.env.VITEST) process.env.TZ = 'Europe/Berlin';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Reine Client-App (SPA): eine index.html für PWA, Capacitor und Tauri.
			adapter: adapter({ fallback: 'index.html' })
		})
	],
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
