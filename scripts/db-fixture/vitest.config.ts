// Nur für scripts/db-fixture.sh: führt den Erzeuger aus, nicht die normalen Tests.
import { defineConfig } from 'vitest/config';
export default defineConfig({
	test: {
		environment: 'node',
		include: ['**/db-fixture/generate.test.ts', '**/db-fixture/ics.test.ts'],
		expect: { requireAssertions: true }
	}
});
