/**
 * Loci — procedural instruments (pure; they add into a mono Float32Array at a start time).
 *
 * Mostly modal synthesis (sums of exponentially-decaying partials with measured-ish ratios of
 * real objects), Karplus–Strong for the harp, formant-filtered detuned saws for pads/choir and
 * shaped noise for air. Everything is soft-attacked and warm: no raw square/saw ever reaches
 * the output unfiltered.
 */
import {
  addMode, addNoiseBurst, addPluck, addTone, addAir, Biquad, OnePole, TAU, clamp, rand, riseAt, sawBlep, type Rng,
} from './dsp';
import { pentaHz } from './music';

export type Family =
  | 'glassBell' | 'marimba' | 'musicBox' | 'softGong' | 'harp' | 'kalimba' | 'feltPiano' | 'bottle';

export const FAMILIES: readonly Family[] = [
  'glassBell', 'marimba', 'musicBox', 'softGong', 'harp', 'kalimba', 'feltPiano', 'bottle',
];

type Partial = readonly [ratio: number, amp: number, t60: number];

function modes(out: Float32Array, sr: number, start: number, f: number, amp: number, parts: readonly Partial[], attack: number, rng?: Rng): void {
  for (const [r, a, t] of parts) addMode(out, sr, start, f * r, amp * a, t, attack, rng ? rng() * TAU : 0);
}

/**
 * Strike / pluck / blow one note of an object-signature family.
 * `vel` 0..1 (loudness & brightness), `hold` = sustain length for blown notes.
 */
export function strike(fam: Family, out: Float32Array, sr: number, start: number, f: number, vel: number, rng: Rng, hold = 0.35): void {
  const v = clamp(vel, 0.05, 1);
  switch (fam) {
    case 'glassBell':
      modes(out, sr, start, f, 0.34 * v, [
        [1, 1, 2.6], [1.0017, 0.5, 2.6], [2.405, 0.28 * v, 1.2], [4.33, 0.11 * v, 0.6], [6.7, 0.05 * v, 0.3],
      ], 0.0016, rng);
      break;
    case 'marimba': {
      const T = clamp(1.1 * Math.sqrt(440 / f), 0.35, 1.4);
      modes(out, sr, start, f, 0.42 * v, [
        [1, 1, T], [1.0011, 0.3, T * 1.25], [3.93, 0.26 * v, T * 0.28], [9.2, 0.05 * v, T * 0.1],
      ], 0.002, rng);
      addNoiseBurst(out, sr, rng, start, 0.014, 0.05 * v, { type: 'lowpass', freq: 1100 });
      break;
    }
    case 'musicBox':
      modes(out, sr, start, f, 0.3 * v, [
        [1, 1, 1.7], [1.0009, 0.35, 1.7], [6.27, 0.2 * v, 0.35], [17.55, 0.04 * v, 0.08],
      ], 0.0009, rng);
      addNoiseBurst(out, sr, rng, start, 0.004, 0.035 * v, { type: 'highpass', freq: 4500 });
      break;
    case 'softGong':
      modes(out, sr, start, f, 0.3 * v, [
        [0.5, 0.16, 3.0], [1, 1, 3.6], [1.003, 0.45, 3.6], [1.52, 0.42, 2.4], [2.03, 0.33, 2.0],
        [2.61, 0.18, 1.4], [3.17, 0.1, 1.0], [3.9, 0.05, 0.7],
      ], 0.02, rng);
      break;
    case 'harp': {
      const T = clamp(2.4 * Math.pow(220 / f, 0.4), 0.8, 3);
      addPluck(out, sr, start, f, 0.35 * v, T, 0.3 + 0.3 * v, rng, 0.13);
      addMode(out, sr, start, f, 0.1 * v, T * 0.6, 0.004);
      break;
    }
    case 'kalimba':
      modes(out, sr, start, f, 0.4 * v, [
        [1, 1, 1.25], [2.0, 0.07, 0.4], [3.0, 0.06, 0.3], [5.92, 0.28 * v, 0.13],
      ], 0.0005, rng);
      addNoiseBurst(out, sr, rng, start, 0.02, 0.1 * v, { type: 'lowpass', freq: 520 }, 0.001);
      break;
    case 'feltPiano':
      feltPiano(out, sr, start, f, 0.36 * v, v, rng);
      break;
    case 'bottle':
      bottle(out, sr, start, f, 0.42 * v, hold, rng);
      break;
  }
}

