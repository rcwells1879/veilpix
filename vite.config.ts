import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      base: '/veilpix/',
      plugins: [
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
