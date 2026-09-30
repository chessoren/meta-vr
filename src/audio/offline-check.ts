/**
 * Loci — offline audio QA: render every sound with the pure DSP code, measure it, mix previews
 * with the same room IR the browser uses, and encode WAVs. Pure (no Node / DOM APIs) — used by
 * the Vitest checks and by scripts/render-audio.mjs.
 */
import { Biquad, convolve, magnitudeSpectrum, makeRoomIR, mixInto, peakOf, rmsOf, type Channels } from './dsp';
import { CUES, CUE_NAMES, type Cue } from './cues';
import { OBJECT_VOICE_COUNT, type ObjectVoiceKind } from './voices';
import type { FlameMood } from './flame';
import { AMB, AmbienceSequencer, renderBed, type AmbKind } from './ambience';
import { FLAME_SEND, IR_SECONDS, OBJECT_SEND, REVERB_RETURN, renderAmb, renderCue, renderFlame, renderObjectVoice } from './render';

export interface SoundStats {
  name: string;
  channels: number;
  duration: number;
  peak: number;
  rms: number;
  hasNaN: boolean;
  /** Energy-weighted mean spectral centroid (Hz). */
  centroid: number;
  /** Peak of the final 5 ms (click check). */
  tailPeak: number;
}

export function hasNaN(ch: Channels): boolean {
  for (const c of ch) for (let i = 0; i < c.length; i++) if (!Number.isFinite(c[i])) return true;
  return false;
}

export function spectralCentroid(x: Float32Array, sr: number, n = 2048): number {
  let num = 0, den = 0;
  for (let from = 0; from < x.length; from += n / 2) {
    const m = magnitudeSpectrum(x, from, n);
    for (let k = 1; k < m.length; k++) {
      const p = m[k] * m[k];
      num += p * ((k * sr) / n);
      den += p;
    }
  }
  return den > 0 ? num / den : 0;
}

export function analyze(name: string, ch: Channels, sr: number): SoundStats {
  const tailN = Math.max(1, Math.round(0.005 * sr));
  let peak = 0, rmsSq = 0, tailPeak = 0;
  for (const c of ch) {
    peak = Math.max(peak, peakOf(c));
    rmsSq += rmsOf(c) ** 2;
    tailPeak = Math.max(tailPeak, peakOf(c.subarray(Math.max(0, c.length - tailN))));
  }
  return {
    name, channels: ch.length, duration: ch[0].length / sr, peak, rms: Math.sqrt(rmsSq / ch.length),
    hasNaN: hasNaN(ch), centroid: spectralCentroid(ch[0], sr), tailPeak,
  };
}

/**
 * Coarse spectro-temporal fingerprint: log-spaced bands (80 Hz–12 kHz) × time frames, each
 * frame normalised — captures both timbre and melody, used to prove object voices are distinct.
 */
export function fingerprint(x: Float32Array, sr: number, bands = 48, frameSec = 0.06, frames = 24): Float64Array {
  const n = 2048;
  const hop = Math.round(frameSec * sr);
  const fp = new Float64Array(bands * frames);
  const edges: number[] = [];
  for (let b = 0; b <= bands; b++) edges.push(80 * Math.pow(12000 / 80, b / bands));
  for (let f = 0; f < frames; f++) {
    const m = magnitudeSpectrum(x, f * hop, n);
    for (let k = 1; k < m.length; k++) {
      const hz = (k * sr) / n;
      if (hz < edges[0] || hz >= edges[bands]) continue;
      let b = 0;
      while (b < bands - 1 && hz >= edges[b + 1]) b++;
      fp[f * bands + b] += m[k] * m[k];
    }
  }
  // magnitude per band, each frame weighted by its loudness (cube-root compression keeps quiet tails relevant)
  for (let i = 0; i < fp.length; i++) fp[i] = Math.cbrt(fp[i]);
  return fp;
}

export function cosine(a: Float64Array, b: Float64Array): number {
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; }
  return ab / Math.sqrt(aa * bb || 1);
}