/** Soft, felted upright: slightly inharmonic, unison-detuned partials, muted treble, hammer thump. */
export function feltPiano(out: Float32Array, sr: number, start: number, f: number, amp: number, vel: number, rng: Rng): void {
  const B = 0.00035;
  const T = clamp(3.4 * Math.pow(260 / f, 0.6), 1.1, 5);
  const cut = 1100 + 1600 * vel;
  for (let k = 1; k <= 9; k++) {
    const fk = k * f * Math.sqrt(1 + B * k * k);
    const a = amp * Math.pow(k, -1.5) * Math.exp(-(k * f) / cut);
    const t = T / (1 + 0.55 * (k - 1));
    addMode(out, sr, start, fk, a, t, 0.004, rng() * TAU);
    if (k <= 3) addMode(out, sr, start, fk * (1 + 0.0007 * k), a * 0.5, t * 1.3, 0.004, rng() * TAU);
  }
  addNoiseBurst(out, sr, rng, start, 0.018, amp * 0.07, { type: 'lowpass', freq: 800 }, 0.002);
}

/** Blowing across a tuned bottle: resonant breath + pure tone with a little vibrato. */
export function bottle(out: Float32Array, sr: number, start: number, f: number, amp: number, hold: number, rng: Rng): void {
  const dur = Math.max(0.18, hold) + 0.2;
  addTone(out, sr, { start, dur, freq: f, amp, attack: 0.07, release: 0.18, vibRate: 4.8, vibDepth: 0.004, vibDelay: 0.08, bright: 0.12 });
  addAir(out, sr, rng, start, dur, amp * 0.5, (u) => Math.sin(Math.PI * Math.min(1, u * 1.15)) ** 1.5, () => f, 22, 'white');
  addAir(out, sr, rng, start, dur * 0.7, amp * 0.07, (u) => Math.sin(Math.PI * u), () => 2600, 0.8);
}

/** Warm chime: near-harmonic bell partials with a slow shimmer (beating pair). */
export function chime(out: Float32Array, sr: number, start: number, f: number, amp: number, rng: Rng, t60 = 2.2): void {
  modes(out, sr, start, f, amp, [
    [1, 1, t60], [1.0013, 0.45, t60 * 1.1], [2.001, 0.3, t60 * 0.6], [3.0, 0.07, t60 * 0.35],
    [4.16, 0.08, t60 * 0.25], [5.43, 0.03, t60 * 0.15],
  ], 0.0015, rng);
}

/** Crystal ping: glass partials, bright but short upper modes. */
export function crystal(out: Float32Array, sr: number, start: number, f: number, amp: number, rng: Rng, t60 = 1.4): void {
  modes(out, sr, start, f, amp, [
    [1, 1, t60], [1.0021, 0.5, t60], [2.405, 0.25, t60 * 0.45], [4.33, 0.1, t60 * 0.25], [6.7, 0.04, t60 * 0.12],
  ], 0.0016, rng);
}

/** Rich "golden" bell (major-third tierce so it sits in D major), with hum note and beating. */
export function goldBell(out: Float32Array, sr: number, start: number, f: number, amp: number, rng: Rng): void {
  modes(out, sr, start, f, amp, [
    [0.5, 0.4, 5.5], [0.5012, 0.2, 5.5], [1, 0.9, 4.5], [1.0024, 0.4, 4.2], [1.25, 0.35, 3.0], [1.5, 0.3, 2.6],
    [2, 0.6, 2.4], [2.0035, 0.25, 2.4], [2.5, 0.18, 1.6], [3.0, 0.13, 1.2], [4.0, 0.07, 0.8], [5.33, 0.03, 0.5],
  ], 0.002, rng);
  addNoiseBurst(out, sr, rng, start, 0.008, amp * 0.05, { type: 'highpass', freq: 2500 });
}

/** Small wooden block "tock". */
export function woodTock(out: Float32Array, sr: number, rng: Rng, start: number, f: number, amp: number, t60 = 0.3): void {
  modes(out, sr, start, f, amp, [
    [1, 1, t60], [2.46, 0.35, t60 * 0.35], [4.1, 0.12, t60 * 0.15], [6.3, 0.05, t60 * 0.08],
  ], 0.0015, rng);
  addNoiseBurst(out, sr, rng, start, 0.008, amp * 0.18, { type: 'bandpass', freq: 1800, q: 1.4 });
}

/** A water-drop / bubble "bloop": sine gliding upward quickly, cute and rounded. */
export function bloop(out: Float32Array, sr: number, start: number, f: number, amp: number, dur = 0.1, rise = 1.5): void {
  addTone(out, sr, { start, dur, freq: f, freqTo: f * rise, glide: dur * 0.7, amp, attack: 0.004, release: dur * 0.6, bright: 0.15 });
}

/** A candle being snuffed: a soft breath puff with a falling band. */
export function puff(out: Float32Array, sr: number, rng: Rng, start: number, amp: number, dur = 0.22): void {
  addAir(out, sr, rng, start, dur, amp, (u) => (u < 0.15 ? u / 0.15 : Math.exp(-(u - 0.15) * 5)), (u) => 1100 - 600 * u, 1.1);
  addNoiseBurst(out, sr, rng, start + dur * 0.4, 0.06, amp * 0.12, { type: 'highpass', freq: 5000 }, 0.01);
}

