import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTextStatistics, naturalSortItems } from '../../services/textStatistics';
import {
  defaultRightSidebarPlugins,
  registerRightSidebarPlugin,
  ScratchpadPlugin,
} from '../../components/right-sidebar/plugins';
import { RightSidebarPlugin, RightSidebarContext } from '../../components/right-sidebar/RightSidebarTypes';

test('computeTextStatistics: word and character calculations', async (t) => {
  await t.test('handles empty or null or undefined gracefully', () => {
    assert.deepStrictEqual(computeTextStatistics(''), { words: 0, characters: 0, charactersNoSpaces: 0 });
    assert.deepStrictEqual(computeTextStatistics(null), { words: 0, characters: 0, charactersNoSpaces: 0 });
    assert.deepStrictEqual(computeTextStatistics(undefined), { words: 0, characters: 0, charactersNoSpaces: 0 });
    assert.deepStrictEqual(computeTextStatistics('   \n\t  '), { words: 0, characters: 0, charactersNoSpaces: 0 });
  });

  await t.test('accurately counts words and characters in plain text (Korean + English)', () => {
    const text = 'NoteSpace 지식 관리 시스템';
    const stats = computeTextStatistics(text);
    // "NoteSpace" (9) + " " (1) + "지식" (2) + " " (1) + "관리" (2) + " " (1) + "시스템" (3) = 19 chars
    assert.strictEqual(stats.words, 4);
    assert.strictEqual(stats.characters, 19);
    assert.strictEqual(stats.charactersNoSpaces, 16);
  });

  await t.test('strips HTML tags and decodes entities before computing statistics', () => {
    const html = '<p>안녕하세요 <strong>NoteSpace</strong>&nbsp;&amp;&nbsp;Tauri!</p>';
    const stats = computeTextStatistics(html);
    // Decoded text: "안녕하세요 NoteSpace & Tauri!" -> 4 words, 21 non-space chars
    assert.strictEqual(stats.words, 4);
    assert.strictEqual(stats.charactersNoSpaces, 21);
  });

  await t.test('naturalSortItems sorts numeric suffixes naturally', () => {
    const input = ['항목 10', '항목 1', '항목 2', '항목 20'];
    const sorted = naturalSortItems(input);
    assert.deepStrictEqual(sorted, ['항목 1', '항목 2', '항목 10', '항목 20']);
  });
});

test('pluggable right sidebar framework contract', async (t) => {
  await t.test('default plugins registry contains ScratchpadPlugin with valid contract', () => {
    assert.ok(defaultRightSidebarPlugins.length >= 1);
    const scratchpad = defaultRightSidebarPlugins.find((p) => p.id === 'scratchpad');
    assert.ok(scratchpad, 'ScratchpadPlugin must be registered');

    for (const plugin of defaultRightSidebarPlugins) {
      assert.ok(plugin.id && typeof plugin.id === 'string', 'Plugin must have string id');
      assert.ok(plugin.title && typeof plugin.title === 'string', 'Plugin must have title');
      assert.ok(plugin.icon, 'Plugin must have an icon component');
      assert.strictEqual(typeof plugin.render, 'function', 'Plugin must provide a render function');
    }
  });

  await t.test('supports registering custom third-party builder plugins dynamically', () => {
    const customPlugin: RightSidebarPlugin = {
      id: 'custom-timer',
      title: '집중 타이머',
      icon: () => null,
      render: () => 'Custom Plugin Rendered',
    };

    const initialCount = defaultRightSidebarPlugins.length;
    const extended = registerRightSidebarPlugin(defaultRightSidebarPlugins, customPlugin);
    assert.strictEqual(extended.length, initialCount + 1);
    assert.strictEqual(extended[initialCount].id, 'custom-timer');

    // Re-registering with the same ID should replace instead of duplicating
    const updatedCustom: RightSidebarPlugin = {
      ...customPlugin,
      title: '집중 타이머 (수정됨)',
    };
    const replaced = registerRightSidebarPlugin(extended, updatedCustom);
    assert.strictEqual(replaced.length, initialCount + 1);
    assert.strictEqual(replaced[initialCount].title, '집중 타이머 (수정됨)');
  });

  await t.test('RightSidebarContext contract can be consumed by plugin render', () => {
    const dummyContext: RightSidebarContext = {
      activeNoteId: 'note-1',
      activeNoteTitle: '테스트 노트',
      editorContent: '# Hello World\n\nContent',
      statistics: computeTextStatistics('# Hello World\n\nContent'),
      onNavigateLink: () => {},
      onInsertMarkdown: () => {},
    };

    assert.strictEqual(dummyContext.activeNoteId, 'note-1');
    assert.strictEqual(typeof dummyContext.statistics.words, 'number');
    const rendered = ScratchpadPlugin.render(dummyContext);
    assert.ok(rendered !== null && rendered !== undefined);
  });
});
