/** Vite for the Agent Ops e2e run: the real SPA, proxying the API to the e2e Worker (:8812 unless overridden). */
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const PORT = Number(process.env.PLATFORM_E2E_PORT ?? 5192);
const WORKER = `http://127.0.0.1:${process.env.PLATFORM_E2E_WORKER_PORT ?? 8812}`;

export default defineConfig({
  root: fileURLToPath(new URL('../../../', import.meta.url)),
  base: '/repo/invoca/',
  plugins: [react()],
  publicDir: 'static',
  server: { port: PORT, strictPort: true, proxy: { '/repo/invoca/api': workerProxy(WORKER), '/repo/invoca/login': workerProxy(WORKER) } },
});

/**
 * Dev proxy to the Worker. The browser's Origin is the vite server's; the Worker's write guard
 * (src/worker/http.ts) compares it with its own host, which in production is the same origin.
 * Rewrite Origin to the target so the proxy looks like that (Sec-Fetch-Site stays as sent).
 */
function workerProxy(target: string) {
  return {
    target,
    changeOrigin: true,
    configure: (proxy: { on(event: 'proxyReq', fn: (req: { getHeader(n: string): unknown; setHeader(n: string, v: string): void }) => void): void }) =>
      proxy.on('proxyReq', (req) => {
        if (req.getHeader('origin')) req.setHeader('origin', target);
      }),
  };
}
