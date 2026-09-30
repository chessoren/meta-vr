/**
 * Loci — tiny pure DSP library.
 *
 * Everything here fills or transforms plain Float32Arrays, with no Web Audio, DOM or Node APIs,
 * so the same code renders sound in the browser (a Worker fills AudioBuffers once, at unlock),
 * in Node (Vitest checks, WAV export) and anywhere else. All randomness is seeded, so every
 * render is deterministic.
 *
 * Performance notes: inner loops use local numbers, avoid allocation, and prefer recursive
 * oscillators (two multiply-adds per sample) over Math.sin for decaying partials.
 */

export type Channels = Float32Array[];
export type Rng = () => number;

export const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ randomness */

/** Small fast seeded PRNG in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit string hash (stable across platforms). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const rand = (rng: Rng, lo: number, hi: number) => lo + (hi - lo) * rng();
export const pick = <T>(rng: Rng, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length) % arr.length];

/* ------------------------------------------------------------------ buffers */

export function alloc(sr: number, seconds: number): Float32Array {
  return new Float32Array(Math.max(1, Math.ceil(seconds * sr)));
}

export const dbToGain = (db: number) => Math.pow(10, db / 20);
export const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

/** out[offset + i] += src[i] * gain */
export function mixInto(out: Float32Array, src: Float32Array, offsetSamples = 0, gain = 1): void {
  const n0 = Math.max(0, offsetSamples | 0);
  const n = Math.min(src.length, out.length - n0);
  for (let i = 0; i < n; i++) out[n0 + i] += src[i] * gain;
}

export function peakOf(x: Float32Array): number {
  let p = 0;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]);
    if (a > p) p = a;
  }
  return p;
}

export function rmsOf(x: Float32Array): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, x.length));
}

export function scale(x: Float32Array, g: number): Float32Array {
  for (let i = 0; i < x.length; i++) x[i] *= g;
  return x;
}

/** Scale all channels together so the loudest sample hits `target`. Silent input is left alone. */
export function normalizePeak(ch: Channels, target: number): Channels {
  let p = 0;
  for (const c of ch) p = Math.max(p, peakOf(c));
  if (p > 1e-9) for (const c of ch) scale(c, target / p);
  return ch;
}

/**
 * Loudness-style normalisation: scale so the loudest 200 ms window has RMS `targetRms`, but never
 * let the sample peak exceed `maxPeak`. Balances sustained vs. percussive sounds far better than
 * peak normalisation.
 */
export function normalizeLoudness(x: Float32Array, sr: number, targetRms: number, maxPeak: number): Float32Array {
  const win = Math.max(1, Math.round(0.2 * sr));
  const hop = Math.max(1, Math.round(0.05 * sr));
  let best = 0;
  for (let from = 0; from < x.length; from += hop) {
    let e = 0;
    const to = Math.min(x.length, from + win);
    for (let i = from; i < to; i++) e += x[i] * x[i];
    best = Math.max(best, e / win);
    if (to === x.length) break;
  }
  const rms = Math.sqrt(best);
  const pk = peakOf(x);
  if (rms < 1e-9 || pk < 1e-9) return x;
  let g = targetRms / rms;
  if (pk * g > maxPeak) g = maxPeak / pk;
  return scale(x, g);
}

/** Raised-cosine fade in / out over `seconds` at the start / end of the buffer. */
export function fadeIn(x: Float32Array, sr: number, seconds: number): Float32Array {
  const n = Math.min(x.length, Math.round(seconds * sr));
  for (let i = 0; i < n; i++) x[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / n);
  return x;
}
export function fadeOut(x: Float32Array, sr: number, seconds: number): Float32Array {
  const n = Math.min(x.length, Math.round(seconds * sr));
  const L = x.length;
  for (let i = 0; i < n; i++) x[L - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / n);
  return x;
}

/** One-pole DC blocker (~20 Hz). */
export function dcBlock(x: Float32Array, sr: number): Float32Array {
  const R = Math.exp((-TAU * 20) / sr);
  let x1 = 0, y1 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = x[i] - x1 + R * y1;
    x1 = x[i];
    y1 = y;
    x[i] = y;
  }
  return x;
}

/** Drop trailing samples quieter than `threshold` (keeps a short tail and fades it). */
export function trimTail(x: Float32Array, sr: number, threshold = 2e-4, minSeconds = 0.03): Float32Array {
  let end = x.length;
  while (end > 1 && Math.abs(x[end - 1]) < threshold) end--;
  end = Math.min(x.length, Math.max(end + Math.round(0.01 * sr), Math.round(minSeconds * sr)));
  const y = end === x.length ? x : x.slice(0, end);
  return fadeOut(y, sr, Math.min(0.02, y.length / sr / 4));
}

