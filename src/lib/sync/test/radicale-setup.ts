/**
 * Vitest-globalSetup: startet für die Integrationstests einen frischen Radicale-Server
 * (scripts/radicale.sh) auf einem freien Port mit leerem Datenordner.
 * Fehlt Python, werden die CalDAV-Integrationstests übersprungen.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { TestProject } from 'vitest/node';

let proc: ChildProcess | undefined;
let dir: string | undefined;

export default async function setup(project: TestProject) {
	const port = 5300 + Math.floor(Math.random() * 500);
	dir = mkdtempSync(join(tmpdir(), 'radicale-test-'));
	const script = resolve(import.meta.dirname, '../../../../scripts/radicale.sh');
	proc = spawn(script, [String(port), dir], { stdio: 'ignore' });

	const url = `http://127.0.0.1:${port}/`;
	for (let i = 0; i < 100; i++) {
		try {
			await fetch(url);
			project.provide('radicaleUrl', url);
			return teardown;
		} catch {
			await new Promise((r) => setTimeout(r, 100));
		}
	}
	console.warn('Radicale ließ sich nicht starten – CalDAV-Integrationstests werden übersprungen.');
	project.provide('radicaleUrl', '');
	return teardown;
}

function teardown() {
	proc?.kill();
	if (dir) rmSync(dir, { recursive: true, force: true });
}

declare module 'vitest' {
	export interface ProvidedContext {
		radicaleUrl: string;
	}
}
