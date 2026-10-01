// Node golden runner: pure formatter/slicer/color-map pins, no browser.
// Browser DOM behavior stays in tests/run-tab-block.mjs.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const tsx = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const dir = path.join(root, 'tests', 'goldens');
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.test.ts'))
  .sort()
  .map((f) => path.join(dir, f));

if (files.length === 0) {
  console.error('No golden tests found in tests/goldens/');
  process.exit(1);
}

const r = spawnSync(process.execPath, [tsx, '--test', ...files], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});
process.exit(r.status ?? 1);