/** Gentle symmetric soft-clip above `knee` (transparent below it). */
export function softClip(x: Float32Array, knee = 0.8): Float32Array {
  const head = 1 - knee;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    const a = Math.abs(v);
    if (a > knee) x[i] = Math.sign(v) * (knee + head * Math.tanh((a - knee) / head));
  }
  return x;
}

/* ------------------------------------------------------------------ envelopes */

/** Smooth 0→1 attack shape (raised cosine) over `n` samples; returns 1 after. */
export const riseAt = (i: number, n: number) => (i >= n ? 1 : 0.5 - 0.5 * Math.cos((Math.PI * i) / n));

/** Classic ADSR with a total note length `dur` (release starts at dur - r). Returns amplitude at time t. */
export function adsr(t: number, a: number, d: number, s: number, r: number, dur: number): number {
  if (t < 0 || t > dur) return 0;
  let v: number;
  if (t < a) v = 0.5 - 0.5 * Math.cos((Math.PI * t) / a);
  else if (t < a + d) v = 1 - (1 - s) * ((t - a) / d);
  else v = s;
  const rs = dur - r;
  if (t > rs) v *= 0.5 + 0.5 * Math.cos((Math.PI * (t - rs)) / r);
  return v;
}

/* ------------------------------------------------------------------ oscillators */

/**
 * Exponentially decaying sine (a single "mode" of a struck object) using a recursive oscillator.
 * t60 = seconds to fall 60 dB. `attack` softens the onset (felt mallet vs. hard strike).
 */
export function addMode(
  out: Float32Array, sr: number, start: number, freq: number, amp: number, t60: number,
  attack = 0.0015, phase = 0,
): void {
  if (freq <= 0 || freq >= sr * 0.45 || amp === 0) return;
  const n0 = Math.round(start * sr);
  if (n0 >= out.length) return;
  const len = Math.min(out.length - n0, Math.ceil(t60 * sr));
  const w = (TAU * freq) / sr;
  const r = Math.pow(10, -3 / (t60 * sr));
  const c = 2 * r * Math.cos(w);
  const r2 = r * r;
  const na = Math.max(1, Math.round(attack * sr));
  let s0 = amp * Math.sin(phase);
  let s1 = amp * r * Math.sin(w + phase);
  let i = 0;
  if (n0 < 0) return;
  if (len > 0) out[n0] += s0 * riseAt(0, na);
  if (len > 1) out[n0 + 1] += s1 * riseAt(1, na);
  // the last few ms fade out linearly so truncation at -60 dB never clicks
  const nf = Math.min(len, Math.round(0.012 * sr));
  const fadeFrom = len - nf;
  for (i = 2; i < len; i++) {
    const s = c * s1 - r2 * s0;
    s0 = s1;
    s1 = s;
    let v = i < na ? s * riseAt(i, na) : s;
    if (i > fadeFrom) v *= (len - i) / nf;
    out[n0 + i] += v;
  }
}

export interface ToneOpts {
  start: number;
  dur: number;
  freq: number;
  /** Target frequency for a glide (exponential), reached after `glide` seconds. */
  freqTo?: number;
  glide?: number;
  amp: number;
  attack?: number;
  release?: number;
  /** Optional exponential decay (t60 seconds) applied on top of the envelope. */
  t60?: number;
  vibRate?: number;
  /** Vibrato depth as a ratio (0.006 ≈ 10 cents). */
  vibDepth?: number;
  /** Delay before the vibrato fades in. */
  vibDelay?: number;
  /** 0 = pure sine … 1 = soft, band-limited saw-ish (first 6 harmonics, 1/k²). */
  bright?: number;
  phase?: number;
}

