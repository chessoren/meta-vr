/**
 * Loci — the 24 object signatures.
 *
 * Every object in the palace owns one sound: a timbre family (8 families of real-world
 * instruments) × a short pentatonic motif (24 distinct motifs) × a register. The same object
 * always sounds the same wherever it is heard (select, place, reveal), so the learner's auditory
 * memory reinforces the spatial one. All motifs are in D major pentatonic so neighbours harmonise.
 */
import { addAir, addNoiseBurst, alloc, mulberry32, type Rng } from './dsp';
import { FAMILIES, sparkle, strike, woodTock, type Family } from './instruments';
import { pentaHz } from './music';

export type ObjectVoiceKind = 'select' | 'reveal' | 'place';
export const OBJECT_VOICE_COUNT = 24;

/** [pentatonic step offset, beat, velocity]. */
type MotifNote = readonly [step: number, beat: number, vel: number];

const MOTIFS: readonly (readonly MotifNote[])[] = [
  [[0, 0, 0.8], [2, 1, 0.7], [4, 2, 0.85]],
  [[4, 0, 0.85], [2, 1, 0.7], [0, 2.5, 0.8]],
  [[0, 0, 0.8], [4, 1, 0.85], [3, 2, 0.7]],
  [[0, 0, 0.75], [0, 1, 0.65], [5, 2, 0.9]],
  [[2, 0, 0.8], [0, 1, 0.65], [2, 2, 0.7], [4, 3, 0.85]],
  [[5, 0, 0.9], [3, 1.5, 0.75]],
  [[0, 0, 0.8], [3, 1, 0.75], [2, 1.5, 0.65], [0, 2.5, 0.8]],
  [[1, 0, 0.75], [3, 1, 0.75], [5, 2, 0.9]],
  [[0, 0, 0.85], [5, 1.5, 0.85]],
  [[3, 0, 0.8], [4, 0.5, 0.65], [3, 1, 0.7], [1, 2, 0.8]],
  [[0, 0, 0.75], [1, 0.6, 0.65], [2, 1.2, 0.7], [4, 2.2, 0.9]],
  [[4, 0, 0.8], [5, 1, 0.85], [2, 2, 0.75]],
  [[2, 0, 0.8], [4, 1, 0.8], [0, 2, 0.8]],
  [[0, 0, 0.8], [2, 0.5, 0.65], [0, 1, 0.65], [3, 2, 0.85]],
  [[5, 0, 0.85], [4, 0.5, 0.7], [2, 1, 0.7], [0, 1.5, 0.8]],
  [[0, 0, 0.75], [3, 1, 0.75], [5, 2, 0.85], [3, 3, 0.7]],
  [[1, 0, 0.8], [0, 1, 0.7], [3, 2, 0.85]],
  [[3, 0, 0.85], [0, 1, 0.7], [3, 1.6, 0.8]],
  [[0, 0, 0.8], [4, 0.8, 0.85], [4, 1.4, 0.7]],
  [[2, 0, 0.7], [3, 0.5, 0.72], [4, 1, 0.76], [5, 1.5, 0.9]],
  [[4, 0, 0.85], [1, 1, 0.7], [2, 2, 0.75]],
  [[0, 0, 0.8], [2, 1, 0.7], [1, 2, 0.65], [4, 3, 0.85]],
  [[3, 0, 0.8], [5, 1, 0.9], [0, 2.5, 0.75]],
  [[5, 0, 0.85], [2, 1, 0.7], [3, 1.5, 0.7], [0, 2.5, 0.8]],
];

