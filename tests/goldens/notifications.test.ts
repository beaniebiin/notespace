import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  categoryOf,
  dismissNotification,
  keyOf,
  upsertNotification,
  type StoredNotification,
} from '../../services/notifications';

const entry = (id: string, key: string): StoredNotification => ({
  id,
  key,
  type: 'tree_saved',
  message: id,
});

describe('categoryOf / keyOf', () => {
  it('maps ai_/tree_ prefixes, everything else to other', () => {
    assert.strictEqual(categoryOf('ai_loading'), 'ai');
    assert.strictEqual(categoryOf('ai_success'), 'ai');
    assert.strictEqual(categoryOf('tree_saved'), 'tree');
    assert.strictEqual(categoryOf('tree_error'), 'tree');
    assert.strictEqual(categoryOf('info'), 'other');
  });

  it('prefers an explicit key over the category default', () => {
    assert.strictEqual(keyOf({ type: 'ai_loading', message: 'x' }), 'ai');
    assert.strictEqual(keyOf({ type: 'ai_loading', message: 'x', key: 'ai:run' }), 'ai:run');
  });
});

describe('upsertNotification (keyed replacement)', () => {
  it('replaces the same key instead of stacking', () => {
    const first = upsertNotification([], { type: 'tree_saved', message: 'a' }, 'id-1');
    const second = upsertNotification(first, { type: 'tree_error', message: 'b' }, 'id-2');
    assert.strictEqual(second.length, 1);
    assert.strictEqual(second[0].id, 'id-2');
    assert.strictEqual(second[0].type, 'tree_error');
  });

  it('lets scope, result and failure pills coexist under explicit keys', () => {
    let list: StoredNotification[] = [];
    list = upsertNotification(list, { type: 'ai_loading', message: 'run', key: 'ai:run' }, 'id-1');
    list = upsertNotification(list, { type: 'ai_success', message: 'done', key: 'ai:done' }, 'id-2');
    list = upsertNotification(list, { type: 'tree_error', message: 'fail' }, 'id-3');
    assert.deepStrictEqual(list.map((n) => n.id), ['id-1', 'id-2', 'id-3']);
  });

  it('does not mutate the input list', () => {
    const before: StoredNotification[] = [entry('id-1', 'tree')];
    const after = upsertNotification(before, { type: 'tree_saved', message: 'x' }, 'id-2');
    assert.strictEqual(before.length, 1);
    assert.strictEqual(after.length, 1);
    assert.strictEqual(after[0].id, 'id-2');
  });
});

describe('dismissNotification', () => {
  it('removes by id and keeps the rest', () => {
    const list = [entry('id-1', 'a'), entry('id-2', 'b')];
    assert.deepStrictEqual(dismissNotification(list, 'id-1').map((n) => n.id), ['id-2']);
    assert.deepStrictEqual(dismissNotification(list, 'ghost'), list);
  });
});
