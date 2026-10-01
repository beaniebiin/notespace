import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'fs';
import zlib from 'zlib';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        warmup: {
          clientFiles: ['./App.tsx', './components/TiptapEditor.tsx', './index.tsx'],
        },
      },
      optimizeDeps: {
        include: ['react', 'react-dom', 'react-markdown', '@tiptap/react', '@tiptap/starter-kit'],
        exclude: ['@google/genai'],
      },
      plugins: [
        react(), 
        tailwindcss(),
        {
          name: 'post-build-assets',
          closeBundle() {
            const distDir = path.resolve('dist');
            if (!fs.existsSync(distDir)) {
              fs.mkdirSync(distDir, { recursive: true });
            }
            const dirs = ['dist/data', 'dist/data/notes', 'dist/data/images', 'dist/data/snapshots'];
            dirs.forEach(dir => {
              if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
              }
            });

            // gzip/brotli for single-file core2s.js / core2s.css (Windows-safe)
            const compressTargets = [
              path.resolve('dist/core2s.js'),
              path.resolve('dist/core2s.css'),
            ];
            for (const fullPath of compressTargets) {
              if (!fs.existsSync(fullPath)) continue;
              try {
                const content = fs.readFileSync(fullPath);
                if (content.length < 1024) continue;
                const gz = zlib.gzipSync(content, { level: 9 });
                fs.writeFileSync(fullPath + '.gz', gz);
                const br = zlib.brotliCompressSync(content, {
                  params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } as any,
                });
                fs.writeFileSync(fullPath + '.br', br);
                console.log(`Compressed ${path.relative('dist', fullPath)} -> .gz (${(gz.length/1024).toFixed(1)}KB) .br (${(br.length/1024).toFixed(1)}KB)`);
              } catch (e) {
                console.warn(`Failed to compress ${fullPath}:`, e);
              }
            }

            // .htaccess for single-file immutable cache + precompressed serving
            const htaccess = `# NoteSpace - single file core2s.js/core2s.css\n<IfModule mod_rewrite.c>\n  RewriteEngine On\n  RewriteCond %{HTTP:Accept-Encoding} br\n  RewriteCond %{REQUEST_FILENAME}.br -f\n  RewriteRule ^(.*)\\.(js|css)$ $1.$2.br [L]\n  RewriteCond %{HTTP:Accept-Encoding} gzip\n  RewriteCond %{REQUEST_FILENAME}.gz -f\n  RewriteRule ^(.*)\\.(js|css)$ $1.$2.gz [L]\n</IfModule>\n<IfModule mod_headers.c>\n  <FilesMatch \"\\.js\\.br$\">\n    Header set Content-Encoding br\n    Header set Content-Type application/javascript\n  </FilesMatch>\n  <FilesMatch \"\\.css\\.br$\">\n    Header set Content-Encoding br\n    Header set Content-Type text/css\n  </FilesMatch>\n  <FilesMatch \"\\.js\\.gz$\">\n    Header set Content-Encoding gzip\n    Header set Content-Type application/javascript\n  </FilesMatch>\n  <FilesMatch \"\\.css\\.gz$\">\n    Header set Content-Encoding gzip\n    Header set Content-Type text/css\n  </FilesMatch>\n</IfModule>\n<IfModule mod_expires.c>\n  ExpiresActive On\n  ExpiresByType application/javascript \"access plus 1 year\"\n  ExpiresByType text/css \"access plus 1 year\"\n</IfModule>\n`;
            fs.writeFileSync(path.resolve('dist/.htaccess'), htaccess);
            console.log('Generated dist/.htaccess (single-file)');
          }
        }
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        minify: 'esbuild',
        cssMinify: true,
        outDir: 'dist',
        emptyOutDir: true,
        manifest: false,
        reportCompressedSize: true,
        chunkSizeWarningLimit: 1000,
        cssCodeSplit: false,
        rollupOptions: {
          input: path.resolve(__dirname, 'index.html'),
          output: {
            entryFileNames: 'core2s.js',
            chunkFileNames: 'core2s.js',
            assetFileNames: (assetInfo) => {
              if (assetInfo.name && assetInfo.name.endsWith('.css')) {
                return 'core2s.css';
              }
              return 'assets/[name].[ext]';
            },
          }
        }
      }
    };
});
