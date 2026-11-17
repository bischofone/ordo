/** Nur für `pnpm screenshots`: fotografiert die App für die Doku (siehe scripts/screenshots.e2e.ts). */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: 'scripts',
	testMatch: 'screenshots.e2e.ts',
	webServer: { command: 'pnpm build && pnpm serve', port: 4173, reuseExistingServer: true },
	use: {
		baseURL: 'http://localhost:4173',
		locale: 'de-DE',
		timezoneId: 'Europe/Berlin',
		colorScheme: 'dark'
	},
	projects: [
		{
			name: 'desktop',
			use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } }
		},
		{ name: 'mobile', use: { ...devices['Pixel 7'] } }
	]
});
