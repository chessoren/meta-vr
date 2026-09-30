/**
 * Loci — "an old library on a winter evening".
 *
 * A fireplace (a soft breathing low roar, sparse wood crackles and the odd sizzle), a distant
 * gust of wind at the window every half-minute or so, and — rarely — a page turning somewhere
 * in the room. Very quiet by design: it should be felt more than heard.
 *
 * Assets are short pure renders (a seamless 12 s bed loop + banks of one-shots); the
 * AmbienceSequencer (pure, seeded) decides when the one-shots happen. The engine plays them in
 * real time; the offline exporter uses the very same sequencer to mix a preview WAV.
 */
import { Biquad, OnePole, addAir, addMode, addNoiseBurst, alloc, brownNoise, mulberry32, pinkNoise, rand, type Channels, type Rng } from './dsp';

export const AMB = { pops: 16, hiss: 2, wind: 3, rustle: 3 } as const;
export type AmbKind = 'pop' | 'hiss' | 'wind' | 'rustle';

/** Seamless stereo fireplace bed: low roar + breathing flame body + faint room tone. */
export function renderBed(sr: number, seconds = 12): Channels {
  const N = Math.round(seconds * sr);
  const X = Math.round(1.5 * sr);
  const total = N + X;
  // shared slow "breathing" of the fire
  const mrng = mulberry32(4242);
  const mod = new Float32Array(total);
  let walk = 0;
  const p1 = mrng() * 6.28, p2 = mrng() * 6.28;
  for (let i = 0; i < total; i++) {
    if ((i & 255) === 0) walk = walk * 0.985 + (mrng() - 0.5) * 0.06;
    const t = i / sr;
    mod[i] = 0.75 + 0.12 * Math.sin(6.283 * 0.13 * t + p1) + 0.08 * Math.sin(6.283 * 0.31 * t + p2) + walk;
  }
  const ch: Channels = [];
  for (let c = 0; c < 2; c++) {
    const rng = mulberry32(900 + c * 77);
    const roar = brownNoise(total, rng);
    const body = pinkNoise(total, rng);
    const lp1 = new Biquad(sr, 'lowpass', 170, 0.7), lp2 = new Biquad(sr, 'lowpass', 170, 0.7);
    const hp = new Biquad(sr, 'highpass', 40, 0.7);
    const bp = new Biquad(sr, 'bandpass', 520, 0.6);
    const room = new OnePole(sr, 1100);
    const flick = mulberry32(31 + c);
    let fl = 1;
    const x = new Float32Array(total);
    for (let i = 0; i < total; i++) {
      if ((i & 127) === 0) fl = fl * 0.9 + (0.6 + 0.8 * flick()) * 0.1;
      const r = hp.process(lp2.process(lp1.process(roar[i])));
      const b = bp.process(body[i]) * fl;
      x[i] = mod[i] * (1.0 * r + 0.18 * b) + 0.04 * room.process(body[i]);
    }
    // crossfade tail into head (equal power: uncorrelated noise)
    const y = new Float32Array(N);
    for (let i = 0; i < N; i++) y[i] = x[i];
    for (let i = 0; i < X; i++) {
      const u = i / X;
      y[i] = x[i] * Math.sin((Math.PI / 2) * u) + x[N + i] * Math.cos((Math.PI / 2) * u);
    }
    ch.push(y);
  }
  // normalise bed to a fixed RMS
  let e = 0;
  for (const c of ch) for (let i = 0; i < c.length; i++) e += c[i] * c[i];
  const rms = Math.sqrt(e / (2 * N));
  const k = 0.022 / (rms || 1);
  for (const c of ch) for (let i = 0; i < c.length; i++) c[i] *= k;
  return ch;
}

