import { useCallback, useEffect, useRef, useState } from 'react';
import type { FileSystemNode, Tag } from '../../types';
import {
  findNode,
  isDescendant,
  move as moveTreeNode,
  type MoveResult,
} from '../../services/tree-model';
import { storageService } from '../../services/storageService';
import type { NotifyInput } from '../../services/notifications';

export interface RemoveOutcome {
  removed: FileSystemNode | null;
  clearedActive: boolean;
}

export interface FileTree {
  fileSystem: FileSystemNode[];
  trashItems: FileSystemNode[];

  updateNode: (id: string, updates: Partial<FileSystemNode>) => void;
  renameNode: (id: string, newName: string) => void;
  updateTags: (id: string, tags: Tag[]) => void;
  moveNode: (nodeId: string, targetFolderId: string | undefined, targetIndex?: number) => MoveResult;
  removeNode: (id: string, activeNoteId: string | null) => RemoveOutcome;
  restoreNode: (node: FileSystemNode) => void;
  deleteForever: (id: string) => Promise<void>;
  createNode: (parentId: string | undefined, type: 'note' | 'folder') => Promise<FileSystemNode>;
}

// 트리 상태 소유 훅. 순수 순회는 services/tree-model에 위임한다.
// 선택(activeNoteId)·에디터·저장 버퍼는 호출자(App)가 맡는다.
export const useFileTree = (deps: { notify: (input: NotifyInput) => void }): FileTree => {
  const { notify } = deps;
  const [fileSystem, setFileSystem] = useState<FileSystemNode[]>([]);
  const [trashItems, setTrashItems] = useState<FileSystemNode[]>([]);
  const loadedRef = useRef(false);

  useEffect(() => {
    const load = async () => {
      const tree = await storageService.getTree();
      setFileSystem(tree);
      const trash = await storageService.getTrash();
      setTrashItems(trash);
      loadedRef.current = true;
    };
    load();
  }, []);

  const saveTreeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const saveTrashTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevTreeRef = useRef<string>('');

  useEffect(() => {
    if (!loadedRef.current) return;
    const currentTreeStr = JSON.stringify(fileSystem);
    if (prevTreeRef.current === '') {
      prevTreeRef.current = currentTreeStr;
      return;
    }
    if (prevTreeRef.current === currentTreeStr) return;
    prevTreeRef.current = currentTreeStr;

    if (saveTreeTimeoutRef.current) clearTimeout(saveTreeTimeoutRef.current);
    saveTreeTimeoutRef.current = setTimeout(async () => {
      try {
        const ok = await storageService.saveTree(fileSystem);
        if (ok) {
          notify({ type: 'tree_saved', message: '구조/위계 저장됨', duration: 2500 });
        } else {
          notify({ type: 'tree_error', message: '구조 저장 실패', duration: 4000 });
        }
      } catch {
        notify({ type: 'tree_error', message: '구조 저장 실패', duration: 4000 });
      }
    }, 400);
    return () => {
      if (saveTreeTimeoutRef.current) clearTimeout(saveTreeTimeoutRef.current);
    };
  }, [fileSystem, notify]);

  useEffect(() => {
    if (!loadedRef.current) return;
    if (saveTrashTimeoutRef.current) clearTimeout(saveTrashTimeoutRef.current);
    saveTrashTimeoutRef.current = setTimeout(() => {
      storageService
        .saveTrash(trashItems)
        .then((ok) => {
          if (!ok) notify({ type: 'tree_error', message: '휴지통 저장 실패', duration: 4000 });
        })
        .catch(() => notify({ type: 'tree_error', message: '휴지통 저장 실패', duration: 4000 }));
    }, 500);
    return () => {
      if (saveTrashTimeoutRef.current) clearTimeout(saveTrashTimeoutRef.current);
    };
  }, [trashItems, notify]);

  const updateNode = useCallback((id: string, updates: Partial<FileSystemNode>) => {
    setFileSystem((prev) => {
      const newFS = JSON.parse(JSON.stringify(prev));
      const updateRecursive = (nodes: FileSystemNode[]) => {
        for (let i = 0; i < nodes.length; i++) {
          if (nodes[i].id === id) {
            nodes[i] = { ...nodes[i], ...updates, lastModified: Date.now() };
            return true;
          }
          if (nodes[i].children) {
            if (updateRecursive(nodes[i].children!)) return true;
          }
        }
        return false;
      };
      updateRecursive(newFS);
      return newFS;
    });
  }, []);

  const renameNode = useCallback(
    (id: string, newName: string) => {
      const node = findNode(fileSystem, id);
      const label = node?.type === 'folder' ? '폴더' : '문서';
      updateNode(id, { name: newName });
      notify({ type: 'tree_saved', message: `${label} 이름 변경됨 (${newName})`, duration: 3000 });
    },
    [fileSystem, updateNode, notify]
  );

  const updateTags = useCallback(
    (id: string, tags: Tag[]) => {
      updateNode(id, { tags });
    },
    [updateNode]
  );

  // Move Node - with cycle check, index support. 거부 결과값도 그대로 돌려준다.
  const moveNode = useCallback(
    (nodeId: string, targetFolderId: string | undefined, targetIndex?: number) => {
      const result = moveTreeNode(fileSystem, nodeId, targetFolderId, targetIndex);
      if (!result.moved) return result;
      setFileSystem(result.tree);
      notify({ type: 'tree_saved', message: '위계/순서 변경됨', duration: 3000 });
      return result;
    },
    [fileSystem, notify]
  );

  // 휴지통 이동. 활성 노트 정리는 호출자가 clearedActive로 판단한다.
  const removeNode = useCallback(
    (id: string, activeNoteId: string | null): RemoveOutcome => {
      const target = findNode(fileSystem, id);
      if (!target) return { removed: null, clearedActive: false };
      const clearedActive =
        !!activeNoteId && (target.id === activeNoteId || isDescendant(target, activeNoteId));
      const snapshot = structuredClone(target);
      setFileSystem((prev) => {
        const newFS = structuredClone(prev);
        const deleteRecursive = (nodes: FileSystemNode[]) => {
          const index = nodes.findIndex((n) => n.id === id);
          if (index !== -1) {
            nodes.splice(index, 1);
            return true;
          }
          for (const node of nodes) {
            if (node.children) {
              if (deleteRecursive(node.children)) return true;
            }
          }
          return false;
        };
        deleteRecursive(newFS);
        return newFS;
      });
      setTrashItems((prev) => [...prev, snapshot]);
      notify({ type: 'tree_saved', message: `'${snapshot.name}' 휴지통으로 이동됨`, duration: 3000 });
      return { removed: snapshot, clearedActive };
    },
    [fileSystem, notify]
  );

  const restoreNode = useCallback(
    (node: FileSystemNode) => {
      setTrashItems((prev) => prev.filter((n) => n.id !== node.id));
      notify({ type: 'tree_saved', message: `'${node.name}' 복원됨`, duration: 3000 });

      setFileSystem((prev) => {
        const newFS = JSON.parse(JSON.stringify(prev));

        let restored = false;
        if (node.parentId) {
          const addToParent = (nodes: FileSystemNode[]) => {
            for (const n of nodes) {
              if (n.id === node.parentId && n.type === 'folder') {
                if (!n.children) n.children = [];
                n.children.push(node);
                return true;
              }
              if (n.children) {
                if (addToParent(n.children)) return true;
              }
            }
            return false;
          };
          restored = addToParent(newFS);
        }

        if (!restored) {
          newFS.push(node);
        }
        return newFS;
      });
    },
    [notify]
  );

  const deleteForever = useCallback(
    async (id: string) => {
      const node = trashItems.find((n) => n.id === id);
      if (node) {
        await storageService.deleteRecursiveContent(node);
      }
      setTrashItems((prev) => prev.filter((n) => n.id !== id));
    },
    [trashItems]
  );

  // 생성까지만 맡는다. 선택·사이드바 전환은 호출자가 맡는다.
  const createNode = useCallback(
    async (parentId: string | undefined, type: 'note' | 'folder') => {
      const newNode: FileSystemNode = {
        id: `node-${crypto.randomUUID()}`,
        name: type === 'note' ? 'Untitled' : 'New Folder',
        type,
        parentId,
        lastModified: Date.now(),
        children: type === 'folder' ? [] : undefined,
        tags: [],
      };

      if (type === 'note') {
        await storageService.saveContent(newNode.id, '');
      }

      let parentFound = !parentId;
      setFileSystem((prev) => {
        const newFS = structuredClone(prev);
        if (!parentId) {
          newFS.push(newNode);
          parentFound = true;
        } else {
          const addToParent = (nodes: FileSystemNode[]) => {
            for (const node of nodes) {
              if (node.id === parentId) {
                if (!node.children) node.children = [];
                node.children.push(newNode);
                return true;
              }
              if (node.children) {
                if (addToParent(node.children)) return true;
              }
            }
            return false;
          };
          parentFound = addToParent(newFS);
          if (!parentFound) {
            console.error(`createNode: parent ${parentId} not found, falling back to root`);
            newFS.push({ ...newNode, parentId: undefined });
          }
        }
        return newFS;
      });
      if (!parentFound && type === 'note') {
        console.warn(`createNode: orphan content cleanup not needed, node placed at root`);
      }

      notify({
        type: 'tree_saved',
        message: type === 'note' ? '새 노트 생성됨' : '새 폴더 생성됨',
        duration: 3000,
      });
      return newNode;
    },
    [notify]
  );

  return {
    fileSystem,
    trashItems,
    updateNode,
    renameNode,
    updateTags,
    moveNode,
    removeNode,
    restoreNode,
    deleteForever,
    createNode,
  };
};
