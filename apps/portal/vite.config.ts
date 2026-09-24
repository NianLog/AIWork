import legacy from '@vitejs/plugin-legacy';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), legacy({ targets: ['iOS >= 12', 'Android >= 5'] })],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    cors: false,
  },
  preview: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    cors: false,
  },
});