/** One wood crackle: small ticks (most), knocks (some), snaps (rare). Mono, peak-normalised later. */
export function renderPop(sr: number, variant: number): Float32Array {
  const rng = mulberry32(7000 + variant * 13);
  const kind = variant < 10 ? 'tick' : variant < 14 ? 'knock' : 'snap';
  const out = alloc(sr, kind === 'snap' ? 0.12 : 0.06);
  if (kind === 'tick') {
    addNoiseBurst(out, sr, rng, 0, rand(rng, 0.002, 0.007), 1, { type: 'bandpass', freq: rand(rng, 1800, 6500), q: rand(rng, 1, 3) }, 0.0002);
  } else if (kind === 'knock') {
    addNoiseBurst(out, sr, rng, 0, 0.004, 0.8, { type: 'bandpass', freq: rand(rng, 2000, 4000), q: 1.5 }, 0.0002);
    addMode(out, sr, 0, rand(rng, 300, 800), 0.35, 0.03, 0.0005);
    addNoiseBurst(out, sr, rng, 0, 0.02, 0.4, { type: 'lowpass', freq: 700 }, 0.0005);
  } else {
    let t = 0;
    for (let k = 0; k < 4 + Math.floor(rng() * 4); k++) {
      addNoiseBurst(out, sr, rng, t, rand(rng, 0.002, 0.006), rand(rng, 0.3, 1), { type: 'bandpass', freq: rand(rng, 1500, 7000), q: 1.4 }, 0.0002);
      t += rand(rng, 0.004, 0.018);
    }
    addNoiseBurst(out, sr, rng, 0, 0.03, 0.3, { type: 'lowpass', freq: 500 }, 0.001);
  }
  return out;
}

/** Sap sizzle: a short, very soft high hiss with micro-grains. */
export function renderHiss(sr: number, variant: number): Float32Array {
  const rng = mulberry32(8100 + variant);
  const dur = 0.6 + 0.3 * variant;
  const out = alloc(sr, dur);
  addAir(out, sr, rng, 0, dur, 0.5, (u) => Math.sin(Math.PI * u) ** 2, (u) => 5500 + 1500 * Math.sin(u * 9), 1.4, 'white');
  for (let k = 0; k < 25; k++) addNoiseBurst(out, sr, rng, rng() * dur * 0.9, 0.002, rand(rng, 0.1, 0.5), { type: 'highpass', freq: 5000 }, 0.0002);
  return out;
}

/** A distant gust at the window: slow swell, moving band, a faint whistle, drifting across. Stereo. */
export function renderWind(sr: number, variant: number): Channels {
  const rng: Rng = mulberry32(9100 + variant * 5);
  const dur = 6 + variant;
  const mono = alloc(sr, dur);
  const env = (u: number) => Math.pow(Math.sin(Math.PI * Math.pow(u, 0.8)), 2) * (0.8 + 0.2 * Math.sin(u * 17 + variant));
  const c0 = rand(rng, 280, 420);
  addAir(mono, sr, rng, 0, dur, 0.8, env, (u) => c0 * (1 + 0.8 * Math.sin(Math.PI * u) + 0.15 * Math.sin(u * 23)), 0.9);
  const w0 = rand(rng, 650, 900);
  addAir(mono, sr, rng, 0, dur, 0.12, (u) => env(u) ** 2, (u) => w0 * (1 + 0.12 * Math.sin(Math.PI * u * 1.5)), 14, 'white');
  const lp = new OnePole(sr, 1600);
  for (let i = 0; i < mono.length; i++) mono[i] = lp.process(mono[i]);
  const L = new Float32Array(mono.length), R = new Float32Array(mono.length);
  const p0 = rand(rng, -0.8, -0.2) * (variant % 2 ? -1 : 1);
  for (let i = 0; i < mono.length; i++) {
    const u = i / mono.length;
    const pan = p0 * (1 - 1.6 * u);
    const a = ((pan + 1) * Math.PI) / 4;
    L[i] = mono[i] * Math.cos(a);
    R[i] = mono[i] * Math.sin(a);
  }
  return [L, R];
}

/** A page turning somewhere in the room: lift, paper crinkle, soft flap. */
export function renderRustle(sr: number, variant: number): Float32Array {
  const rng = mulberry32(9900 + variant * 3);
  const dur = 1.1 + 0.2 * variant;
  const out = alloc(sr, dur);
  addAir(out, sr, rng, 0, 0.45, 0.25, (u) => Math.sin(Math.PI * u), () => 3000, 1.0, 'white');
  const n = 26 + variant * 6;
  for (let k = 0; k < n; k++) {
    const t = 0.08 + Math.pow(rng(), 1.3) * (dur * 0.6);
    addNoiseBurst(out, sr, rng, t, rand(rng, 0.004, 0.02), rand(rng, 0.15, 0.6), { type: 'bandpass', freq: rand(rng, 2500, 7000), q: rand(rng, 0.8, 2) }, 0.0005);
  }
  addAir(out, sr, rng, dur * 0.55, 0.35, 0.5, (u) => Math.sin(Math.PI * Math.pow(u, 0.5)), (u) => 600 - 300 * u, 0.8);
  addNoiseBurst(out, sr, rng, dur * 0.55 + 0.28, 0.03, 0.25, { type: 'lowpass', freq: 400 }, 0.002);
  return out;
}

