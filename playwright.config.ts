import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: 'e2e',
	testMatch: '**/*.e2e.ts',
	fullyParallel: true,
	retries: 0,
	webServer: { command: 'pnpm build && pnpm serve', port: 4173 },
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
