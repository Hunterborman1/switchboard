import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/repo/invoca/',
  plugins: [react()],
  publicDir: 'static',
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 900 },
  server: { port: 5178, proxy: { '/repo/invoca/api': 'http://127.0.0.1:8797', '/repo/invoca/login': 'http://127.0.0.1:8797' } },
});