interface FamilyTraits { base: number; beat: number; tail: number; hold: number }
const TRAITS: Record<Family, FamilyTraits> = {
  glassBell: { base: 5, beat: 0.13, tail: 1.9, hold: 0 },
  marimba: { base: 0, beat: 0.12, tail: 1.0, hold: 0 },
  musicBox: { base: 7, beat: 0.12, tail: 1.4, hold: 0 },
  softGong: { base: -2, beat: 0.2, tail: 2.6, hold: 0 },
  harp: { base: 2, beat: 0.13, tail: 1.9, hold: 0 },
  kalimba: { base: 3, beat: 0.12, tail: 1.1, hold: 0 },
  feltPiano: { base: 0, beat: 0.14, tail: 1.9, hold: 0 },
  bottle: { base: 3, beat: 0.2, tail: 0.7, hold: 0.22 },
};
const ROW_SHIFT = [0, 3, -2];

export interface ObjectVoiceInfo {
  index: number;
  family: Family;
  /** Absolute pentatonic steps (0 = D4) of the motif. */
  steps: number[];
  /** Onset times in seconds. */
  times: number[];
  freqs: number[];
}

export function objectVoiceInfo(index: number): ObjectVoiceInfo {
  const i = ((Math.round(index) % OBJECT_VOICE_COUNT) + OBJECT_VOICE_COUNT) % OBJECT_VOICE_COUNT;
  const family = FAMILIES[i % FAMILIES.length];
  const tr = TRAITS[family];
  const base = tr.base + ROW_SHIFT[Math.floor(i / FAMILIES.length)];
  const motif = MOTIFS[i];
  const steps = motif.map(([s]) => base + s);
  return { index: i, family, steps, times: motif.map(([, b]) => b * tr.beat), freqs: steps.map(pentaHz) };
}

function playMotif(out: Float32Array, sr: number, rng: Rng, info: ObjectVoiceInfo, start: number, tempo: number, gain: number, stepShift = 0): number {
  const tr = TRAITS[info.family];
  const motif = MOTIFS[info.index];
  let last = 0;
  motif.forEach(([, , vel], k) => {
    const t = start + info.times[k] * tempo;
    strike(info.family, out, sr, t, pentaHz(info.steps[k] + stepShift), vel * gain, rng, tr.hold + (k === motif.length - 1 ? 0.15 : 0));
    last = t;
  });
  return last;
}

/** Length (s) of the rendered buffer before trimming. */
export function objectVoiceDuration(index: number, kind: ObjectVoiceKind): number {
  const info = objectVoiceInfo(index);
  const tr = TRAITS[info.family];
  const last = info.times[info.times.length - 1];
  if (kind === 'select') return last + tr.tail;
  if (kind === 'place') return 0.06 + last * 1.12 + tr.tail;
  return last + 0.1 + last * 0.85 + tr.tail + 0.3;
}

/** Render object #index's signature (mono, un-normalised; render.ts normalises). */
export function renderObjectVoiceRaw(index: number, kind: ObjectVoiceKind, sr: number): Float32Array {
  const info = objectVoiceInfo(index);
  const out = alloc(sr, objectVoiceDuration(index, kind));
  const rng = mulberry32(0x5eed + info.index * 1009 + (kind === 'select' ? 0 : kind === 'place' ? 1 : 2));
  if (kind === 'select') {
    playMotif(out, sr, rng, info, 0, 1, 1);
  } else if (kind === 'place') {
    const root = pentaHz(Math.min(info.steps[0], 0) - 5);
    woodTock(out, sr, rng, 0, Math.max(110, root), 0.3, 0.28);
    addNoiseBurst(out, sr, rng, 0, 0.06, 0.3, { type: 'lowpass', freq: 360 }, 0.001);
    playMotif(out, sr, rng, info, 0.06, 1.12, 1);
  } else {
    const last = playMotif(out, sr, rng, info, 0, 1, 1);
    const echoStart = last + 0.1;
    playMotif(out, sr, rng, info, echoStart, 0.85, 0.5, 5);
    sparkle(out, sr, rng, echoStart, 0.6, 5, 12, 16, 0.05, 'down');
    addAir(out, sr, rng, 0, echoStart + 0.4, 0.05, (u) => Math.sin(Math.PI * u) ** 2, (u) => 900 + 2500 * u, 1.3);
  }
  return out;
}
