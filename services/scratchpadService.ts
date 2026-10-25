import { localFileAdapter } from './localFileAdapter';

export interface ScratchpadItem {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface ScratchpadDB {
  activeId: string;
  items: ScratchpadItem[];
}

const LOCAL_STORAGE_LEGACY_KEY = 'notespace_scratchpad_content';

function createDefaultMemo(initialContent = ''): ScratchpadItem {
  const now = Date.now();
  return {
    id: `memo-${now}-${Math.random().toString(36).substring(2, 7)}`,
    title: initialContent.trim() ? (initialContent.trim().split('\n')[0].slice(0, 30) || '메모 1') : '새 메모',
    content: initialContent,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Format relative time (e.g. 방금 전, 5분 전, 3시간 전, 어제, 10월 25일)
 */
export function formatScratchpadRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (diffSec < 60) return '방금 전';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}분 전`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}시간 전`;
  const days = Math.floor(diffSec / 86400);
  if (days === 1) return '어제';
  if (days < 7) return `${days}일 전`;
  const d = new Date(timestamp);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

let inMemoryDBCache: ScratchpadDB | null = null;

function notifyUpdate(db: ScratchpadDB) {
  inMemoryDBCache = db;
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('notespace-scratchpad-updated', { detail: db }));
    } catch { }
  }
}

export const scratchpadService = {
  /**
   * Return the cached count of scratchpad memos if available, or 0.
   */
  getCachedCount: (): number => inMemoryDBCache?.items.length || 0,

  /**
   * Load the Scratchpad DB from local file storage (scratchpad.json).
   * Migrates legacy localStorage content if present.
   */
  getDB: async (forceReload = false): Promise<ScratchpadDB> => {
    if (!forceReload && inMemoryDBCache) {
      return inMemoryDBCache;
    }

    try {
      const raw = await localFileAdapter.readTextFile('scratchpad.json');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
          const validActive = parsed.items.find((i: ScratchpadItem) => i.id === parsed.activeId);
          const loadedDB: ScratchpadDB = {
            activeId: validActive ? parsed.activeId : parsed.items[0].id,
            items: parsed.items.sort((a: ScratchpadItem, b: ScratchpadItem) => (b.updatedAt || 0) - (a.updatedAt || 0)),
          };
          notifyUpdate(loadedDB);
          return loadedDB;
        }
      }

      // Check legacy localStorage migration
      let legacyText = '';
      if (typeof window !== 'undefined') {
        try {
          legacyText = localStorage.getItem(LOCAL_STORAGE_LEGACY_KEY) || '';
        } catch { }
      }

      const initialMemo = createDefaultMemo(legacyText);
      const initialDB: ScratchpadDB = {
        activeId: initialMemo.id,
        items: [initialMemo],
      };

      await localFileAdapter.writeTextFile('scratchpad.json', JSON.stringify(initialDB, null, 2));
      notifyUpdate(initialDB);
      return initialDB;
    } catch (e) {
      console.error('Failed to load scratchpad.json', e);
      const fallback = createDefaultMemo();
      const fallbackDB = { activeId: fallback.id, items: [fallback] };
      notifyUpdate(fallbackDB);
      return fallbackDB;
    }
  },

  /**
   * Save an existing scratchpad item or update activeId
   */
  saveItem: async (id: string, title: string, content: string): Promise<ScratchpadDB> => {
    const db = await scratchpadService.getDB();
    const now = Date.now();
    const idx = db.items.findIndex((item) => item.id === id);

    if (idx !== -1) {
      db.items[idx] = {
        ...db.items[idx],
        title: title.trim() || '제목 없음',
        content,
        updatedAt: now,
      };
      db.activeId = id;
    } else {
      const newItem: ScratchpadItem = {
        id,
        title: title.trim() || '제목 없음',
        content,
        createdAt: now,
        updatedAt: now,
      };
      db.items.unshift(newItem);
      db.activeId = id;
    }

    // Keep sorted by updatedAt descending
    db.items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    await localFileAdapter.writeTextFile('scratchpad.json', JSON.stringify(db, null, 2));
    notifyUpdate(db);
    return db;
  },

  /**
   * Create a new scratchpad memo and set it as active
   */
  createItem: async (title = '', content = ''): Promise<{ db: ScratchpadDB; created: ScratchpadItem }> => {
    const db = await scratchpadService.getDB();
    const now = Date.now();
    const memoNum = db.items.length + 1;
    const newItem: ScratchpadItem = {
      id: `memo-${now}-${Math.random().toString(36).substring(2, 7)}`,
      title: title.trim() || `메모 ${memoNum}`,
      content,
      createdAt: now,
      updatedAt: now,
    };

    db.items.unshift(newItem);
    db.activeId = newItem.id;

    await localFileAdapter.writeTextFile('scratchpad.json', JSON.stringify(db, null, 2));
    notifyUpdate(db);
    return { db, created: newItem };
  },

  /**
   * Delete a scratchpad memo by ID. Always guarantees at least 1 memo remains.
   */
  deleteItem: async (id: string): Promise<ScratchpadDB> => {
    const db = await scratchpadService.getDB();
    db.items = db.items.filter((item) => item.id !== id);

    if (db.items.length === 0) {
      const fresh = createDefaultMemo();
      db.items = [fresh];
      db.activeId = fresh.id;
    } else if (db.activeId === id) {
      db.activeId = db.items[0].id;
    }

    await localFileAdapter.writeTextFile('scratchpad.json', JSON.stringify(db, null, 2));
    notifyUpdate(db);
    return db;
  },

  /**
   * Change active memo ID
   */
  setActiveId: async (id: string): Promise<ScratchpadDB> => {
    const db = await scratchpadService.getDB();
    if (db.items.some((item) => item.id === id)) {
      db.activeId = id;
      await localFileAdapter.writeTextFile('scratchpad.json', JSON.stringify(db, null, 2));
      notifyUpdate(db);
    }
    return db;
  },

  /**
   * Clear in-memory cache (useful in tests)
   */
  clearCache: () => {
    inMemoryDBCache = null;
  },
};
