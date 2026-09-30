/**
 * Loci — the UI / game cues. Each cue is a pure render function into a mono buffer; the engine
 * pre-renders them once and plays them through pooled (optionally HRTF-spatialised) voices with a
 * shared "old library" room reverb. All pitches are in D major pentatonic (see music.ts).
 *
 * Levels: every render is peak-normalised to `peak` (≤ 0.9), which is how the mix is balanced;
 * `send` is the room-reverb amount; `duck` lowers the ambience while it plays.
 */
import { addAir, addMode, addNoiseBurst, addTone, type Rng } from './dsp';
import { addPad, bloop, chime, crystal, feltPiano, goldBell, puff, sparkle, strike, woodTock } from './instruments';
import { noteHz, pentaHz } from './music';

export type Cue =
  | 'pinch' | 'release' | 'bounce' | 'scanPing' | 'placeThunk' | 'appear' | 'dissolve' | 'lightsOut' | 'lightsOn'
  | 'correct' | 'wrong' | 'reveal' | 'tierUp' | 'tierAnchored' | 'proof' | 'hover' | 'menuOpen' | 'menuClose'
  | 'palaceLoaded' | 'phoneConnected' | 'importReady' | 'goodbye' | 'whoosh';

export interface CueSpec {
  /** Render length in seconds (the tail is trimmed after rendering). */
  dur: number;
  /** Target peak after normalisation — this is the mix balance. */
  peak: number;
  /** Room reverb send (0..1). */
  send: number;
  /** Number of pre-rendered round-robin variants (organic repetition). */
  variants?: number;
  /** Random playback-rate spread (ratio, e.g. 0.03 = ±3 %) for unpitched repeats. */
  jitter?: number;
  /** Duck the ambience while playing. */
  duck?: boolean;
  /** Short human description (demo page, docs). */
  note: string;
  render(out: Float32Array, sr: number, rng: Rng, variant: number): void;
}

const N = noteHz;
const P = pentaHz;

