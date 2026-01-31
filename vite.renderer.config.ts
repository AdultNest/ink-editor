import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config
export default defineConfig({
  root: path.resolve(__dirname, 'src/renderer'),
  plugins: [react()],
  build: {
    // Output to the correct location that Electron Forge expects
    outDir: path.resolve(__dirname, '.vite/renderer/main_window'),
  },
});
