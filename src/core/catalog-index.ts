/**
 * Pure-data mirror of the procedural model catalog (src/lib3d/catalog.ts), usable without Three.js:
 * by the server (AI prompt, scene validation), the offline mnemonic composer and tests.
 *
 * One entry per id of `REQUIRED_IDS`. `tags` say what a model can *mean* (symbols, historical
 * associations, idioms); `soundsLike` lists syllables it can *pun* on, in English and French
 * (lower-case, no accents), e.g. avocado → "avo" (Avogadro).
 *
 * The data lives in catalog-data.generated.ts (regenerate with `node scripts/gen-catalog-index.mjs`).
 */
import type { AnimId } from './types';
import { CATALOG_DATA } from './catalog-data.generated';

export type CatalogCategory = 'animal' | 'person' | 'food' | 'nature' | 'science' | 'object' | 'vehicle' | 'structure';

export interface CatalogEntry {
  id: string;
  name: string;
  category: CatalogCategory;
  tags: string[];
  soundsLike: string[];
  /** true if the model renders a `label` (sign, plaque, scroll, flag, book). */
  text?: boolean;
  /** Anims that look natural on this model (first = preferred). */
  anims: AnimId[];
}

/** Generated from the real model specs (scripts/gen-catalog-index.mjs); a unit test guards drift. */
export const CATALOG_INDEX: CatalogEntry[] = CATALOG_DATA;

const BY_ID = new Map(CATALOG_INDEX.map((c) => [c.id, c]));

/** Entry of a model id (undefined when unknown). */
export function catalogEntry(id: string): CatalogEntry | undefined {
  return BY_ID.get(id);
}

/** true if the id is a known model. */
export function isCatalogId(id: unknown): id is string {
  return typeof id === 'string' && BY_ID.has(id);
}

/** Ids of the label-capable models (sign, plaque, scroll, flag, book). */
export const TEXT_MODEL_IDS: string[] = CATALOG_INDEX.filter((c) => c.text).map((c) => c.id);

/** true if the model can carry a `label`. */
export function isTextModel(id: string): boolean {
  return !!BY_ID.get(id)?.text;
}
