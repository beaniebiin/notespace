/**
 * Local File Adapter
 * 
 * Supports two runtimes:
 * 1. Tauri v2 Native Desktop / Mobile (OS direct file storage)
 * 2. Web / Vite dev fallback (IndexedDB persistent virtual file storage)
 */

const DB_NAME = 'notespace_local_storage';
const DB_VERSION = 1;
const STORE_NAME = 'files';

let dbPromise: Promise<IDBDatabase> | null = null;

function getIndexedDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this environment.'));
      return;
    }

    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'path' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return dbPromise;
}

export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
}

export interface FileMetadata {
  path: string;
  content: string | Uint8Array;
  mtime: number;
}

const blobUrlCache = new Map<string, string>();

export const localFileAdapter = {
  /**
   * Read text file contents
   */
  readTextFile: async (relativePath: string): Promise<string | null> => {
    const normalizedPath = relativePath.replace(/\\/g, '/');

    if (isTauriEnvironment()) {
      try {
        const { readTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
        return await readTextFile(`data/${normalizedPath}`, { baseDir: BaseDirectory.AppData });
      } catch (e) {
        return null;
      }
    }

    // Web / IndexedDB fallback
    try {
      const db = await getIndexedDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(normalizedPath);
        req.onsuccess = () => {
          if (req.result && typeof req.result.content === 'string') {
            resolve(req.result.content);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      console.error('Failed to read from IndexedDB:', e);
      return null;
    }
  },

  /**
   * Write text file atomically
   */
  writeTextFile: async (relativePath: string, content: string): Promise<boolean> => {
    const normalizedPath = relativePath.replace(/\\/g, '/');

    if (isTauriEnvironment()) {
      try {
        const { writeTextFile, mkdir, BaseDirectory } = await import('@tauri-apps/plugin-fs');
        const dirParts = normalizedPath.split('/');
        if (dirParts.length > 1) {
          dirParts.pop();
          const parentDir = `data/${dirParts.join('/')}`;
          await mkdir(parentDir, { recursive: true, baseDir: BaseDirectory.AppData });
        }
        await writeTextFile(`data/${normalizedPath}`, content, { baseDir: BaseDirectory.AppData });
        return true;
      } catch (e) {
        console.error('Tauri writeTextFile error:', e);
        return false;
      }
    }

    // Web / IndexedDB fallback
    try {
      const db = await getIndexedDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const data: FileMetadata = {
          path: normalizedPath,
          content,
          mtime: Date.now()
        };
        const req = store.put(data);
        req.onsuccess = () => resolve(true);
        req.onerror = () => {
          console.error('IndexedDB put error:', req.error);
          resolve(false);
        };
      });
    } catch (e) {
      console.error('Failed to write to IndexedDB:', e);
      return false;
    }
  },

  /**
   * Write binary file atomically
   */
  writeBinaryFile: async (relativePath: string, data: Uint8Array): Promise<boolean> => {
    const normalizedPath = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');

    if (isTauriEnvironment()) {
      try {
        const { writeFile, mkdir, BaseDirectory } = await import('@tauri-apps/plugin-fs');
        const dirParts = normalizedPath.split('/');
        if (dirParts.length > 1) {
          dirParts.pop();
          const parentDir = `data/${dirParts.join('/')}`;
          await mkdir(parentDir, { recursive: true, baseDir: BaseDirectory.AppData });
        }
        await writeFile(`data/${normalizedPath}`, data, { baseDir: BaseDirectory.AppData });

        // Update in-memory blob cache
        const mime = normalizedPath.endsWith('.png') ? 'image/png' :
                     normalizedPath.endsWith('.jpg') || normalizedPath.endsWith('.jpeg') ? 'image/jpeg' :
                     normalizedPath.endsWith('.gif') ? 'image/gif' :
                     normalizedPath.endsWith('.svg') ? 'image/svg+xml' :
                     'image/webp';
        const blob = new Blob([data as unknown as BlobPart], { type: mime });
        const blobUrl = URL.createObjectURL(blob);
        blobUrlCache.set(normalizedPath, blobUrl);
        return true;
      } catch (e) {
        console.error('Tauri writeBinaryFile error:', e);
        return false;
      }
    }

    // Web / IndexedDB fallback
    try {
      const db = await getIndexedDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const entry: FileMetadata = {
          path: normalizedPath,
          content: data,
          mtime: Date.now()
        };
        const req = store.put(entry);
        req.onsuccess = () => {
          const mime = normalizedPath.endsWith('.png') ? 'image/png' :
                       normalizedPath.endsWith('.jpg') || normalizedPath.endsWith('.jpeg') ? 'image/jpeg' :
                       normalizedPath.endsWith('.gif') ? 'image/gif' :
                       normalizedPath.endsWith('.svg') ? 'image/svg+xml' :
                       'image/webp';
          const blob = new Blob([data as unknown as BlobPart], { type: mime });
          const blobUrl = URL.createObjectURL(blob);
          blobUrlCache.set(normalizedPath, blobUrl);
          resolve(true);
        };
        req.onerror = () => resolve(false);
      });
    } catch (e) {
      console.error('Failed to write binary to IndexedDB:', e);
      return false;
    }
  },

  /**
   * Read binary file contents
   */
  readBinaryFile: async (relativePath: string): Promise<Uint8Array | null> => {
    const normalizedPath = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');

    if (isTauriEnvironment()) {
      try {
        const { readFile, BaseDirectory } = await import('@tauri-apps/plugin-fs');
        return await readFile(`data/${normalizedPath}`, { baseDir: BaseDirectory.AppData });
      } catch (e) {
        return null;
      }
    }

    // Web / IndexedDB fallback
    try {
      const db = await getIndexedDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(normalizedPath);
        req.onsuccess = () => {
          if (req.result && req.result.content) {
            const val = req.result.content;
            if (val instanceof Uint8Array) resolve(val);
            else if (val instanceof ArrayBuffer) resolve(new Uint8Array(val));
            else resolve(null);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      return null;
    }
  },

  /**
   * Resolve an image file path (e.g. "images/xxx.webp") to a renderable Object URL
   */
  resolveImageBlobUrl: async (relativePath: string): Promise<string> => {
    const normalizedPath = relativePath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^data\//, '');
    if (blobUrlCache.has(normalizedPath)) {
      return blobUrlCache.get(normalizedPath)!;
    }

    const bytes = await localFileAdapter.readBinaryFile(normalizedPath);
    if (!bytes) {
      return relativePath;
    }

    const mime = normalizedPath.endsWith('.png') ? 'image/png' :
                 normalizedPath.endsWith('.jpg') || normalizedPath.endsWith('.jpeg') ? 'image/jpeg' :
                 normalizedPath.endsWith('.gif') ? 'image/gif' :
                 normalizedPath.endsWith('.svg') ? 'image/svg+xml' :
                 'image/webp';
    const blob = new Blob([bytes as unknown as BlobPart], { type: mime });
    const blobUrl = URL.createObjectURL(blob);
    blobUrlCache.set(normalizedPath, blobUrl);
    return blobUrl;
  },

  /**
   * Remove a file
   */
  removeFile: async (relativePath: string): Promise<boolean> => {
    const normalizedPath = relativePath.replace(/\\/g, '/');

    if (isTauriEnvironment()) {
      try {
        const { remove, BaseDirectory } = await import('@tauri-apps/plugin-fs');
        await remove(`data/${normalizedPath}`, { baseDir: BaseDirectory.AppData });
        return true;
      } catch (e) {
        return false;
      }
    }

    // Web / IndexedDB fallback
    try {
      const db = await getIndexedDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(normalizedPath);
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      });
    } catch (e) {
      return false;
    }
  },

  /**
   * List files with prefix or matching directory
   */
  listFiles: async (prefixPath: string): Promise<string[]> => {
    const normalizedPrefix = prefixPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

    if (isTauriEnvironment()) {
      try {
        const { readDir, BaseDirectory } = await import('@tauri-apps/plugin-fs');
        const entries = await readDir(`data/${normalizedPrefix}`, { baseDir: BaseDirectory.AppData });
        return entries.map((e) => e.name);
      } catch (e) {
        return [];
      }
    }

    // Web / IndexedDB fallback
    try {
      const db = await getIndexedDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAllKeys();
        req.onsuccess = () => {
          const keys = (req.result as string[]) || [];
          const prefix = normalizedPrefix ? normalizedPrefix + '/' : '';
          const matched = keys.filter((k) => k.startsWith(prefix)).map((k) => k.substring(prefix.length));
          resolve(matched);
        };
        req.onerror = () => resolve([]);
      });
    } catch (e) {
      return [];
    }
  },

  /**
   * Get all stored files for backup/ZIP export
   */
  getAllFiles: async (): Promise<Array<{ path: string; content: string }>> => {
    if (isTauriEnvironment()) {
      // In Tauri, recursive directory walk could be used, or list standard hierarchy/trash/notes
      const results: Array<{ path: string; content: string }> = [];
      const tree = await localFileAdapter.readTextFile('hierarchy.json');
      if (tree) results.push({ path: 'hierarchy.json', content: tree });
      const trash = await localFileAdapter.readTextFile('trash.json');
      if (trash) results.push({ path: 'trash.json', content: trash });
      const settings = await localFileAdapter.readTextFile('settings.json');
      if (settings) results.push({ path: 'settings.json', content: settings });

      const noteFiles = await localFileAdapter.listFiles('notes');
      for (const nf of noteFiles) {
        const text = await localFileAdapter.readTextFile(`notes/${nf}`);
        if (text !== null) results.push({ path: `notes/${nf}`, content: text });
      }
      return results;
    }

    try {
      const db = await getIndexedDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => {
          const records = (req.result as FileMetadata[]) || [];
          const textRecords = records.filter((r) => typeof r.content === 'string');
          resolve(textRecords.map((r) => ({ path: r.path, content: r.content as string })));
        };
        req.onerror = () => resolve([]);
      });
    } catch (e) {
      return [];
    }
  }
};