/** Phrases the flame is expected to sing during onboarding (used for previews & tests). */
export const FLAME_SAMPLES: readonly [string, FlameMood][] = [
  ['Hello!', 'happy'],
  ['Pinch me', 'happy'],
  ['Your room?', 'curious'],
  ['Place it here', 'curious'],
  ['Five out of five!', 'proud'],
  ['You did it', 'proud'],
  ['Good night', 'sleepy'],
  ['See you tomorrow', 'sleepy'],
];

export interface RenderedSound { name: string; group: 'cue' | 'object' | 'flame' | 'ambience'; ch: Channels; send: number }

/** Render every sound of the app (all cue variants, 24×3 object voices, flame samples, ambience banks). */
export function renderAll(sr: number): RenderedSound[] {
  const out: RenderedSound[] = [];
  for (const cue of CUE_NAMES) {
    const spec = CUES[cue];
    for (let v = 0; v < (spec.variants ?? 1); v++) {
      out.push({ name: v ? `${cue}-${v}` : cue, group: 'cue', ch: [renderCue(cue, sr, v)], send: spec.send });
    }
  }
  const kinds: ObjectVoiceKind[] = ['select', 'place', 'reveal'];
  for (let i = 0; i < OBJECT_VOICE_COUNT; i++) {
    for (const k of kinds) out.push({ name: `obj-${String(i).padStart(2, '0')}-${k}`, group: 'object', ch: [renderObjectVoice(i, k, sr)], send: OBJECT_SEND });
  }
  for (const [w, m] of FLAME_SAMPLES) {
    out.push({ name: `flame-${m}-${w.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '')}`, group: 'flame', ch: [renderFlame(w, m, sr)], send: FLAME_SEND });
  }
  const banks: [AmbKind, number][] = [['pop', AMB.pops], ['hiss', AMB.hiss], ['wind', AMB.wind], ['rustle', AMB.rustle]];
  for (const [k, n] of banks) for (let v = 0; v < n; v++) out.push({ name: `amb-${k}-${v}`, group: 'ambience', ch: renderAmb(k, v, sr), send: 0 });
  return out;
}

/** Check a cue render: returns a list of problems (empty = fine). */
export function checkCue(cue: Cue, sr: number): string[] {
  const spec = CUES[cue];
  const probs: string[] = [];
  for (let v = 0; v < (spec.variants ?? 1); v++) {
    const s = analyze(cue, [renderCue(cue, sr, v)], sr);
    if (s.hasNaN) probs.push(`${cue}/${v}: NaN`);
    if (s.peak > 0.9) probs.push(`${cue}/${v}: peak ${s.peak.toFixed(3)}`);
    if (s.rms < 1e-3) probs.push(`${cue}/${v}: silent (rms ${s.rms})`);
    if (s.duration > spec.dur + 1e-6 || s.duration < 0.03) probs.push(`${cue}/${v}: duration ${s.duration}`);
    if (s.tailPeak > 0.02) probs.push(`${cue}/${v}: click at end (${s.tailPeak.toFixed(3)})`);
  }
  return probs;
}

/** Stereo preview = dry (centre) + shared room reverb, like the browser graph. */
export function previewMix(dry: Channels, sr: number, send: number, ir: Channels): Channels {
  const monoIn = dry.length === 1 ? dry[0].slice() : dry[0].map((v, i) => 0.5 * (v + dry[1][i]));
  new Biquad(sr, 'highpass', 160, 0.6).run(monoIn); // same reverb-input HP as the browser graph
  const L = new Float32Array(monoIn.length + (send > 0 ? ir[0].length : 0));
  const R = new Float32Array(L.length);
  mixInto(L, dry[0]);
  mixInto(R, dry[dry.length - 1]);
  if (send > 0) {
    mixInto(L, convolve(monoIn, ir[0]), 0, send * REVERB_RETURN);
    mixInto(R, convolve(monoIn, ir[1]), 0, send * REVERB_RETURN);
  }
  // trim trailing silence
  let end = L.length;
  while (end > 1 && Math.abs(L[end - 1]) < 1e-4 && Math.abs(R[end - 1]) < 1e-4) end--;
  const out = [L.slice(0, end), R.slice(0, end)];
  const p = Math.max(peakOf(out[0]), peakOf(out[1]));
  if (p > 0.95) for (const c of out) for (let i = 0; i < c.length; i++) c[i] *= 0.95 / p;
  return out;
}

