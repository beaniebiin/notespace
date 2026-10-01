import { isTauriEnvironment } from './localFileAdapter';

export interface UrlMetadata {
  title: string;
  favicon: string;
  description: string;
  image: string;
}

export const urlPreviewService = {
  /**
   * Fetch website metadata (title, favicon, description, image)
   */
  fetchMetadata: async (url: string): Promise<UrlMetadata> => {
    let hostname = '';
    try {
      hostname = new URL(url).hostname;
    } catch {
      hostname = url;
    }

    const fallback: UrlMetadata = {
      title: hostname,
      favicon: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`,
      description: '',
      image: '',
    };

    if (isTauriEnvironment()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const meta = await invoke<UrlMetadata>('fetch_url_metadata', { url });
        return {
          title: meta.title || fallback.title,
          favicon: meta.favicon || fallback.favicon,
          description: meta.description || '',
          image: meta.image || '',
        };
      } catch (e) {
        console.warn('Tauri fetch_url_metadata fallback:', e);
      }
    }

    return fallback;
  },

  /**
   * Fetch sanitized HTML for in-app sandboxed preview iframe
   */
  fetchPreviewHtml: async (url: string): Promise<string | null> => {
    if (isTauriEnvironment()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<string>('fetch_url_preview', { url });
      } catch (e) {
        console.warn('Tauri fetch_url_preview failed:', e);
        return null;
      }
    }
    return null;
  },
};
