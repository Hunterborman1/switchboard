/** Vite for the Agent Ops e2e run: the real SPA, proxying the API to the e2e Worker on :8812. */
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: fileURLToPath(new URL('../../../', import.meta.url)),
  base: '/repo/invoca/',
  plugins: [react()],
  publicDir: 'static',
  server: { port: 5192, strictPort: true, proxy: { '/repo/invoca/api': 'http://127.0.0.1:8812', '/repo/invoca/login': 'http://127.0.0.1:8812' } },
});
