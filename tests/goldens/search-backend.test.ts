// Backend note-search regression test: content matches must be returned,
// not just title matches (api.php `search` branch, driven via PHP CLI).
// Skips gracefully when no PHP runtime is available.
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

function hasPhp(): boolean {
  if (!existsSync(path.join(root, 'api.php'))) return false;
  const r = spawnSync('php', ['-v'], { encoding: 'utf8' });
  return r.status === 0;
}

const QUERY = '마감일';

function makeSandbox(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'notespace-search-'));
  copyFileSync(path.join(root, 'api.php'), path.join(dir, 'api.php'));
  copyFileSync(path.join(root, 'tests', 'fixtures', 'search-harness.php'), path.join(dir, 'search-harness.php'));
  mkdirSync(path.join(dir, 'data', 'notes'), { recursive: true });
  writeFileSync(
    path.join(dir, 'data', 'hierarchy.json'),
    JSON.stringify([
      { id: 'n-title', name: '마감일 회의 일정', type: 'note' },
      { id: 'n-content', name: '무관한 제목의 메모', type: 'note' },
    ]),
    'utf8',
  );
  writeFileSync(path.join(dir, 'data', 'notes', 'n-title.md'), '다음 주 화요일에 만나서 논의합니다. 준비물은 없습니다.', 'utf8');
  writeFileSync(
    path.join(dir, 'data', 'notes', 'n-content.md'),
    '프로젝트 마감일은 금요일입니다. 결과 보고서를 제출하세요.',
    'utf8',
  );
  return dir;
}

function runSearch(dir: string): { results: any[]; stderr: string } {
  const r = spawnSync('php', [path.join(dir, 'search-harness.php'), QUERY], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, `harness exit status, stderr: ${r.stderr}`);
  const lines = r.stdout.trim().split('\n');
  return { results: JSON.parse(lines[lines.length - 1]), stderr: r.stderr };
}

describe('api.php search branch', () => {
  const php = hasPhp();
  before(() => {
    if (!php) console.log('skip: no PHP runtime available');
  });

  it('returns content-only matches, not just title matches', { skip: !php }, () => {
    const dir = makeSandbox();
    const { results, stderr } = runSearch(dir);
    assert.ok(!stderr.includes('preg_replace'), `sanitizer warnings in stderr: ${stderr}`);
    const ids = results.map((r: any) => r.id);
    assert.ok(ids.includes('n-title'), 'title match present');
    assert.ok(ids.includes('n-content'), 'content-only match present');
    const content = results.find((r: any) => r.id === 'n-content');
    assert.ok(content.snippet && content.snippet.length > 10, 'content match has a real snippet');
    assert.ok(content.snippet.includes('마감일'), 'snippet shows the match context');
  });

  it('survives a stale cache entry with null cleaned text', { skip: !php }, () => {
    const dir = makeSandbox();
    runSearch(dir); // populate search_cache.json with matching mtimes
    const cachePath = path.join(dir, 'data', 'search_cache.json');
    assert.ok(existsSync(cachePath), 'search cache written');
    const cache = JSON.parse(readFileSync(cachePath, 'utf8'));
    cache['n-content']['clean'] = null; // simulate entry cached while sanitizer was broken
    cache['n-content']['nospace'] = '';
    writeFileSync(cachePath, JSON.stringify(cache), 'utf8');
    const { results } = runSearch(dir);
    const ids = results.map((r: any) => r.id);
    assert.ok(ids.includes('n-content'), 'content match present despite poisoned cache entry');
  });
});
