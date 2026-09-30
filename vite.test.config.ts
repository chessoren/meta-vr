import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config';

/** E2E server: no HMR, no file watching — edits elsewhere never reload a running test. */
export default mergeConfig(
  base,
  defineConfig({
    server: { hmr: false, watch: { ignored: ['**/*'] }, port: 5176, strictPort: true },
  }),
);
