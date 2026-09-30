import { uid } from '../src/core/ids';

/** Cryptographically random float in [0, 1). */
export function random01(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
}

/** Random id such as "n_k3j9x0q2ab". */
export const newId = (prefix: string) => uid(prefix, random01);
