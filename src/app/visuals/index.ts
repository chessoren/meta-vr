import type { VisualFactory } from './api';
import { placeholderVisuals } from './placeholders';

/** The active visual factory. Swapped to the real art modules as they land (see real.ts). */
export let V: VisualFactory = placeholderVisuals;
export function useVisuals(f: VisualFactory) {
  V = f;
}
