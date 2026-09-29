# Loci

Mixed-reality memory palace for Meta Quest / Meta VR Glasses (WebXR + Immersive Web SDK).

- Product: `docs/BRIEF.md`. Engineering contract & rules: `docs/ARCHITECTURE.md` — read both before editing.
- Import Three.js as `import * as THREE from 'three'` (aliased to super-three, same instance as `@iwsdk/core`).
- Checks: `npx tsc --noEmit`, `npx vitest run`, `npx playwright test` (IWER emulator, headless Chromium at /opt/pw-browsers/chromium).
- Screenshots: `node scripts/shoot.mjs "/gallery/?id=apple&t=1" out.png` (dev server on :5174).
