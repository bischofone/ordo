import { defineConfig, devices } from '@playwright/test';

// Zeiten in den Tests (z. B. new Date('2026-11-17T08:50:00')) meinen deutsche Ortszeit –
// auch auf Servern, die in UTC laufen (GitHub Actions). Gilt für alle Test-Prozesse.
process.env.TZ = 'Europe/Berlin';

export default defineConfig({
	testDir: 'e2e',
	testMatch: '**/*.e2e.ts',
	fullyParallel: true,
	retries: 0,
	webServer: [
		{ command: 'pnpm build && pnpm serve', port: 4173 },
		// Frischer Radicale für die Sync-Tests (leerer Datenordner bei jedem Lauf)
		{ command: 'bash -c \'scripts/radicale.sh 5390 "$(mktemp -d)"\'', port: 5390 }
	],
	use: {
		baseURL: 'http://localhost:4173',
		locale: 'de-DE',
		timezoneId: 'Europe/Berlin',
		trace: 'retain-on-failure'
	},
	projects: [
		{ name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile/ },
		{ name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile.*\.e2e\.ts/ }
	]
});
