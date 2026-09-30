/**
 * Test helpers for src/core. REQUIRED_IDS is read from src/lib3d/catalog.ts as TEXT so core tests
 * never import Three.js (and keep passing while the 3D models are being built).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function requiredIds(): string[] {
  const src = readFileSync(resolve(__dirname, '../../../src/lib3d/catalog.ts'), 'utf8');
  const block = /export const REQUIRED_IDS = \{([\s\S]*?)\} as const;/.exec(src);
  if (!block) throw new Error('REQUIRED_IDS not found in src/lib3d/catalog.ts');
  return [...block[1].matchAll(/'([a-z0-9_-]+)'/g)].map((m) => m[1]);
}