/** Sine (optionally with a few soft harmonics), pitch glide, vibrato and a smooth envelope. */
export function addTone(out: Float32Array, sr: number, o: ToneOpts): void {
  const n0 = Math.round(o.start * sr);
  const len = Math.min(out.length - n0, Math.round(o.dur * sr));
  if (len <= 0 || n0 < 0) return;
  const na = Math.max(1, Math.round((o.attack ?? 0.01) * sr));
  const nr = Math.max(1, Math.round((o.release ?? 0.05) * sr));
  const decay = o.t60 ? Math.pow(10, -3 / (o.t60 * sr)) : 1;
  const glideN = Math.max(1, Math.round((o.glide ?? o.dur) * sr));
  const f0 = o.freq;
  const f1 = o.freqTo ?? o.freq;
  const lr = Math.log(f1 / f0);
  const vibW = (TAU * (o.vibRate ?? 5.5)) / sr;
  const vibD = o.vibDepth ?? 0;
  const vibDelayN = Math.round((o.vibDelay ?? 0.15) * sr);
  const bright = o.bright ?? 0;
  const nyq = sr * 0.45;
  let ph = o.phase ?? 0;
  let dec = 1;
  for (let i = 0; i < len; i++) {
    const g = i < glideN ? i / glideN : 1;
    let f = f0 * Math.exp(lr * (g * g * (3 - 2 * g))); // smoothstep glide
    if (vibD > 0 && i > vibDelayN) {
      const vd = Math.min(1, (i - vibDelayN) / (0.25 * sr));
      f *= 1 + vibD * vd * Math.sin(vibW * i);
    }
    ph += (TAU * f) / sr;
    if (ph > TAU) ph -= TAU;
    let s = Math.sin(ph);
    if (bright > 0) {
      let h = 0;
      for (let k = 2; k <= 6; k++) if (f * k < nyq) h += Math.sin(ph * k) / (k * k);
      s = s * (1 - 0.3 * bright) + h * bright;
    }
    let env = riseAt(i, na);
    if (i > len - nr) env *= 0.5 + 0.5 * Math.cos((Math.PI * (i - (len - nr))) / nr);
    out[n0 + i] += o.amp * env * dec * s;
    dec *= decay;
  }
}

/** PolyBLEP correction for band-limited saw/pulse. */
function polyBlep(t: number, dt: number): number {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

/** Band-limited sawtooth sample for a normalized phase in [0,1) and increment dt. */
export function sawBlep(phase: number, dt: number): number {
  return 2 * phase - 1 - polyBlep(phase, dt);
}

/* ------------------------------------------------------------------ noise */

/** White noise buffer in [-1, 1]. */
export function whiteNoise(n: number, rng: Rng): Float32Array {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = rng() * 2 - 1;
  return x;
}

/** Pink-ish noise (Paul Kellet's economy filter), roughly unit peak. */
export function pinkNoise(n: number, rng: Rng): Float32Array {
  const x = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = rng() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    x[i] = (b0 + b1 + b2 + w * 0.1848) * 0.25;
  }
  return x;
}

/** Brown (red) noise: leaky integrated white noise, roughly unit peak. */
export function brownNoise(n: number, rng: Rng): Float32Array {
  const x = new Float32Array(n);
  let y = 0;
  for (let i = 0; i < n; i++) {
    y = (y + 0.02 * (rng() * 2 - 1)) * 0.998;
    x[i] = y * 3.5;
  }
  return x;
}

/* ------------------------------------------------------------------ filters */

export type BiquadType = 'lowpass' | 'highpass' | 'bandpass' | 'peaking' | 'lowshelf' | 'highshelf';

/** RBJ cookbook biquad (transposed direct form II). Coefficients can be changed while running. */
export class Biquad {
  private b0 = 1; private b1 = 0; private b2 = 0; private a1 = 0; private a2 = 0;
  private z1 = 0; private z2 = 0;
  constructor(private sr: number, type: BiquadType = 'lowpass', freq = 1000, q = 0.707, gainDb = 0) {
    this.set(type, freq, q, gainDb);
  }
  set(type: BiquadType, freq: number, q = 0.707, gainDb = 0): this {
    const f = clamp(freq, 10, this.sr * 0.49);
    const w = (TAU * f) / this.sr;
    const cw = Math.cos(w), sw = Math.sin(w);
    const alpha = sw / (2 * Math.max(1e-3, q));
    const A = Math.pow(10, gainDb / 40);
    let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
    switch (type) {
      case 'lowpass': b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
      case 'highpass': b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
      case 'bandpass': b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
      case 'peaking': b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A; break;
      case 'lowshelf': {
        const s2 = 2 * Math.sqrt(A) * alpha;
        b0 = A * ((A + 1) - (A - 1) * cw + s2); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - s2);
        a0 = (A + 1) + (A - 1) * cw + s2; a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - s2;
        break;
      }
      case 'highshelf': {
        const s2 = 2 * Math.sqrt(A) * alpha;
        b0 = A * ((A + 1) + (A - 1) * cw + s2); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - s2);
        a0 = (A + 1) - (A - 1) * cw + s2; a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - s2;
        break;
      }
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    return this;
  }
  process(x: number): number {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
  /** Filter a buffer in place (optionally a sub-range). */
  run(buf: Float32Array, from = 0, to = buf.length): Float32Array {
    for (let i = from; i < to; i++) buf[i] = this.process(buf[i]);
    return buf;
  }
  reset(): void { this.z1 = this.z2 = 0; }
}

