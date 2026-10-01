import { useState, useEffect } from 'react';
import { localFileAdapter } from './localFileAdapter';
import { v4 as uuidv4 } from 'uuid';

export interface StoredImage {
  filename: string;
  url: string; // Relative path "images/filename.webp"
  size: number;
  modified: number;
}

const CATALOG_PATH = 'images_catalog.json';

export const imageStorageService = {
  /**
   * Get all locally stored images from catalog
   */
  getStoredImages: async (): Promise<StoredImage[]> => {
    try {
      const raw = await localFileAdapter.readTextFile(CATALOG_PATH);
      if (!raw) return [];
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        return data;
      }
      return [];
    } catch (e) {
      console.warn('Failed to load images catalog:', e);
      return [];
    }
  },

  /**
   * Compress file to WebP and persist directly as a binary file in data/images/
   */
  compressAndStoreImage: async (file: File): Promise<StoredImage> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = async () => {
          try {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            const maxDim = 1920;
            if (width > maxDim || height > maxDim) {
              if (width > height) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
              } else {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
              }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              reject(new Error('Canvas 2D context not available'));
              return;
            }
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob(async (blob) => {
              if (!blob) {
                reject(new Error('Failed to create WebP blob'));
                return;
              }

              try {
                const arrayBuffer = await blob.arrayBuffer();
                const uint8Array = new Uint8Array(arrayBuffer);

                const baseName = file.name
                  .replace(/\.[^/.]+$/, '')
                  .replace(/[^a-zA-Z0-9_\-\uAC00-\uD7A3]/g, '_')
                  .slice(0, 40);
                const filename = `img-${Date.now()}-${uuidv4().slice(0, 8)}.webp`;
                const relativePath = `images/${filename}`;

                // Write binary file to data/images/<filename>
                const written = await localFileAdapter.writeBinaryFile(relativePath, uint8Array);
                if (!written) {
                  console.warn('Local binary write returned false, will still register image');
                }

                const record: StoredImage = {
                  filename,
                  url: relativePath,
                  size: blob.size,
                  modified: Date.now(),
                };

                // Save metadata to catalog (compact without large base64!)
                const images = await imageStorageService.getStoredImages();
                const updated = [record, ...images.filter((item) => item.filename !== filename)];
                await localFileAdapter.writeTextFile(CATALOG_PATH, JSON.stringify(updated));

                resolve(record);
              } catch (err) {
                reject(err);
              }
            }, 'image/webp', 0.85);
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = () => reject(new Error('Failed to load image element'));
        img.src = event.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read image file'));
      reader.readAsDataURL(file);
    });
  },

  /**
   * Delete an image from local catalog and disk
   */
  deleteStoredImage: async (filename: string): Promise<boolean> => {
    try {
      const images = await imageStorageService.getStoredImages();
      const updated = images.filter((img) => img.filename !== filename);
      await localFileAdapter.writeTextFile(CATALOG_PATH, JSON.stringify(updated));
      await localFileAdapter.removeFile(`images/${filename}`);
      return true;
    } catch (e) {
      console.error('Failed to delete image:', e);
      return false;
    }
  },

  /**
   * Resolve an image src (relative path "images/xxx.webp" or URL) to a renderable Object URL
   */
  resolveImageUrl: async (src: string): Promise<string> => {
    if (!src) return '';
    // If it's already an external HTTP, data URL, or blob URL, return as-is
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:') || src.startsWith('blob:')) {
      return src;
    }

    const cleanPath = src.replace(/^\.\//, '');
    return await localFileAdapter.resolveImageBlobUrl(cleanPath);
  },

  /**
   * Automatically migrate embedded Base64 images in markdown text to local WebP files in data/images/
   */
  extractBase64ImagesToFiles: async (markdown: string): Promise<string> => {
    if (!markdown || !markdown.includes('data:image/')) return markdown;

    const base64Regex = /(src="|\]\()(data:image\/([a-zA-Z0-9\-\+\.]+);base64,([^"\)]+))(["\)])/g;
    let match: RegExpExecArray | null;
    let result = markdown;

    // Collect all matches
    const matches: Array<{ full: string; prefix: string; dataUrl: string; mimeExt: string; b64: string; suffix: string }> = [];
    while ((match = base64Regex.exec(markdown)) !== null) {
      matches.push({
        full: match[0],
        prefix: match[1],
        dataUrl: match[2],
        mimeExt: match[3],
        b64: match[4],
        suffix: match[5],
      });
    }

    if (matches.length === 0) return markdown;

    const catalog = await imageStorageService.getStoredImages();
    let catalogModified = false;

    for (const m of matches) {
      try {
        // Convert base64 to Uint8Array
        const binStr = atob(m.b64);
        const len = binStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binStr.charCodeAt(i);
        }

        const filename = `img-${Date.now()}-${uuidv4().slice(0, 8)}.webp`;
        const relativePath = `images/${filename}`;

        await localFileAdapter.writeBinaryFile(relativePath, bytes);

        // Replace all instances of this exact dataUrl in markdown with the clean relative path
        result = result.split(m.dataUrl).join(relativePath);

        // Add to catalog
        catalog.unshift({
          filename,
          url: relativePath,
          size: len,
          modified: Date.now(),
        });
        catalogModified = true;
      } catch (err) {
        console.warn('Failed to extract base64 image to file:', err);
      }
    }

    if (catalogModified) {
      // Clean up catalog of any old base64 strings
      const sanitizedCatalog = catalog.map((item) => {
        if (item.url.startsWith('data:')) {
          return { ...item, url: `images/${item.filename}` };
        }
        return item;
      });
      await localFileAdapter.writeTextFile(CATALOG_PATH, JSON.stringify(sanitizedCatalog));
    }

    return result;
  },
};

/**
 * React hook to reactively resolve local image file paths to displayable Object URLs
 */
export function useResolvedImageUrl(src: string | null | undefined): string {
  const [resolved, setResolved] = useState<string>(src || '');

  useEffect(() => {
    if (!src) {
      setResolved('');
      return;
    }

    // Direct URLs (external, data, blob) can be used immediately
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:') || src.startsWith('blob:')) {
      setResolved(src);
      return;
    }

    let isMounted = true;
    imageStorageService.resolveImageUrl(src).then((url) => {
      if (isMounted) {
        setResolved(url);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [src]);

  return resolved;
}
