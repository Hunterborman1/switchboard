import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const WORKER = `http://127.0.0.1:${process.env.WORKER_PORT ?? 8797}`;

export default defineConfig({
  base: '/repo/invoca/',
  plugins: [react()],
  publicDir: 'static',
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 900 },
  server: { port: Number(process.env.VITE_PORT ?? 5178), proxy: { '/repo/invoca/api': workerProxy(WORKER), '/repo/invoca/login': workerProxy(WORKER) } },
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
