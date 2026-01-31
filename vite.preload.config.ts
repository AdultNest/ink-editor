import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        // Override the entry filename to avoid collision with main's index.js
        entryFileNames: 'preload.js',
      },
    },
  },
});
