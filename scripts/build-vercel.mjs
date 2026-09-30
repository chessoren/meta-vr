// Builds a Vercel "Build Output API" v3 bundle in .vercel/output:
//   static/                 ← vite build (landing, /app, /import, /gallery, /audio)
//   functions/api.func/     ← the whole API bundled into one ESM file (no extension-less imports at runtime)
//   config.json             ← routes: /ABCD → phone import, /api/* → function, headers for /app
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

const out = '.vercel/output';
rmSync(out, { recursive: true, force: true });
execSync('npx vite build', { stdio: 'inherit' });
mkdirSync(`${out}/static`, { recursive: true });
cpSync('dist', `${out}/static`, { recursive: true });

const fn = `${out}/functions/api.func`;
mkdirSync(fn, { recursive: true });
await build({
  entryPoints: ['server/vercel-entry.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: `${fn}/index.mjs`,
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
  logLevel: 'info',
});
writeFileSync(`${fn}/.vc-config.json`, JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 60 }, null, 2));
writeFileSync(`${fn}/package.json`, JSON.stringify({ type: 'module' }));

writeFileSync(
  `${out}/config.json`,
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '^/app/(.*)$', headers: { 'Permissions-Policy': 'microphone=(self), xr-spatial-tracking=(self)' }, continue: true },
        { src: '^/(assets/.*)$', headers: { 'cache-control': 'public, max-age=31536000, immutable' }, continue: true },
        { src: '^/api/(.*)$', dest: '/api?__path=$1' },
        { handle: 'filesystem' },
        { src: '^/([A-Za-z]{4})/?$', dest: '/import/index.html?c=$1' },
      ],
    },
    null,
    2,
  ),
);
console.log('✓ .vercel/output ready');
