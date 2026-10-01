import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOrganizePrompt,
  announceOrganizePill,
  requestAi,
} from '../../services/aiOrchestrator';

describe('organize.md Slice 1 prompt contract', () => {
  const scope = { title: '민법 총칙', level: 2 as const, lineCount: 42 };

  it('carries scope, body and extra instruction', () => {
    const p = buildOrganizePrompt(scope, '행위능력 개요 본문', '판례 위주로');
    assert.match(p, /민법 총칙/);
    assert.match(p, /행위능력 개요 본문/);
    assert.match(p, /판례 위주로/);
  });

  it('omits the extra-instruction line when empty', () => {
    const p = buildOrganizePrompt(scope, '본문', '   ');
    assert.doesNotMatch(p, /추가 지시/);
  });

  it('owns all five organize.md constraints', () => {
    const p = buildOrganizePrompt(scope, '본문', '');
    for (const k of ['한국어', '원문', '창작', '<mark>', '제목 줄은 유지']) {
      assert.match(p, new RegExp(k.replace(/[<>]/g, (c) => `\\${c}`)), `missing: ${k}`);
    }
  });
});

describe('organize.md Slice 1 pills', () => {
  it('announces scope as H-level + title + line count', () => {
    assert.strictEqual(
      announceOrganizePill({ title: '민법 총칙', level: 2, lineCount: 42 }).message,
      "H2 '민법 총칙' · 42줄 정리"
    );
  });
});

describe('organize.md Slice 1 failure rule', () => {
  it('does not run on missing scope or blank body', async () => {
    for (const req of [
      { kind: '정리' as const, sectionBody: '본문' },
      { kind: '정리' as const, scope: { title: 'x', level: 1 as const, lineCount: 3 }, sectionBody: '   ' },
    ]) {
      const o = await requestAi(req);
      assert.strictEqual(o.status, 'not_run');
      assert.match(o.pill.message, /비어/);
    }
  });
});