export const roomIR = (sr: number) => makeRoomIR(sr, IR_SECONDS);

/** Mix `seconds` of the ambience exactly as the engine schedules it (level = ambience bus gain). */
export function composeAmbience(sr: number, seconds: number, seed = 1, level = 0.6): Channels {
  const n = Math.round(seconds * sr);
  const L = new Float32Array(n), R = new Float32Array(n);
  const bed = renderBed(sr);
  for (let i = 0; i < n; i++) { L[i] = bed[0][i % bed[0].length] * level; R[i] = bed[1][i % bed[1].length] * level; }
  const cache = new Map<string, Channels>();
  const seq = new AmbienceSequencer(seed);
  for (const e of seq.advance(seconds)) {
    const key = `${e.kind}:${e.variant}`;
    let ch = cache.get(key);
    if (!ch) { ch = renderAmb(e.kind, e.variant, sr); cache.set(key, ch); }
    const off = Math.round(e.t * sr);
    const a = ((e.pan + 1) * Math.PI) / 4;
    const gl = e.gain * level * (ch.length === 2 ? 1 : Math.cos(a) * Math.SQRT2);
    const gr = e.gain * level * (ch.length === 2 ? 1 : Math.sin(a) * Math.SQRT2);
    // resample by `rate` (linear) like AudioBufferSourceNode.playbackRate
    const src = ch;
    const outLen = Math.floor(src[0].length / e.rate);
    for (let i = 0; i < outLen && off + i < n; i++) {
      const p = i * e.rate, i0 = Math.floor(p), fr = p - i0;
      const s0 = src[0], s1 = src[src.length - 1];
      const vl = s0[i0] + ((i0 + 1 < s0.length ? s0[i0 + 1] : 0) - s0[i0]) * fr;
      const vr = s1[i0] + ((i0 + 1 < s1.length ? s1[i0 + 1] : 0) - s1[i0]) * fr;
      L[off + i] += vl * gl;
      R[off + i] += vr * gr;
    }
  }
  return [L, R];
}

/** 16-bit PCM WAV (interleaved). */
export function encodeWav(ch: Channels, sr: number): Uint8Array {
  const nch = ch.length, n = ch[0].length;
  const data = n * nch * 2;
  const buf = new ArrayBuffer(44 + data);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + data, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nch, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * nch * 2, true); v.setUint16(32, nch * 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, data, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nch; c++) {
      const s = Math.max(-1, Math.min(1, ch[c][i]));
      v.setInt16(o, Math.round(s * 32767), true);
      o += 2;
    }
  }
  return new Uint8Array(buf);
}

const db = (x: number) => (x > 0 ? (20 * Math.log10(x)).toFixed(1) : '-inf');

export function formatTable(rows: SoundStats[]): string {
  const head = `${'sound'.padEnd(34)} ${'ch'.padStart(2)} ${'dur s'.padStart(6)} ${'peak'.padStart(6)} ${'pk dB'.padStart(6)} ${'rms dB'.padStart(7)} ${'centroid'.padStart(9)}`;
  const lines = rows.map((r) =>
    `${r.name.padEnd(34)} ${String(r.channels).padStart(2)} ${r.duration.toFixed(2).padStart(6)} ${r.peak.toFixed(3).padStart(6)} ${db(r.peak).padStart(6)} ${db(r.rms).padStart(7)} ${Math.round(r.centroid).toString().padStart(8)}Hz`);
  return [head, '-'.repeat(head.length), ...lines].join('\n');
}
