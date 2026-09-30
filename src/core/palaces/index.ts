/** Palaces shipped with the app: they work offline, without the AI. */
import type { Palace } from '../types';
import { CAPITALS } from './capitals';
import { WORLD_WARS } from './ww';

export { CAPITALS, WORLD_WARS };

/** Built-in palaces, onboarding first. */
export const BUILTIN_PALACES: readonly Palace[] = [CAPITALS, WORLD_WARS];

/** The built-in palace with this id, if any. */
export function getBuiltinPalace(id: string): Palace | undefined {
  return BUILTIN_PALACES.find((p) => p.id === id);
}

/** true if the id belongs to a built-in palace. */
export function isBuiltinPalaceId(id: string): boolean {
  return BUILTIN_PALACES.some((p) => p.id === id);
}
