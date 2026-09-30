import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config';

/**
 * E2E server: no HMR, no file watching — edits elsewhere never reload a running test — and a
 * full dependency crawl up-front so late-discovered deps never trigger an optimizer reload.
 */
export default mergeConfig(
  base,
  defineConfig({
    server: { hmr: false, watch: { ignored: ['**/*'] }, port: 5176, strictPort: true },
    optimizeDeps: {
      entries: ['index.html', 'app/index.html', 'import/index.html', 'gallery/index.html', 'src/**/*.ts'],
      include: ['iwer', '@iwer/sem', 'qrcode-generator'],
    },
  }),
);
