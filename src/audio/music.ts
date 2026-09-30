/**
 * Loci's one musical key: D major pentatonic (D E F# A B).
 * Every pitched sound in the app — cues, the 24 object signatures, the flame's sung voice — is
 * drawn from this scale, so anything that overlaps harmonises instead of clashing.
 */

/** D4 in Hz (A4 = 440, equal temperament). */
export const D4 = 293.6647679;

/** Semitone offsets of the pentatonic degrees from D. */
export const PENTA = [0, 2, 4, 7, 9] as const;

/** Pentatonic step → semitones from D4. Step 0 = D4, 5 = D5, -5 = D3, 3 = A4… */
export function pentaSemis(step: number): number {
  const s = Math.round(step);
  const oct = Math.floor(s / 5);
  const deg = ((s % 5) + 5) % 5;
  return oct * 12 + PENTA[deg];
}

/** Pentatonic step → frequency in Hz. */
export const pentaHz = (step: number): number => D4 * Math.pow(2, pentaSemis(step) / 12);

/**
 * Playback-rate ratio that transposes a sound by `steps` pentatonic steps (staying in key).
 * Use it for `play('scanPing', at, { pitch: pentatonicRatio(i) })`.
 */
export const pentatonicRatio = (steps: number): number => Math.pow(2, pentaSemis(steps) / 12);

/** Note name ("D4", "F#5", "A3") → Hz. */
export function noteHz(name: string): number {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  const base: Record<string, number> = { C: -2, D: 0, E: 2, F: 3, G: 5, A: 7, B: 9 };
  const semis = base[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) - 4) * 12;
  return D4 * Math.pow(2, semis / 12);
}
