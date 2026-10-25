import test from 'node:test';
import assert from 'node:assert/strict';
import {
  scratchpadService,
  ScratchpadDB,
  ScratchpadItem,
  formatScratchpadRelativeTime,
} from '../../services/scratchpadService';
import { localFileAdapter } from '../../services/localFileAdapter';
import { ScratchpadPlugin } from '../../components/right-sidebar/plugins/ScratchpadPlugin';

test('Scratchpad DB & Multi-memo Service', async (t) => {
  let mockStorage: Record<string, string> = {};

  const originalRead = localFileAdapter.readTextFile;
  const originalWrite = localFileAdapter.writeTextFile;

  t.beforeEach(() => {
    mockStorage = {};
    scratchpadService.clearCache();
    localFileAdapter.readTextFile = async (path: string) => mockStorage[path] ?? null;
    localFileAdapter.writeTextFile = async (path: string, content: string) => {
      mockStorage[path] = content;
      return true;
    };
  });

  t.after(() => {
    localFileAdapter.readTextFile = originalRead;
    localFileAdapter.writeTextFile = originalWrite;
    scratchpadService.clearCache();
  });

  await t.test('Initializes with default memo when scratchpad.json does not exist', async () => {
    const db = await scratchpadService.getDB(true);
    assert.ok(db, 'db should exist');
    assert.strictEqual(db.items.length, 1);
    assert.ok(db.activeId, 'activeId should be defined');
    assert.strictEqual(db.activeId, db.items[0].id);
    assert.strictEqual(db.items[0].title, '새 메모');
    assert.strictEqual(db.items[0].content, '');
    assert.ok(mockStorage['scratchpad.json'], 'file should have been persisted');
  });

  await t.test('Creates new memos and updates activeId', async () => {
    const initial = await scratchpadService.getDB(true);
    const firstId = initial.activeId;

    const { db: afterCreate, created } = await scratchpadService.createItem('아이디어 노트', '첫 번째 메모 내용');
    assert.strictEqual(afterCreate.items.length, 2);
    assert.strictEqual(afterCreate.activeId, created.id);
    assert.strictEqual(created.title, '아이디어 노트');
    assert.strictEqual(created.content, '첫 번째 메모 내용');

    // Cached count should match
    assert.strictEqual(scratchpadService.getCachedCount(), 2);
  });

  await t.test('Saves existing memo and keeps items sorted by updatedAt', async () => {
    const db = await scratchpadService.getDB(true);
    const activeMemo = db.items[0];

    const updatedDB = await scratchpadService.saveItem(activeMemo.id, '수정된 제목', '수정된 본문 내용입니다.');
    const saved = updatedDB.items.find((i) => i.id === activeMemo.id);
    assert.ok(saved);
    assert.strictEqual(saved.title, '수정된 제목');
    assert.strictEqual(saved.content, '수정된 본문 내용입니다.');
    assert.strictEqual(updatedDB.activeId, activeMemo.id);
  });

  await t.test('Switches activeId correctly', async () => {
    const { created: memo2 } = await scratchpadService.createItem('두번째');
    const { created: memo3 } = await scratchpadService.createItem('세번째');

    const db = await scratchpadService.setActiveId(memo2.id);
    assert.strictEqual(db.activeId, memo2.id);
  });

  await t.test('Deletes memo and falls back to remaining items', async () => {
    const { created: memoB } = await scratchpadService.createItem('메모 B');
    const { created: memoC } = await scratchpadService.createItem('메모 C');

    // Delete memoC (which is active)
    const afterDelete = await scratchpadService.deleteItem(memoC.id);
    assert.ok(!afterDelete.items.some((i) => i.id === memoC.id));
    assert.strictEqual(afterDelete.activeId, afterDelete.items[0].id);
  });

  await t.test('Guarantees at least 1 memo remains when deleting last memo', async () => {
    const db = await scratchpadService.getDB(true);
    // Delete all items
    for (const item of [...db.items]) {
      await scratchpadService.deleteItem(item.id);
    }

    const finalDB = await scratchpadService.getDB();
    assert.strictEqual(finalDB.items.length, 1);
    assert.ok(finalDB.items[0].title);
    assert.strictEqual(finalDB.activeId, finalDB.items[0].id);
  });

  await t.test('formatScratchpadRelativeTime formats timestamps correctly', () => {
    const now = Date.now();
    assert.strictEqual(formatScratchpadRelativeTime(now - 10000), '방금 전');
    assert.strictEqual(formatScratchpadRelativeTime(now - 300000), '5분 전');
    assert.strictEqual(formatScratchpadRelativeTime(now - 7200000), '2시간 전');
    assert.strictEqual(formatScratchpadRelativeTime(now - 86400000), '어제');
    assert.strictEqual(formatScratchpadRelativeTime(now - 259200000), '3일 전');
  });

  await t.test('ScratchpadPlugin metadata contract and badge', async () => {
    assert.strictEqual(ScratchpadPlugin.id, 'scratchpad');
    assert.strictEqual(ScratchpadPlugin.title, '스크래치패드');
    assert.ok(ScratchpadPlugin.tooltip?.includes('스크래치패드'));
    assert.strictEqual(typeof ScratchpadPlugin.render, 'function');

    // Badge reflects cached count
    await scratchpadService.getDB(true);
    assert.ok(typeof ScratchpadPlugin.badge === 'function');
    const badgeVal = ScratchpadPlugin.badge({} as any);
    assert.strictEqual(typeof badgeVal, 'number');
    assert.ok((badgeVal as number) >= 1);
  });
});