export interface AmbEvent { t: number; kind: AmbKind; variant: number; gain: number; pan: number; rate: number }

/**
 * Pure, seeded event generator for the one-shot layers. Call advance(untilSeconds) repeatedly with
 * increasing times; it returns every event scheduled before that time.
 */
export class AmbienceSequencer {
  // one RNG per layer, so the result is identical however advance() is sliced in time
  private rng: Rng;
  private rHiss: Rng;
  private rWind: Rng;
  private rRustle: Rng;
  private nextPop: number;
  private nextHiss: number;
  private nextWind: number;
  private nextRustle: number;
  private activity = 1;
  constructor(seed = 1, start = 0) {
    this.rng = mulberry32(seed);
    this.rHiss = mulberry32(seed * 3 + 1);
    this.rWind = mulberry32(seed * 5 + 2);
    this.rRustle = mulberry32(seed * 7 + 3);
    this.nextPop = start + 0.3;
    this.nextHiss = start + rand(this.rHiss, 6, 14);
    this.nextWind = start + rand(this.rWind, 10, 18);
    this.nextRustle = start + rand(this.rRustle, 35, 60);
  }
  advance(until: number): AmbEvent[] {
    const r = this.rng;
    const ev: AmbEvent[] = [];
    const firePan = (g: Rng = r) => rand(g, -0.55, 0.15);
    while (this.nextPop < until) {
      const t = this.nextPop;
      this.activity = Math.min(1.6, Math.max(0.35, this.activity + (r() - 0.5) * 0.25));
      const x = r();
      const variant = x < 0.75 ? Math.floor(r() * 10) : x < 0.95 ? 10 + Math.floor(r() * 4) : 14 + Math.floor(r() * 2);
      const big = variant >= 10;
      const gain = (big ? 0.55 : 0.25) * Math.pow(r(), 1.6) + (big ? 0.35 : 0.08);
      const pan = firePan();
      ev.push({ t, kind: 'pop', variant, gain, pan, rate: rand(r, 0.85, 1.2) });
      if (variant >= 14) {
        // a snap is followed by a little cluster of ticks
        let tt = t;
        for (let k = 0; k < 2 + Math.floor(r() * 3); k++) {
          tt += rand(r, 0.02, 0.09);
          ev.push({ t: tt, kind: 'pop', variant: Math.floor(r() * 10), gain: rand(r, 0.08, 0.25), pan: pan + rand(r, -0.1, 0.1), rate: rand(r, 0.9, 1.25) });
        }
      }
      // Poisson-ish gaps with activity modulation (0.4 s mean at full activity)
      this.nextPop += (-Math.log(1 - r() * 0.999) * 0.42) / this.activity + 0.015;
    }
    while (this.nextHiss < until) {
      const h = this.rHiss;
      ev.push({ t: this.nextHiss, kind: 'hiss', variant: Math.floor(h() * AMB.hiss), gain: rand(h, 0.5, 1), pan: firePan(h), rate: 1 });
      this.nextHiss += rand(h, 9, 22);
    }
    while (this.nextWind < until) {
      const w = this.rWind;
      ev.push({ t: this.nextWind, kind: 'wind', variant: Math.floor(w() * AMB.wind), gain: rand(w, 0.6, 1), pan: 0, rate: rand(w, 0.92, 1.05) });
      this.nextWind += rand(w, 28, 70);
    }
    while (this.nextRustle < until) {
      const q = this.rRustle;
      ev.push({ t: this.nextRustle, kind: 'rustle', variant: Math.floor(q() * AMB.rustle), gain: rand(q, 0.6, 1), pan: rand(q, -0.7, 0.7), rate: rand(q, 0.95, 1.05) });
      this.nextRustle += rand(q, 60, 150);
    }
    ev.sort((a, b) => a.t - b.t);
    return ev;
  }
}

/** Peak levels of each one-shot bank (they are further scaled by event gain and the ambience level). */
export const AMB_PEAK: Record<AmbKind, number> = { pop: 0.3, hiss: 0.05, wind: 0.09, rustle: 0.1 };
