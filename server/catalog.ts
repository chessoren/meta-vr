/** Server-side view of the model catalog (pure data mirror from src/core/catalog-index.ts). */
import type { AnimId } from '../src/core/types';
import { CATALOG_INDEX } from '../src/core/catalog-index';

type Entry = (typeof CATALOG_INDEX)[number];

/** Every AnimId, checked for exhaustiveness at compile time. */
const ANIM_SET: Record<AnimId, true> = {
  idle: true,
  bounce: true,
  spin: true,
  wobble: true,
  orbit: true,
  juggle: true,
  float: true,
  shake: true,
  grow: true,
  march: true,
  fly: true,
  rain: true,
  stack: true,
  flip: true,
  dance: true,
};
export const ANIMS = Object.keys(ANIM_SET) as AnimId[];
export const isAnim = (a: unknown): a is AnimId => typeof a === 'string' && Object.prototype.hasOwnProperty.call(ANIM_SET, a);

const byId = new Map<string, Entry>(CATALOG_INDEX.map((e) => [e.id, e]));
export const MODEL_IDS: string[] = CATALOG_INDEX.map((e) => e.id);
export const isModel = (id: unknown): id is string => typeof id === 'string' && byId.has(id);
export const modelEntry = (id: string): Entry | undefined => byId.get(id);
/** Models that can carry a painted label (sign, plaque, flag, scroll, book…). */
export const isTextModel = (id: string): boolean => !!byId.get(id)?.text;

/**
 * Compact catalog for the prompt, one model per line:
 *   id | tags | sounds-like | T (label-capable) | natural anims
 * Sorted by category so the prompt prefix is byte-stable (prompt caching).
 */
export function compactCatalog(): string {
  const lines = [...CATALOG_INDEX]
    .sort((a, b) => (a.category + a.id).localeCompare(b.category + b.id))
    .map((e) => {
      const tags = (e.tags ?? []).slice(0, 8).join(',');
      const sl = (e.soundsLike ?? []).slice(0, 6).join(',');
      const anims = (e.anims ?? []).slice(0, 4).join(',');
      return `${e.id} | ${tags} | ${sl || '-'} | ${e.text ? 'T' : '-'} | ${anims || 'idle'}`;
    });
  return lines.join('\n');
}