/** One-pole lowpass, cheap and smooth. */
export class OnePole {
  private y = 0;
  private a = 0;
  constructor(private sr: number, freq: number) { this.setFreq(freq); }
  setFreq(freq: number): void { this.a = Math.exp((-TAU * clamp(freq, 1, this.sr * 0.49)) / this.sr); }
  process(x: number): number { this.y = x + this.a * (this.y - x); return this.y; }
}

/* ------------------------------------------------------------------ physical models */

/**
 * Karplus–Strong plucked string with fractional-delay tuning and pluck-position comb.
 * `bright` 0..1 shapes the excitation (0 = dark thumb pluck, 1 = bright pick).
 */
export function addPluck(
  out: Float32Array, sr: number, start: number, freq: number, amp: number, t60: number,
  bright: number, rng: Rng, pluckPos = 0.18,
): void {
  const n0 = Math.round(start * sr);
  if (n0 < 0 || n0 >= out.length || freq <= 20) return;
  const P = sr / freq;
  const D = Math.max(2, Math.floor(P - 0.5 - 0.1));
  const delta = P - 0.5 - D;
  const C = (1 - delta) / (1 + delta);
  const ring = new Float32Array(D);
  // excitation: lowpassed noise with pluck-position comb, DC removed
  const lp = new OnePole(sr, 800 + 9000 * bright * bright);
  let mean = 0;
  for (let i = 0; i < D; i++) { ring[i] = lp.process(rng() * 2 - 1); mean += ring[i]; }
  mean /= D;
  const pp = Math.max(1, Math.round(D * pluckPos));
  const ex = new Float32Array(D);
  for (let i = 0; i < D; i++) ex[i] = ring[i] - mean - (i >= pp ? ring[i - pp] - mean : 0);
  let pk = 0;
  for (let i = 0; i < D; i++) pk = Math.max(pk, Math.abs(ex[i]));
  for (let i = 0; i < D; i++) ring[i] = (ex[i] / (pk || 1)) * amp;
  const g = Math.pow(10, -3 / (t60 * freq));
  const len = Math.min(out.length - n0, Math.ceil(t60 * sr));
  let idx = 0, prev = 0, apX1 = 0, apY1 = 0;
  for (let i = 0; i < len; i++) {
    const cur = ring[idx];
    out[n0 + i] += cur;
    const avg = 0.5 * (cur + prev);
    const ap = C * avg + apX1 - C * apY1;
    apX1 = avg;
    apY1 = ap;
    ring[idx] = g * ap;
    prev = cur;
    if (++idx >= D) idx = 0;
  }
}

/** A short filtered noise burst (mallet thump, tick, puff…). Envelope: attack then exponential decay. */
export function addNoiseBurst(
  out: Float32Array, sr: number, rng: Rng, start: number, dur: number, amp: number,
  filter: { type: BiquadType; freq: number; q?: number; freqTo?: number }, attack = 0.001,
): void {
  const n0 = Math.round(start * sr);
  const len = Math.min(out.length - n0, Math.round(dur * sr));
  if (len <= 0 || n0 < 0) return;
  const bq = new Biquad(sr, filter.type, filter.freq, filter.q ?? 0.707);
  const na = Math.max(1, Math.round(attack * sr));
  const tau = dur / 5;
  const sweep = filter.freqTo !== undefined;
  const lr = sweep ? Math.log(filter.freqTo! / filter.freq) : 0;
  for (let i = 0; i < len; i++) {
    if (sweep && (i & 31) === 0) bq.set(filter.type, filter.freq * Math.exp((lr * i) / len), filter.q ?? 0.707);
    const t = i / sr;
    const env = riseAt(i, na) * Math.exp(-t / tau) * (i > len - 64 ? (len - i) / 64 : 1);
    out[n0 + i] += amp * env * bq.process(rng() * 2 - 1);
  }
}

/**
 * Shaped noise swell (breath, air, wind): noise through a time-varying band-pass whose centre,
 * width and gain follow the supplied curves. `env(u)` and `freq(u)` take u = 0..1 over the event.
 */
