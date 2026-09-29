// Screenshot any Loci page headlessly: node scripts/shoot.mjs "/gallery/?id=kangaroo&t=1" out.png [width height]
// Requires the dev server (npx vite --port 5174) to be running, or set BASE.
import { chromium } from '@playwright/test';
const [, , path = '/gallery/', out = 'test-results/shot.png', w = '1280', h = '800'] = process.argv;
const base = process.env.BASE ?? 'http://localhost:5174';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await p.goto(base + path);
await p.waitForFunction(() => window.__galleryReady || window.__shotReady, null, { timeout: 60000 }).catch(() => errors.push('timeout waiting for ready flag'));
await p.waitForTimeout(300);
await p.screenshot({ path: out });
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
console.log('saved', out);
await b.close();