/** Random tiny glass grains within a pentatonic step range (sparkle, shimmer, magic dust). */
export function sparkle(
  out: Float32Array, sr: number, rng: Rng, start: number, dur: number, count: number,
  stepLo: number, stepHi: number, amp: number, shape: 'up' | 'down' | 'flat' = 'flat',
): void {
  for (let k = 0; k < count; k++) {
    const u = (k + rng() * 0.8) / count;
    const t = start + dur * u;
    const g = shape === 'up' ? 0.35 + 0.65 * u : shape === 'down' ? 1 - 0.7 * u : 0.6 + 0.4 * rng();
    const step = Math.round(rand(rng, stepLo, stepHi));
    const f = pentaHz(step);
    const a = amp * g * rand(rng, 0.5, 1);
    addMode(out, sr, t, f, a, rand(rng, 0.25, 0.6), 0.0022, rng() * TAU);
    addMode(out, sr, t, f * 2.405, a * 0.25, 0.15, 0.0022);
  }
}

export interface PadNote { f: number; fTo?: number; amp?: number }
export interface PadOpts {
  start: number;
  dur: number;
  notes: readonly PadNote[];
  amp: number;
  attack: number;
  release: number;
  /** Low-pass cutoff sweep (Hz), exponential. */
  lpFrom: number;
  lpTo: number;
  /** Formant-filter towards a soft "aah" choir. */
  choir?: boolean;
  voices?: number;
  detuneCents?: number;
  vibDepth?: number;
}

/**
 * Warm ensemble pad: per note, a few detuned band-limited saws with slow random drift, through a
 * sweeping resonant-free low-pass, optionally formant-shaped into a wordless "aah" choir.
 */
export function addPad(out: Float32Array, sr: number, rng: Rng, o: PadOpts): void {
  const n0 = Math.round(o.start * sr);
  const len = Math.min(out.length - n0, Math.round(o.dur * sr));
  if (len <= 0 || n0 < 0) return;
  const tmp = new Float32Array(len);
  const V = o.voices ?? 3;
  const det = o.detuneCents ?? 7;
  const vib = o.vibDepth ?? 0.003;
  for (const note of o.notes) {
    const na = note.amp ?? 1;
    for (let v = 0; v < V; v++) {
      const cents = V === 1 ? 0 : -det + (2 * det * v) / (V - 1) + rand(rng, -1.5, 1.5);
      const ratio = Math.pow(2, cents / 1200);
      const lr = Math.log((note.fTo ?? note.f) / note.f);
      let ph = rng();
      const vr = rand(rng, 4.6, 5.6);
      const vp = rng() * TAU;
      const g = na / Math.sqrt(V);
      let dt = note.f / sr;
      for (let i = 0; i < len; i++) {
        if ((i & 31) === 0) {
          // pitch (glide + slow vibrato) at control rate
          const u = i / len;
          const f = note.f * ratio * Math.exp(lr * u * u * (3 - 2 * u)) * (1 + vib * Math.sin((TAU * vr * i) / sr + vp));
          dt = f / sr;
        }
        ph += dt;
        if (ph >= 1) ph -= 1;
        tmp[i] += g * sawBlep(ph, dt);
      }
    }
  }
  // filter
  const lp1 = new Biquad(sr, 'lowpass', o.lpFrom, 0.6);
  const lp2 = new Biquad(sr, 'lowpass', o.lpFrom, 0.6);
  const lr = Math.log(o.lpTo / o.lpFrom);
  const f1 = new Biquad(sr, 'bandpass', 750, 4);
  const f2 = new Biquad(sr, 'bandpass', 1150, 5);
  const f3 = new Biquad(sr, 'bandpass', 2600, 6);
  const warm = new OnePole(sr, 3200);
  const na = Math.max(1, Math.round(o.attack * sr));
  const nr = Math.max(1, Math.round(o.release * sr));
  for (let i = 0; i < len; i++) {
    if ((i & 31) === 0) {
      const fc = o.lpFrom * Math.exp((lr * i) / len);
      lp1.set('lowpass', fc, 0.6);
      lp2.set('lowpass', fc, 0.6);
    }
    let s = lp2.process(lp1.process(tmp[i]));
    if (o.choir) s = 0.35 * s + 1.6 * f1.process(s) + 1.0 * f2.process(s) + 0.35 * f3.process(s);
    s = warm.process(s);
    let env = riseAt(i, na);
    if (i > len - nr) env *= 0.5 + 0.5 * Math.cos((Math.PI * (i - (len - nr))) / nr);
    out[n0 + i] += o.amp * env * s;
  }
}
