import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results/.pw',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_PROD ? 'http://localhost:5177' : 'http://localhost:5176',
    viewport: { width: 1280, height: 800 },
    launchOptions: {
      executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium',
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
    },
  },
  webServer: {
    // E2E_PROD=1: test a frozen production build (vite build → preview), immune to edits in progress.
    command: process.env.E2E_PROD ? 'npx vite build --outDir dist-e2e --emptyOutDir && npx vite preview --outDir dist-e2e --port 5177 --strictPort' : 'npx vite --config vite.test.config.ts',
    port: process.env.E2E_PROD ? 5177 : 5176,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
