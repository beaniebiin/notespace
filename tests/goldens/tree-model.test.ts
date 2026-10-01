import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  findNode,
  findPath,
  findParentAndIndex,
  collectFolders,
  isDescendant,
  findFirstNote,
  move,
  collectTags,
} from '../../services/tree-model';
import { FileSystemNode } from '../../types';

const fixture = (): FileSystemNode[] => [
  {
    id: 'f1', name: 'F1', type: 'folder', lastModified: 1,
    children: [
      { id: 'n1', name: 'N1', type: 'note', lastModified: 2 },
      {
        id: 'f2', name: 'F2', type: 'folder', lastModified: 3,
        children: [{ id: 'n2', name: 'N2', type: 'note', lastModified: 4 }],
      },
    ],
  },
  { id: 'n3', name: 'N3', type: 'note', lastModified: 5 },
];

describe('findNode / findPath / findParentAndIndex', () => {
  it('finds nested nodes and misses cleanly', () => {
    assert.strictEqual(findNode(fixture(), 'n2')?.name, 'N2');
    assert.strictEqual(findNode(fixture(), 'nope'), null);
  });

  it('returns root-first paths', () => {
    assert.deepStrictEqual(findPath(fixture(), 'n2')?.map((n) => n.id), ['f1', 'f2', 'n2']);
    assert.strictEqual(findPath(fixture(), 'nope'), null);
  });

  it('reports parent and index, undefined for root level', () => {
    assert.deepStrictEqual(findParentAndIndex(fixture(), 'n2'), { parentId: 'f2', index: 0 });
    assert.deepStrictEqual(findParentAndIndex(fixture(), 'f1'), { parentId: undefined, index: 0 });
    assert.deepStrictEqual(findParentAndIndex(fixture(), 'n3'), { parentId: undefined, index: 1 });
    assert.strictEqual(findParentAndIndex(fixture(), 'nope'), null);
  });
});

describe('collectFolders / isDescendant / findFirstNote', () => {
  it('collects folders depth-first without exclusion', () => {
    assert.deepStrictEqual(collectFolders(fixture()).map((f) => f.id), ['f1', 'f2']);
  });

  it('treats self as non-descendant', () => {
    const t = fixture();
    const f1 = findNode(t, 'f1')!;
    assert.strictEqual(isDescendant(f1, 'n2'), true);
    assert.strictEqual(isDescendant(f1, 'f1'), false);
    assert.strictEqual(isDescendant(findNode(t, 'f2')!, 'n1'), false);
  });

  it('finds the first note depth-first', () => {
    assert.strictEqual(findFirstNote(fixture()), 'n1');
    assert.strictEqual(findFirstNote([]), null);
  });
});

describe('move (pure, result-valued)', () => {
  it('moves across parents and stamps parentId', () => {
    const r = move(fixture(), 'n1', 'f2');
    assert.strictEqual(r.moved, true);
    assert.deepStrictEqual(findParentAndIndex(r.tree, 'n1'), { parentId: 'f2', index: 1 });
    assert.strictEqual(findNode(r.tree, 'n1')?.parentId, 'f2');
  });

  it('reorders at root by index', () => {
    const r = move(fixture(), 'n3', undefined, 0);
    assert.strictEqual(r.moved, true);
    assert.deepStrictEqual(r.tree.map((n) => n.id), ['n3', 'f1']);
  });

  it('rejects self, missing nodes and cycles without mutating input', () => {
    const before = fixture();
    const snapshot = JSON.parse(JSON.stringify(before));
    for (const [id, target] of [['f1', 'f1'], ['nope', 'f2'], ['f1', 'f2']] as const) {
      const r = move(before, id, target);
      assert.strictEqual(r.moved, false);
      assert.ok(r.reason);
    }
    assert.deepStrictEqual(before, snapshot);
  });

  it('rolls a missing folder target back to root', () => {
    const r = move(fixture(), 'n1', 'ghost');
    assert.strictEqual(r.moved, true);
    assert.deepStrictEqual(findParentAndIndex(r.tree, 'n1')?.parentId, undefined);
  });
});

describe('collectTags', () => {
  it('gathers tags depth-first without mutating input', () => {
    const t = fixture();
    (findNode(t, 'n1') as any).tags = [{ id: 't1', label: 'A', color: 'red' }];
    (findNode(t, 'n2') as any).tags = [
      { id: 't2', label: 'B', color: 'blue' },
      { id: 't3', label: 'C', color: 'green' },
    ];
    assert.deepStrictEqual(collectTags(t).map((t) => t.label), ['A', 'B', 'C']);
    assert.deepStrictEqual(collectTags([]), []);
  });
});
