import { FileSystemNode, Tag } from '../types';

// FileSystemNode[] 순회 단일 seam. 전부 순수 함수: 입력 트리를 변경하지 않는다.

// id로 노드 탐색. 없으면 null.
export const findNode = (nodes: FileSystemNode[], id: string): FileSystemNode | null => {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNode(node.children, id);
      if (found) return found;
    }
  }
  return null;
};

// 루트→대상 경로. 없으면 null.
export const findPath = (nodes: FileSystemNode[], targetId: string): FileSystemNode[] | null => {
  for (const node of nodes) {
    if (node.id === targetId) return [node];
    if (node.children) {
      const path = findPath(node.children, targetId);
      if (path) return [node, ...path];
    }
  }
  return null;
};

// 부모 id와 부모 안 index. 루트 직속이면 parentId undefined. 없으면 null.
export const findParentAndIndex = (
  nodes: FileSystemNode[],
  targetId: string,
  parentId: string | undefined = undefined
): { parentId: string | undefined; index: number } | null => {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === targetId) return { parentId, index: i };
    if (nodes[i].children) {
      const found = findParentAndIndex(nodes[i].children!, targetId, nodes[i].id);
      if (found) return found;
    }
  }
  return null;
};

// 폴더만 전부 수집. 제외 정책은 호출자가 담당한다.
export const collectFolders = (nodes: FileSystemNode[]): FileSystemNode[] => {
  const folders: FileSystemNode[] = [];
  for (const n of nodes) {
    if (n.type === 'folder') {
      folders.push(n);
      if (n.children) folders.push(...collectFolders(n.children));
    }
  }
  return folders;
};

// 엄격한 자손 여부 (자기 자신은 자손이 아니다).
export const isDescendant = (parent: FileSystemNode, childId: string): boolean => {
  if (!parent.children) return false;
  return parent.children.some((c) => c.id === childId || isDescendant(c, childId));
};

// 첫 노트 id 깊이우선 탐색. 없으면 null.
export const findFirstNote = (nodes: FileSystemNode[]): string | null => {
  for (const node of nodes) {
    if (node.type === 'note') return node.id;
    if (node.children) {
      const found = findFirstNote(node.children);
      if (found) return found;
    }
  }
  return null;
};

export type MoveReason = 'self' | 'not-found' | 'cycle';

export interface MoveResult {
  moved: boolean;
  tree: FileSystemNode[];
  reason?: MoveReason;
}

// 노드 이동. 입력은 복제해서 다루고 원본은 그대로 둔다.
// targetFolderId가 없으면 루트, 폴더를 못 찾으면 루트로 롤백(현행 유지).
// 무효 이동(self·미발견·cycle)은 moved:false와 원본 트리를 돌려준다.
export const move = (
  nodes: FileSystemNode[],
  nodeId: string,
  targetFolderId: string | undefined,
  targetIndex?: number
): MoveResult => {
  if (nodeId === targetFolderId) return { moved: false, tree: nodes, reason: 'self' };

  const target = findNode(nodes, nodeId);
  if (!target) return { moved: false, tree: nodes, reason: 'not-found' };

  if (targetFolderId && isDescendant(target, targetFolderId)) {
    return { moved: false, tree: nodes, reason: 'cycle' };
  }

  const tree = structuredClone(nodes);
  let nodeToMove: FileSystemNode | null = null;
  const removeRecursive = (list: FileSystemNode[]): boolean => {
    const idx = list.findIndex((n) => n.id === nodeId);
    if (idx !== -1) {
      nodeToMove = list[idx];
      list.splice(idx, 1);
      return true;
    }
    for (const n of list) {
      if (n.children && removeRecursive(n.children)) return true;
    }
    return false;
  };
  removeRecursive(tree);
  if (!nodeToMove) return { moved: false, tree: nodes, reason: 'not-found' };

  const insertAt = (list: FileSystemNode[]): void => {
    if (targetIndex !== undefined && targetIndex >= 0) {
      list.splice(Math.min(targetIndex, list.length), 0, nodeToMove!);
    } else {
      list.push(nodeToMove!);
    }
  };

  const moving = nodeToMove as FileSystemNode;
  if (!targetFolderId) {
    moving.parentId = undefined;
    insertAt(tree);
    return { moved: true, tree };
  }

  const folder = findNode(tree, targetFolderId);
  if (folder && folder.type === 'folder') {
    moving.parentId = targetFolderId;
    if (!folder.children) folder.children = [];
    insertAt(folder.children);
    return { moved: true, tree };
  }

  moving.parentId = undefined;
  insertAt(tree);
  return { moved: true, tree };
};

// 전역 태그 수집. App의 getAllTags를 옮겼다. 입력은 변경하지 않는다.
export const collectTags = (nodes: FileSystemNode[]): Tag[] => {
  const tags: Tag[] = [];
  const traverse = (list: FileSystemNode[]) => {
    list.forEach((node) => {
      if (node.tags) tags.push(...node.tags);
      if (node.children) traverse(node.children);
    });
  };
  traverse(nodes);
  return tags;
};
