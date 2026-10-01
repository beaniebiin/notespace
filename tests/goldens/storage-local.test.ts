import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanMarkdown, tokenizeQuery, searchNotesInMemory } from '../../services/clientSearchEngine';
import { FileSystemNode } from '../../types';
import JSZip from 'jszip';

describe('clientSearchEngine', () => {
  it('cleans markdown tags, links and HTML correctly', () => {
    const raw = '# 제목\n\n![이미지](https://example.com/a.png)\n본문 [링크텍스트](https://url.com) **강조** <div>HTML태그</div>';
    const { clean, nospace } = cleanMarkdown(raw);
    assert.ok(!clean.includes('!['), 'images should be removed');
    assert.ok(clean.includes('링크텍스트'), 'link text should be preserved');
    assert.ok(!clean.includes('<div>'), 'html tags should be removed');
    assert.strictEqual(nospace, clean.replace(/\s+/g, ''));
  });

  it('tokenizes query and handles Korean particles', () => {
    const { tokenGroups, noSpaceQuery } = tokenizeQuery('처분을 취소소송에서');
    assert.strictEqual(noSpaceQuery, '처분을취소소송에서');
    assert.strictEqual(tokenGroups.length, 2);

    const token1 = tokenGroups.find((t) => t.raw === '처분을');
    assert.ok(token1, 'first token found');
    assert.strictEqual(token1.stem, '처분');

    const token2 = tokenGroups.find((t) => t.raw === '취소소송에서');
    assert.ok(token2, 'second token found');
    assert.strictEqual(token2.stem, '취소소송');
  });

  it('matches notes in memory with high-speed scoring and snippets', () => {
    const tree: FileSystemNode[] = [
      { id: 'note-1', name: '행정법 총론', type: 'note', lastModified: Date.now() },
      { id: 'note-2', name: '민법 계약총론', type: 'note', lastModified: Date.now() },
    ];

    const noteContents = new Map<string, string>();
    noteContents.set('note-1', '행정청의 위법한 처분을 취소하기 위해 제기하는 소송이다.');
    noteContents.set('note-2', '계약의 해제와 해지에 관한 일반 규정이다.');

    const results = searchNotesInMemory('처분', tree, noteContents);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].id, 'note-1');
    assert.ok(results[0].snippet.includes('처분을'));
  });

  it('matches phrase ignoring spaces (nospace matching)', () => {
    const tree: FileSystemNode[] = [
      { id: 'note-3', name: '당사자 소송', type: 'note', lastModified: Date.now() },
    ];
    const noteContents = new Map<string, string>();
    noteContents.set('note-3', '원고의 당사자 적격 여부를 심리한다.');

    // Search without space
    const results = searchNotesInMemory('당사자적격', tree, noteContents);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].id, 'note-3');
  });
});

describe('workspace ZIP export and import', () => {
  it('creates and extracts zip archive properly with JSZip', async () => {
    const zip = new JSZip();
    zip.file('hierarchy.json', JSON.stringify([{ id: 'n1', name: '노트1' }]));
    zip.file('notes/n1.md', '# 본문 내용');

    const blob = await zip.generateAsync({ type: 'uint8array' });
    assert.ok(blob.length > 0);

    const loaded = await JSZip.loadAsync(blob);
    assert.ok(loaded.file('hierarchy.json') !== null);
    assert.ok(loaded.file('notes/n1.md') !== null);

    const extractedText = await loaded.file('notes/n1.md')!.async('string');
    assert.strictEqual(extractedText, '# 본문 내용');
  });
});
