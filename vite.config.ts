import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'node:path';
import { devApiMiddleware } from './server/dev-middleware';

/** Serves /api/* from the same handlers Vercel runs, so `npm run dev` and e2e tests are full-stack. */
function localApi(): Plugin {
  return {
    name: 'loci-local-api',
    configureServer(server) {
      server.middlewares.use(devApiMiddleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(devApiMiddleware());
    },
  };
}

export default defineConfig({
  plugins: [localApi()],
  resolve: {
    alias: { '@core': resolve(__dirname, 'src/core') },
    dedupe: ['three'],
  },
  server: { host: '0.0.0.0', port: 5173 },
  preview: { host: '0.0.0.0', port: 4173 },
  build: {
    outDir: 'dist',
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      input: {
        landing: resolve(__dirname, 'index.html'),
        app: resolve(__dirname, 'app/index.html'),
        import: resolve(__dirname, 'import/index.html'),
        gallery: resolve(__dirname, 'gallery/index.html'),
      },
    },
  },
  optimizeDeps: {
    exclude: ['@babylonjs/havok', '@lichess-org/vosk-browser'],
  },
  worker: { format: 'es' },
});
