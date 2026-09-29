import type * as THREE from 'three';
import type { AnimId } from '../core/types';

export type Category = 'animal' | 'person' | 'food' | 'nature' | 'science' | 'object' | 'vehicle' | 'structure';

export interface BuildOpts {
  /** Colour override for the model's main colour (CSS hex). */
  tint?: string;
  /** Text to paint on text-capable models (≤ 24 chars reads well). */
  label?: string;
}

export interface ModelSpec {
  id: string;
  name: string;
  category: Category;
  /** Semantic keywords (English, lower-case): what the model can stand for. Used by the mnemonic composer and the AI prompt. */
  tags: string[];
  /** Sound-alike hooks (English/French syllables or words it can pun on), e.g. avocado → ["avo", "avoca", "avogadro"]. */
  soundsLike: string[];
  /** true if `label` is rendered on the model (sign, flag, scroll, plaque, book). */
  text?: boolean;
  /** Anims that look natural on this model (the composer prefers these). */
  anims: AnimId[];
  build: (o: BuildOpts) => THREE.Group;
  /** Optional self-animation of named joints, called every frame with seconds `t` and intensity k (1 normal, 2 exaggerated). */
  idle?: (root: THREE.Object3D, t: number, k: number) => void;
}

/**
 * Joint naming convention, so generic anims can add secondary motion:
 *  head, tail, wingL, wingR, armL, armR, legFL, legFR, legBL, legBR (quadrupeds) / legL, legR (bipeds),
 *  spin (propellers, wheels, rotors — spun around their local Z unless userData.axis = 'x'|'y'),
 *  lid, hand (clock hands), flame (flickers).
 */
export const JOINTS = ['head', 'tail', 'wingL', 'wingR', 'armL', 'armR', 'legFL', 'legFR', 'legBL', 'legBR', 'legL', 'legR', 'spin', 'lid', 'hand', 'flame'] as const;
