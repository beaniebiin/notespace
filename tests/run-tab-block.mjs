import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { load } from 'cheerio';

const root = fileURLToPath(new URL('../', import.meta.url));
const browser = process.argv[2] || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
assert(process.argv.length <= 3, 'Usage: node tests/run-tab-block.mjs [browser-executable]');
const temp = await mkdtemp(path.join(os.tmpdir(), 'notespace-tab-tests-'));

try {
  const css = await readFile(path.join(root, 'index.css'), 'utf8');
  const marker = css.indexOf('/* Tiptap React는');
  assert(marker >= 0, 'Missing real NodeViewContent CSS marker in index.css');
  const panelCss = css.slice(marker);
  assert(panelCss.includes('[data-node-view-content-react]'), 'Missing contentDOM wrapper CSS');
  await build({
    absWorkingDir: root,
    entryPoints: [path.join(root, 'tests/tab-block.browser.tsx')],
    outfile: path.join(temp, 'fixture.js'),
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'chrome120',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"development"' },
    logLevel: 'warning',
  });
  const html = path.join(temp, 'fixture.html');
  await writeFile(html, `<!doctype html>
<html><head><meta charset="utf-8"><title>TabBlock regressions</title>
<style>${panelCss}</style></head><body>
<input id="outside" aria-label="Fixture outside input">
<div id="mount"></div><pre id="result">{"status":"pending"}</pre>
<script src="fixture.js"></script></body></html>`);

  const child = spawnSync(browser, [
    '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--allow-file-access-from-files', `--user-data-dir=${path.join(temp, 'profile')}`,
    '--virtual-time-budget=8000', '--dump-dom', pathToFileURL(html).href,
  ], { encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  if (child.error) throw new Error(`Browser launch failed: ${child.error.message}`, { cause: child.error });
  assert.equal(child.status, 0, `Browser exited ${child.status} (${child.signal}):\n${child.stderr}`);
  const text = load(child.stdout)('pre#result').text();
  assert(text, `Browser did not return pre#result. stderr:\n${child.stderr}`);
  const report = JSON.parse(text);
  console.log(JSON.stringify(report, null, 2));
  assert.equal(report.status, 'complete', 'Fixture did not finish within the virtual-time budget');
  assert(report.total > 0, 'No regression cases registered');
  assert.equal(report.results.length, report.total, 'Not every regression case completed');
  assert.deepEqual(report.errors, [], 'Browser runtime/console errors occurred');
  assert.deepEqual(report.results.filter(test => test.status !== 'passed'), [], 'TabBlock regressions failed');
} finally {
  // Edge can briefly retain profile locks after --dump-dom exits on Windows.
  await rm(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