export function addAir(
  out: Float32Array, sr: number, rng: Rng, start: number, dur: number, amp: number,
  env: (u: number) => number, freq: (u: number) => number, q = 1.2, color: 'white' | 'pink' = 'pink',
): void {
  const n0 = Math.round(start * sr);
  const len = Math.min(out.length - n0, Math.round(dur * sr));
  if (len <= 0 || n0 < 0) return;
  const bq = new Biquad(sr, 'bandpass', freq(0), q);
  const bq2 = new Biquad(sr, 'bandpass', freq(0), q);
  let b0 = 0, b1 = 0, b2 = 0;
  let e = env(0);
  const taper = Math.max(1, Math.round(len * 0.12));
  for (let i = 0; i < len; i++) {
    if ((i & 31) === 0) {
      const u = i / len;
      const f = freq(u);
      bq.set('bandpass', f, q);
      bq2.set('bandpass', f, q);
      e = env(u);
      if (i > len - taper) e *= 0.5 - 0.5 * Math.cos((Math.PI * (len - i)) / taper);
    }
    let w = rng() * 2 - 1;
    if (color === 'pink') {
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      w = (b0 + b1 + b2 + w * 0.1848) * 0.3;
    }
    out[n0 + i] += amp * e * bq2.process(bq.process(w)) * 2.2;
  }
}

/* ------------------------------------------------------------------ FFT & convolution */

export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/** In-place iterative radix-2 complex FFT. `inverse` scales by 1/N. */
export function fft(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 1 : -1) * TAU) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

/** Linear convolution via FFT (used offline: WAV export, previews). */
export function convolve(x: Float32Array, h: Float32Array): Float32Array {
  const outLen = x.length + h.length - 1;
  const n = nextPow2(outLen);
  const ar = new Float64Array(n), ai = new Float64Array(n);
  const br = new Float64Array(n), bi = new Float64Array(n);
  ar.set(x); br.set(h);
  fft(ar, ai); fft(br, bi);
  for (let i = 0; i < n; i++) {
    const r = ar[i] * br[i] - ai[i] * bi[i];
    ai[i] = ar[i] * bi[i] + ai[i] * br[i];
    ar[i] = r;
  }
  fft(ar, ai, true);
  const y = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) y[i] = ar[i];
  return y;
}

/** Magnitude spectrum of a windowed frame (Hann), length n/2. */
export function magnitudeSpectrum(x: Float32Array, from: number, n: number): Float64Array {
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const j = from + i;
    const v = j >= 0 && j < x.length ? x[j] : 0;
    re[i] = v * (0.5 - 0.5 * Math.cos((TAU * i) / (n - 1)));
  }
  fft(re, im);
  const m = new Float64Array(n >> 1);
  for (let i = 0; i < m.length; i++) m[i] = Math.hypot(re[i], im[i]);
  return m;
}

/* ------------------------------------------------------------------ room */

/**
 * Impulse response of "an old library on a winter evening": a small, wooden, book-lined room —
 * short pre-delay, a handful of soft early reflections, then a dense warm tail whose highs die
 * much faster than its lows (books absorb treble). Stereo, decorrelated, unit energy.
 * The same IR drives the browser ConvolverNode and the offline WAV previews.
 */
export function makeRoomIR(sr: number, seconds = 1.6, seed = 7, rt60 = 1.25): Channels {
  const n = Math.round(seconds * sr);
  const out: Channels = [];
  for (let c = 0; c < 2; c++) {
    const rng = mulberry32(seed * 31 + c * 977);
    const x = new Float32Array(n);
    // early reflections 7–55 ms
    const lp = new OnePole(sr, 5000);
    for (let k = 0; k < 14; k++) {
      const t = 0.007 + 0.048 * Math.pow(rng(), 0.8);
      const i = Math.round(t * sr);
      if (i < n) x[i] += (rng() < 0.5 ? -1 : 1) * 0.55 * Math.exp(-t / 0.035) * rand(rng, 0.4, 1);
    }
    for (let i = 0; i < n; i++) x[i] = lp.process(x[i]);
    // diffuse tail with frequency-dependent decay: a lowpass whose cutoff falls over time
    const pre = Math.round(0.016 * sr);
    const tail = new OnePole(sr, 7000);
    const tail2 = new OnePole(sr, 7000);
    const decay = Math.pow(10, -3 / (rt60 * sr));
    let g = 1;
    for (let i = 0; i < n - pre; i++) {
      if ((i & 63) === 0) {
        const t = i / sr;
        const fc = 600 + 6400 * Math.exp(-t / 0.28);
        tail.setFreq(fc);
        tail2.setFreq(fc);
      }
      const fade = riseAt(i, Math.round(0.03 * sr));
      x[pre + i] += 0.2 * fade * g * tail2.process(tail.process(rng() * 2 - 1));
      g *= decay;
    }
    fadeOut(x, sr, 0.2);
    out.push(x);
  }
  // unit energy (per channel average)
  let e = 0;
  for (const c of out) for (let i = 0; i < c.length; i++) e += c[i] * c[i];
  const k = 1 / Math.sqrt(e / 2 || 1);
  for (const c of out) scale(c, k);
  return out;
}
