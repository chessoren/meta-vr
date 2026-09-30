import { describe, it, expect } from 'vitest';
import { CATALOG } from '../../src/lib3d/catalog';
import { CATALOG_INDEX } from '../../src/core/catalog-index';

/** The server/AI/offline catalog must describe exactly the models that exist. */
describe('catalog index ↔ model library', () => {
  it('has the same ids, text flags and anims as the real specs (run node scripts/gen-catalog-index.mjs)', () => {
    const idx = new Map(CATALOG_INDEX.map((e) => [e.id, e]));
    expect(CATALOG_INDEX.length).toBe(CATALOG.length);
    for (const s of CATALOG) {
      const e = idx.get(s.id);
      expect(e, s.id).toBeDefined();
      expect(!!e!.text, `${s.id}.text`).toBe(!!s.text);
      expect(e!.anims, `${s.id}.anims`).toEqual(s.anims);
      expect(e!.tags.length, `${s.id}.tags`).toBeGreaterThanOrEqual(Math.min(8, s.tags.length));
    }
  });
});
