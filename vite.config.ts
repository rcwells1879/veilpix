import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';

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
    const env = loadEnv(mode, '.', '');
    return {
      base: '/veilpix/',
      plugins: [
        serveStaticPages(),
        tailwindcss(),
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
        rollupOptions: {
          output: {
            manualChunks: {
              // Group React and related libraries
              'react-vendor': ['react', 'react-dom'],
              // Group UI libraries
              'ui-vendor': ['react-image-crop'],
              // Group API and data libraries
              'api-vendor': ['@tanstack/react-query', '@clerk/clerk-react'],
              // Group AI and utility libraries
              'ai-vendor': ['@google/genai'],
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