export const CUES: Record<Cue, CueSpec> = {
  pinch: {
    dur: 0.16, peak: 0.42, send: 0.1, variants: 3, jitter: 0.025,
    note: 'tiny glassy-wood tick',
    render(o, sr, rng, v) {
      const f = [N('A6'), N('B6'), N('F#6')][v % 3];
      addMode(o, sr, 0, f, 0.6, 0.07, 0.0002);
      addMode(o, sr, 0, f * 2.32, 0.18, 0.03, 0.0002);
      addMode(o, sr, 0, N('D5'), 0.18, 0.05, 0.001);
      addNoiseBurst(o, sr, rng, 0, 0.004, 0.25, { type: 'bandpass', freq: 4200, q: 1.2 });
    },
  },
  release: {
    dur: 0.2, peak: 0.34, send: 0.12, variants: 2, jitter: 0.02,
    note: 'soft low "tuck", the pinch let go',
    render(o, sr, rng) {
      addTone(o, sr, { start: 0, dur: 0.1, freq: N('D6'), freqTo: N('A5'), glide: 0.06, amp: 0.5, attack: 0.002, release: 0.07 });
      addMode(o, sr, 0.004, N('A5'), 0.25, 0.08, 0.001);
      addNoiseBurst(o, sr, rng, 0, 0.012, 0.12, { type: 'lowpass', freq: 1800 });
    },
  },
  bounce: {
    dur: 0.55, peak: 0.52, send: 0.16, variants: 3,
    note: 'the flame bouncing: three cute bloops, like a rubber ball settling',
    render(o, sr, _rng, v) {
      const base = [P(5), P(6), P(3)][v % 3];
      const times = [0, 0.15, 0.26, 0.335];
      const amps = [1, 0.6, 0.35, 0.18];
      times.forEach((t, k) => bloop(o, sr, t, base * (k === 0 ? 1 : 1.12), 0.55 * amps[k], 0.11 - k * 0.015, k === 0 ? 1.5 : 1.34));
      addMode(o, sr, 0, base * 2, 0.08, 0.3, 0.003);
    },
  },
  scanPing: {
    dur: 1.7, peak: 0.48, send: 0.38,
    note: 'crystalline ping; pass opts.pitch = pentatonicRatio(i) to walk up the scale',
    render(o, sr, rng) {
      crystal(o, sr, 0, N('D6'), 0.8, rng, 1.4);
      addMode(o, sr, 0.002, N('D5'), 0.16, 0.8, 0.004);
      addNoiseBurst(o, sr, rng, 0, 0.02, 0.04, { type: 'highpass', freq: 6500 });
    },
  },
  placeThunk: {
    dur: 0.45, peak: 0.6, send: 0.16, variants: 3, jitter: 0.02,
    note: 'satisfying soft wooden "tock" — a scene set down on furniture',
    render(o, sr, rng, v) {
      const f = [N('D3'), N('E3'), N('D3')][v % 3] * (1 + v * 0.004);
      woodTock(o, sr, rng, 0, f, 0.75, 0.32);
      addMode(o, sr, 0, f * 2, 0.18, 0.18, 0.002);
      addNoiseBurst(o, sr, rng, 0, 0.07, 0.55, { type: 'lowpass', freq: 380 }, 0.001);
      addNoiseBurst(o, sr, rng, 0, 0.006, 0.1, { type: 'bandpass', freq: 2400, q: 1.6 });
    },
  },
  appear: {
    dur: 1.5, peak: 0.52, send: 0.42,
    note: 'rising glassy shimmer with a breath of air — a scene materialises',
    render(o, sr, rng) {
      const steps = [5, 6, 7, 8, 9, 10, 11];
      let t = 0;
      steps.forEach((s, k) => {
        crystal(o, sr, t, P(s), 0.14 + 0.05 * k, rng, 0.9);
        t += 0.085 - k * 0.006;
      });
      addAir(o, sr, rng, 0, 1.0, 0.4, (u) => Math.sin(Math.PI * Math.pow(u, 0.7)) ** 2, (u) => 600 * Math.pow(5, u), 1.4);
      addTone(o, sr, { start: 0.05, dur: 1.2, freq: P(5), amp: 0.12, attack: 0.35, release: 0.7 });
    },
  },
  dissolve: {
    dur: 1.7, peak: 0.45, send: 0.46,
    note: 'descending sparkle and fine sand — a scene fades away',
    render(o, sr, rng) {
      sparkle(o, sr, rng, 0, 0.9, 12, 15, 9, 0.2, 'down');
      for (let k = 0; k < 5; k++) crystal(o, sr, k * 0.11, P(14 - k), 0.12 * (1 - k * 0.12), rng, 0.8);
      addAir(o, sr, rng, 0, 1.3, 0.3, (u) => (u < 0.1 ? u / 0.1 : Math.exp(-(u - 0.1) * 3.2)), (u) => 5200 * Math.pow(0.3, u), 1.8, 'white');
      addTone(o, sr, { start: 0, dur: 1.2, freq: P(3), freqTo: P(0), glide: 1.1, amp: 0.07, attack: 0.1, release: 0.6 });
    },
  },
  lightsOut: {
    dur: 2.8, peak: 0.52, send: 0.5, duck: true,
    note: 'candles snuffed one by one while a warm chord sinks and darkens',
    render(o, sr, rng) {
      addPad(o, sr, rng, {
        start: 0, dur: 1.3, notes: [{ f: N('D4') }, { f: N('F#4') }, { f: N('A4') }, { f: N('D5'), amp: 0.6 }],
        amp: 0.16, attack: 0.25, release: 0.6, lpFrom: 2600, lpTo: 900,
      });
      addPad(o, sr, rng, {
        start: 0.75, dur: 2.0, notes: [{ f: N('A3') }, { f: N('D4') }, { f: N('F#4'), amp: 0.7 }],
        amp: 0.17, attack: 0.5, release: 1.2, lpFrom: 1100, lpTo: 220,
      });
      addTone(o, sr, { start: 0.4, dur: 2.3, freq: N('D2'), amp: 0.16, attack: 0.6, release: 1.3 });
      [0.12, 0.42, 0.74].forEach((t, k) => puff(o, sr, rng, t, 0.5 - k * 0.07, 0.24));
    },
  },
  lightsOn: {
    dur: 2.4, peak: 0.52, send: 0.5, duck: true,
    note: 'candles catching (soft "fwoomp") and a chord opening up into sparkle',
    render(o, sr, rng) {
      addAir(o, sr, rng, 0, 0.35, 0.35, (u) => Math.sin(Math.PI * Math.pow(u, 0.5)), (u) => 300 + 1200 * u, 0.9);
      addPad(o, sr, rng, {
        start: 0.05, dur: 2.2, notes: [{ f: N('D3'), amp: 0.7 }, { f: N('A3') }, { f: N('D4') }, { f: N('F#4') }, { f: N('A4'), amp: 0.7 }],
        amp: 0.15, attack: 0.7, release: 0.9, lpFrom: 300, lpTo: 3800,
      });
      sparkle(o, sr, rng, 0.8, 0.9, 9, 10, 15, 0.13, 'up');
    },
  },
  correct: {
    dur: 2.4, peak: 0.6, send: 0.36,
    note: 'soft warm two-note chime (A5 → D6) with a slow shimmer',
    render(o, sr, rng) {
      chime(o, sr, 0, N('A5'), 0.55, rng, 2.0);
      chime(o, sr, 0.085, N('D6'), 0.5, rng, 2.2);
      addTone(o, sr, { start: 0, dur: 1.4, freq: N('D5'), amp: 0.14, attack: 0.006, release: 0.9, t60: 1.6 });
      sparkle(o, sr, rng, 0.12, 0.35, 3, 14, 16, 0.05, 'down');
    },
  },
  wrong: {
    dur: 1.6, peak: 0.48, send: 0.3,
    note: 'a soft breathy exhale with two low felt notes — "not quite", never a buzzer',
    render(o, sr, rng) {
      const env = (u: number) => (u < 0.22 ? Math.sin((Math.PI / 2) * (u / 0.22)) ** 2 : Math.exp(-(u - 0.22) * 3.4));
      addAir(o, sr, rng, 0, 1.2, 0.75, env, (u) => 900 - 470 * u, 0.9);
      addAir(o, sr, rng, 0, 1.1, 0.25, env, (u) => 1500 - 600 * u, 2.5);
      feltPiano(o, sr, 0.06, N('A3'), 0.2, 0.3, rng);
      feltPiano(o, sr, 0.26, N('F#3'), 0.22, 0.3, rng);
    },
  },
  reveal: {
    dur: 2.4, peak: 0.6, send: 0.42,
    note: 'harp glissando up to a bell — the answer / scene revealed',
    render(o, sr, rng) {
      [0, 1, 2, 3, 4, 5, 6].forEach((s, k) => strike('harp', o, sr, k * 0.045, P(s), 0.55 + k * 0.05, rng));
      chime(o, sr, 0.33, P(10), 0.32, rng, 1.8);
      addAir(o, sr, rng, 0, 0.5, 0.12, (u) => Math.sin(Math.PI * u), (u) => 800 + 2400 * u, 1.2);
    },
  },
  tierUp: {
    dur: 2.0, peak: 0.55, send: 0.42,
    note: 'music-box sparkle arpeggio (D6 → D7)',
    render(o, sr, rng) {
      [10, 11, 12, 13, 14, 15].forEach((s, k) => strike('musicBox', o, sr, k * 0.052, P(s), 0.6 + k * 0.05, rng));
      sparkle(o, sr, rng, 0.25, 0.6, 7, 13, 17, 0.08, 'down');
      addPad(o, sr, rng, { start: 0, dur: 1.4, notes: [{ f: N('D4') }, { f: N('A4') }], amp: 0.07, attack: 0.2, release: 0.9, lpFrom: 1500, lpTo: 900 });
    },
  },
  tierAnchored: {
    dur: 4.6, peak: 0.62, send: 0.52, duck: true,
    note: 'rich golden bell + wordless choir swell — a notion anchored forever',
    render(o, sr, rng) {
      goldBell(o, sr, 0, N('D4'), 0.5, rng);
      chime(o, sr, 0.02, N('D5'), 0.14, rng, 3.0);
      addPad(o, sr, rng, {
        start: 0.1, dur: 4.3, notes: [{ f: N('D3'), amp: 0.7 }, { f: N('A3') }, { f: N('D4') }, { f: N('F#4') }, { f: N('A4'), amp: 0.8 }],
        amp: 0.2, attack: 1.1, release: 1.8, lpFrom: 1400, lpTo: 2600, choir: true, voices: 3, detuneCents: 9, vibDepth: 0.004,
      });
      sparkle(o, sr, rng, 0.5, 1.5, 10, 12, 17, 0.06, 'flat');
    },
  },
  proof: {
    dur: 3.4, peak: 0.6, send: 0.46, duck: true,
    note: 'uplifting four-note motif D5 F#5 A5 D6 with a warm glow underneath',
    render(o, sr, rng) {
      const notes: [number, number, number][] = [[0, N('D5'), 0.7], [0.16, N('F#5'), 0.72], [0.32, N('A5'), 0.76], [0.54, N('D6'), 0.9]];
      for (const [t, f, v] of notes) {
        feltPiano(o, sr, t, f, 0.3 * v, 0.7, rng);
        chime(o, sr, t, f, 0.14 * v, rng, 1.6);
      }
      addPad(o, sr, rng, {
        start: 0.3, dur: 2.9, notes: [{ f: N('D4') }, { f: N('F#4') }, { f: N('A4') }, { f: N('D3'), amp: 0.6 }],
        amp: 0.13, attack: 0.9, release: 1.4, lpFrom: 900, lpTo: 2400,
      });
      sparkle(o, sr, rng, 0.6, 1.0, 8, 13, 17, 0.07, 'down');
    },
  },
  hover: {
    dur: 0.2, peak: 0.2, send: 0.2, variants: 3, jitter: 0.015,
    note: 'barely-there glassy "tink" + a breath of air (gaze hover)',
    render(o, sr, rng, v) {
      const f = [P(15), P(13), P(14)][v % 3];
      addMode(o, sr, 0.004, f, 0.35, 0.12, 0.001);
      addNoiseBurst(o, sr, rng, 0, 0.05, 0.12, { type: 'highpass', freq: 3500 }, 0.012);
    },
  },
  menuOpen: {
    dur: 0.9, peak: 0.48, send: 0.3,
    note: 'two kalimba notes up (A5 → D6) on a rising breath',
    render(o, sr, rng) {
      addAir(o, sr, rng, 0, 0.28, 0.2, (u) => Math.sin(Math.PI * u), (u) => 500 + 1400 * u, 1.0);
      strike('kalimba', o, sr, 0.03, N('A5'), 0.7, rng);
      strike('kalimba', o, sr, 0.1, N('D6'), 0.8, rng);
    },
  },
  menuClose: {
    dur: 0.8, peak: 0.42, send: 0.28,
    note: 'two kalimba notes down (D6 → A5) on a falling breath',
    render(o, sr, rng) {
      addAir(o, sr, rng, 0, 0.26, 0.18, (u) => Math.sin(Math.PI * u), (u) => 1800 - 1200 * u, 1.0);
      strike('kalimba', o, sr, 0.02, N('D6'), 0.7, rng);
      strike('kalimba', o, sr, 0.09, N('A5'), 0.65, rng);
    },
  },
  palaceLoaded: {
    dur: 3.2, peak: 0.56, send: 0.46, duck: true,
    note: 'harp roll over a warm pad, closing on a bell — "your palace is here"',
    render(o, sr, rng) {
      [-5, -2, 0, 2, 3, 5].forEach((s, k) => strike('harp', o, sr, k * 0.065, P(s), 0.55 + 0.06 * k, rng));
      addPad(o, sr, rng, { start: 0, dur: 2.8, notes: [{ f: N('D3') }, { f: N('A3') }, { f: N('F#4') }], amp: 0.12, attack: 0.6, release: 1.3, lpFrom: 600, lpTo: 1800 });
      chime(o, sr, 0.45, N('A5'), 0.26, rng, 2.2);
    },
  },
  phoneConnected: {
    dur: 1.1, peak: 0.54, send: 0.3,
    note: 'two friendly bubbles up + kalimba — "your phone is paired"',
    render(o, sr, rng) {
      bloop(o, sr, 0, N('D5'), 0.4, 0.1, 1.25);
      bloop(o, sr, 0.12, N('A5'), 0.4, 0.1, 1.2);
      strike('kalimba', o, sr, 0.005, N('D5'), 0.5, rng);
      strike('kalimba', o, sr, 0.125, N('A5'), 0.6, rng);
      sparkle(o, sr, rng, 0.2, 0.25, 3, 13, 15, 0.05, 'down');
    },
  },
  importReady: {
    dur: 2.2, peak: 0.6, send: 0.42,
    note: 'three glass bells up (F#5 A5 D6) with a soft glow — "your course arrived"',
    render(o, sr, rng) {
      [N('F#5'), N('A5'), N('D6')].forEach((f, k) => strike('glassBell', o, sr, k * 0.12, f, 0.7 + 0.1 * k, rng));
      addPad(o, sr, rng, { start: 0.2, dur: 1.8, notes: [{ f: N('A4') }, { f: N('D5') }], amp: 0.07, attack: 0.5, release: 1.0, lpFrom: 1200, lpTo: 2000 });
    },
  },
  goodbye: {
    dur: 3.8, peak: 0.58, send: 0.5,
    note: 'gentle descending music-box lullaby with a ritardando',
    render(o, sr, rng) {
      const steps = [10, 9, 8, 7, 6, 5];
      const times = [0, 0.21, 0.44, 0.7, 1.0, 1.38];
      steps.forEach((s, k) => strike('musicBox', o, sr, times[k], P(s), 0.8 - k * 0.06, rng));
      addPad(o, sr, rng, { start: 0.2, dur: 3.0, notes: [{ f: N('D4') }, { f: N('A4') }, { f: N('F#4'), amp: 0.5 }], amp: 0.08, attack: 0.8, release: 1.6, lpFrom: 1400, lpTo: 500 });
    },
  },
  whoosh: {
    dur: 0.7, peak: 0.38, send: 0.25, variants: 2, jitter: 0.06,
    note: 'soft air moving past',
    render(o, sr, rng) {
      const env = (u: number) => Math.pow(Math.sin(Math.PI * Math.pow(u, 0.75)), 2);
      addAir(o, sr, rng, 0, 0.62, 0.9, env, (u) => 350 + 1200 * Math.sin(Math.PI * Math.pow(u, 0.8)), 0.7);
      addAir(o, sr, rng, 0, 0.6, 0.3, env, (u) => 150 + 250 * u, 0.8);
    },
  },
};

export const CUE_NAMES = Object.keys(CUES) as Cue[];
