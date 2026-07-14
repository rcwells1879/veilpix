import path from 'path';
import fs from 'fs';
import { defineConfig, type Plugin } from 'vite';
import tailwindcss from '@tailwindcss/vite';

// The entry stylesheet is small once compressed. Inlining it avoids a
// render-blocking round trip while keeping lazy feature CSS in separate files.
function inlineEntryCss(): Plugin {
  return {
    name: 'inline-entry-css',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const htmlAsset = Object.values(bundle).find(
        (item) => item.type === 'asset' && item.fileName === 'index.html'
      );

      if (!htmlAsset || htmlAsset.type !== 'asset') return;

      let html = typeof htmlAsset.source === 'string'
        ? htmlAsset.source
        : new TextDecoder().decode(htmlAsset.source);
      const stylesheetLinks = html.match(/<link\b[^>]*>/g) || [];

      for (const linkTag of stylesheetLinks) {
        if (!/\brel=["']stylesheet["']/.test(linkTag)) continue;

        const href = linkTag.match(/\bhref=["']([^"']+\.css)["']/)?.[1];
        if (!href) continue;

        const assetPath = new URL(href, 'https://veilpix.invalid').pathname;
        const assetsIndex = assetPath.indexOf('/assets/');
        if (assetsIndex === -1) continue;

        const fileName = assetPath.slice(assetsIndex + 1);
        const cssAsset = bundle[fileName];
        if (!cssAsset || cssAsset.type !== 'asset') continue;

        const css = typeof cssAsset.source === 'string'
          ? cssAsset.source
          : new TextDecoder().decode(cssAsset.source);
        html = html.replace(linkTag, `<style data-veilpix-entry-css>${css}</style>`);
        delete bundle[fileName];
      }

      htmlAsset.source = html;
    },
  };
}

// Plugin to serve static HTML pages from public/ directory
function serveStaticPages() {
  return {
    name: 'serve-static-pages',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Check if URL matches a static page directory in public/
        const staticPages = ['/veilpix/privacy/', '/veilpix/terms/', '/veilpix/blog/'];
        const url = req.url || '';

        for (const page of staticPages) {
          if (url.startsWith(page)) {
            // Map to the public directory file
            const relativePath = url.replace('/veilpix/', '');
            const filePath = path.join(process.cwd(), 'public', relativePath, 'index.html');

            if (fs.existsSync(filePath)) {
              res.setHeader('Content-Type', 'text/html');
              res.end(fs.readFileSync(filePath, 'utf-8'));
              return;
            }
          }
        }
        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
    return {
      base: '/veilpix/',
      plugins: [
        serveStaticPages(),
        tailwindcss(),
        inlineEntryCss(),
      ],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        rollupOptions: {
          output: {
            manualChunks: {
              // Group React and related libraries
              'react-vendor': ['react', 'react-dom'],
              // Group UI libraries
              'ui-vendor': ['react-image-crop'],
              // Group API and data libraries
              'api-vendor': ['@tanstack/react-query', '@clerk/clerk-react'],
            },
          },
        },
        // Increase chunk size warning limit
        chunkSizeWarningLimit: 1000,
        // Enable minification
        minify: 'terser',
        terserOptions: {
          compress: {
            drop_console: mode === 'production',
            drop_debugger: mode === 'production',
          },
        },
      },
      // Performance optimizations
      optimizeDeps: {
        include: ['react', 'react-dom', '@tanstack/react-query'],
        exclude: ['heic-to'], // Exclude heavy library from pre-bundling
      },
    };
});
