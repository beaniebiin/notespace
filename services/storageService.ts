import { FileSystemNode } from '../types';
import { localFileAdapter } from './localFileAdapter';
import { searchNotesInMemory } from './clientSearchEngine';
import JSZip from 'jszip';

const noteContentsCache = new Map<string, string>();
const lastSnapshotTimestamps = new Map<string, number>();

// In-flight save tracking
const saveAbortControllers = new Map<string, AbortController>();

/**
 * Format timestamp as YYYY-MM-DD_HHmmss
 */
function formatTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());
  return `${year}-${month}-${day}_${hours}${minutes}${seconds}`;
}

export const storageService = {
  // --- Active Tree ---
  getTree: async (): Promise<FileSystemNode[]> => {
    try {
      const raw = await localFileAdapter.readTextFile('hierarchy.json');
      if (!raw) {
        // Initial default node
        const defaultNodes: FileSystemNode[] = [
          {
            id: 'node-' + Date.now(),
            name: '시작하기',
            type: 'note',
            lastModified: Date.now(),
            tags: []
          }
        ];
        await localFileAdapter.writeTextFile('hierarchy.json', JSON.stringify(defaultNodes, null, 2));
        await localFileAdapter.writeTextFile(
          `notes/${defaultNodes[0].id}.md`,
          '# NoteSpace에 오신 것을 환영합니다!\n\n이 앱은 순수 오프라인으로 안전하게 구동되는 지식관리 노트 앱입니다.'
        );
        return defaultNodes;
      }
      return JSON.parse(raw);
    } catch (e) {
      console.error('Failed to get tree from local storage:', e);
      return [];
    }
  },

  saveTree: async (nodes: FileSystemNode[]): Promise<boolean> => {
    try {
      return await localFileAdapter.writeTextFile('hierarchy.json', JSON.stringify(nodes, null, 2));
    } catch (e) {
      console.error('Failed to save tree:', e);
      return false;
    }
  },

  // --- Trash ---
  getTrash: async (): Promise<FileSystemNode[]> => {
    try {
      const raw = await localFileAdapter.readTextFile('trash.json');
      if (!raw) return [];
      return JSON.parse(raw);
    } catch (e) {
      console.error('Failed to get trash:', e);
      return [];
    }
  },

  saveTrash: async (nodes: FileSystemNode[]): Promise<boolean> => {
    try {
      return await localFileAdapter.writeTextFile('trash.json', JSON.stringify(nodes, null, 2));
    } catch (e) {
      console.error('Failed to save trash:', e);
      return false;
    }
  },

  // --- Settings ---
  getSettings: async (): Promise<any> => {
    const isSystemDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const defaultSettings = { title: 'NoteSpace', logo: 'N', darkMode: isSystemDark, theme: 'system' };
    try {
      const raw = await localFileAdapter.readTextFile('settings.json');
      if (!raw) return defaultSettings;
      const parsed = JSON.parse(raw);
      return {
        ...defaultSettings,
        ...parsed,
        theme: parsed.theme || (parsed.darkMode !== undefined ? (parsed.darkMode ? 'dark' : 'light') : 'system'),
      };
    } catch (e) {
      console.error('Failed to get settings:', e);
      return defaultSettings;
    }
  },

  saveSettings: async (settings: any): Promise<boolean> => {
    try {
      return await localFileAdapter.writeTextFile('settings.json', JSON.stringify(settings, null, 2));
    } catch (e) {
      console.error('Failed to save settings:', e);
      return false;
    }
  },

  // --- Content ---
  getContent: async (id: string): Promise<string | null> => {
    if (noteContentsCache.has(id)) {
      return noteContentsCache.get(id)!;
    }

    try {
      let content = await localFileAdapter.readTextFile(`notes/${id}.md`);
      if (content !== null) {
        // 1. Auto-heal any corrupted headings with stray backslashes
        const { cleanMarkdownContent } = await import('../components/TiptapEditor');
        content = cleanMarkdownContent(content);

        // 2. Auto-extract any embedded base64 images to clean local WebP files
        if (content.includes('data:image/')) {
          const { imageStorageService } = await import('./imageStorageService');
          const migrated = await imageStorageService.extractBase64ImagesToFiles(content);
          if (migrated !== content) {
            content = migrated;
            await localFileAdapter.writeTextFile(`notes/${id}.md`, content);
          }
        }

        noteContentsCache.set(id, content);
        return content;
      }
      return '';
    } catch (e) {
      console.error(`Failed to get content for note ${id}:`, e);
      return null;
    }
  },

  saveContent: async (id: string, content: string, opts?: { signal?: AbortSignal; keepalive?: boolean }) => {
    // Abort existing in-flight request if present
    if (saveAbortControllers.has(id)) {
      try {
        saveAbortControllers.get(id)?.abort();
      } catch {}
      saveAbortControllers.delete(id);
    }

    const controller = new AbortController();
    saveAbortControllers.set(id, controller);

    try {
      // 1. Snapshot creation check (20-minute interval)
      const oldContent = noteContentsCache.get(id);
      if (oldContent !== undefined && oldContent !== content) {
        const lastSnapshotTime = lastSnapshotTimestamps.get(id) || 0;
        const now = Date.now();
        // 20 minutes = 1200 * 1000 ms
        if (now - lastSnapshotTime >= 1200000) {
          const timestampStr = formatTimestamp(new Date(now));
          await localFileAdapter.writeTextFile(`snapshots/${id}/${timestampStr}.md`, oldContent);
          lastSnapshotTimestamps.set(id, now);

          // Maintain max 20 snapshots (FIFO)
          const snapshots = await localFileAdapter.listFiles(`snapshots/${id}`);
          if (snapshots.length > 20) {
            snapshots.sort();
            const toDelete = snapshots.slice(0, snapshots.length - 20);
            for (const f of toDelete) {
              await localFileAdapter.removeFile(`snapshots/${id}/${f}`);
            }
          }
        }
      }

      // 2. Write to local file
      const success = await localFileAdapter.writeTextFile(`notes/${id}.md`, content);
      if (!success) {
        throw new Error(`Failed to write note ${id}.md to storage`);
      }

      // 3. Update memory cache
      noteContentsCache.set(id, content);
    } catch (e: any) {
      if (e.name === 'AbortError') {
        return;
      }
      console.error(`Failed to save content for note ${id}:`, e);
      throw e;
    } finally {
      if (saveAbortControllers.get(id) === controller) {
        saveAbortControllers.delete(id);
      }
    }
  },

  deleteNoteContent: async (id: string) => {
    try {
      await localFileAdapter.removeFile(`notes/${id}.md`);
      noteContentsCache.delete(id);

      // Clean snapshots
      const snapshots = await localFileAdapter.listFiles(`snapshots/${id}`);
      for (const s of snapshots) {
        await localFileAdapter.removeFile(`snapshots/${id}/${s}`);
      }
    } catch (e) {
      console.error(`Failed to delete content for note ${id}:`, e);
    }
  },

  deleteRecursiveContent: async (node: FileSystemNode) => {
    if (node.type === 'note') {
      await storageService.deleteNoteContent(node.id);
    }
    if (node.children) {
      for (const child of node.children) {
        await storageService.deleteRecursiveContent(child);
      }
    }
  },

  // --- High-Speed In-Memory Search ---
  searchNotes: async (query: string): Promise<{ id: string; title: string; snippet: string }[]> => {
    try {
      const tree = await storageService.getTree();

      // Ensure all active notes in tree are in the cache
      const extractIds = (nodes: FileSystemNode[], ids: string[] = []): string[] => {
        for (const node of nodes) {
          if (node.type === 'note' && node.id) {
            ids.push(node.id);
          }
          if (node.children) {
            extractIds(node.children, ids);
          }
        }
        return ids;
      };

      const activeIds = extractIds(tree);
      const uncached = activeIds.filter((id) => !noteContentsCache.has(id));

      if (uncached.length > 0) {
        await Promise.all(
          uncached.map(async (id) => {
            const c = await localFileAdapter.readTextFile(`notes/${id}.md`);
            if (c !== null) noteContentsCache.set(id, c);
          })
        );
      }

      return searchNotesInMemory(query, tree, noteContentsCache);
    } catch (e) {
      console.error('Failed to search notes locally:', e);
      return [];
    }
  },

  // --- Export Workspace to ZIP ---
  exportWorkspaceZip: async (): Promise<Blob> => {
    const zip = new JSZip();
    const allFiles = await localFileAdapter.getAllFiles();

    for (const file of allFiles) {
      zip.file(file.path, file.content);
    }

    return await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  },

  // --- Import Workspace from ZIP ---
  importWorkspaceZip: async (zipBlob: Blob): Promise<boolean> => {
    try {
      const zip = await JSZip.loadAsync(zipBlob);
      const entries = Object.keys(zip.files);

      for (const filename of entries) {
        const fileEntry = zip.files[filename];
        if (fileEntry.dir) continue;

        const content = await fileEntry.async('string');
        await localFileAdapter.writeTextFile(filename, content);

        if (filename.startsWith('notes/') && filename.endsWith('.md')) {
          const noteId = filename.substring('notes/'.length, filename.length - 3);
          noteContentsCache.set(noteId, content);
        }
      }

      return true;
    } catch (e) {
      console.error('Failed to import workspace from ZIP:', e);
      return false;
    }
  }
};
