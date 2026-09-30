/**
 * Loci — the flame's tiny sung voice.
 *
 * Not speech synthesis: a wordless, syllabic babble with the rhythm of the words it "says".
 * Each vowel group of each word becomes one sung syllable; its vowel colour comes from the
 * letters (formant filtering), its onset from the consonant before it (a soft plosive tap,
 * a hiss, a hum, a glide), and its pitch from a mood-shaped contour in D major pentatonic — so
 * the flame literally sings in the app's key. Deterministic per (words, mood).
 */
import { Biquad, OnePole, TAU, addNoiseBurst, alloc, clamp, hashString, mulberry32, sawBlep, type Rng } from './dsp';
import { pentaHz } from './music';

export type FlameMood = 'happy' | 'curious' | 'proud' | 'sleepy';
export type Vowel = 'a' | 'e' | 'i' | 'o' | 'u';
export type Onset = 'none' | 'plosive' | 'fric' | 'breath' | 'nasal' | 'liquid';

export interface FlameSyllable {
  /** Start time (s) from the beginning of the utterance. */
  t: number;
  dur: number;
  vowel: Vowel;
  vowelTo: Vowel;
  onset: Onset;
  /** Centre frequency of the plosive tap (place of articulation). */
  tapHz: number;
  /** Sung pitch (Hz) and the pitch it glides to by the end of the syllable. */
  f0: number;
  fTo: number;
  amp: number;
  wordEnd: boolean;
}

export interface FlameUtterance {
  words: string;
  mood: FlameMood;
  /** Total length (s), including the release of the last syllable. */
  duration: number;
  syllables: FlameSyllable[];
}

interface MoodStyle {
  lo: number; hi: number; start: number;
  syl: number; wordGap: number; finalStretch: number;
  breath: number; tilt: number; vib: number;
}
const MOODS: Record<FlameMood, MoodStyle> = {
  happy: { lo: 5, hi: 10, start: 7, syl: 0.12, wordGap: 0.05, finalStretch: 1.6, breath: 0.025, tilt: 4800, vib: 0.007 },
  curious: { lo: 4, hi: 9, start: 6, syl: 0.14, wordGap: 0.07, finalStretch: 1.9, breath: 0.035, tilt: 4000, vib: 0.006 },
  proud: { lo: 4, hi: 10, start: 9, syl: 0.15, wordGap: 0.08, finalStretch: 2.3, breath: 0.03, tilt: 4200, vib: 0.011 },
  sleepy: { lo: 0, hi: 5, start: 4, syl: 0.22, wordGap: 0.12, finalStretch: 2.4, breath: 0.12, tilt: 2200, vib: 0.004 },
};

const FORMANTS: Record<Vowel, readonly [number, number, number]> = {
  a: [950, 1500, 3000],
  e: [560, 2300, 3200],
  i: [380, 2800, 3700],
  o: [600, 1000, 2900],
  u: [420, 950, 2700],
};
const GLIDE_FROM: readonly [number, number, number] = [360, 850, 2400];
const NASAL: readonly [number, number, number] = [280, 1100, 2600];

const PLOSIVES = 'pbtdkgcq';
const tapFor = (c: string) => ('pb'.includes(c) ? 900 : 'td'.includes(c) ? 3600 : 1900);

function vowelOf(ch: string): Vowel {
  if (ch === 'a') return 'a';
  if (ch === 'e') return 'e';
  if (ch === 'o') return 'o';
  if (ch === 'u') return 'u';
  return 'i';
}

function onsetOf(cluster: string): { onset: Onset; tap: number } {
  for (const c of cluster) if (PLOSIVES.includes(c)) return { onset: 'plosive', tap: tapFor(c) };
  if (/[szxj]/.test(cluster)) return { onset: 'fric', tap: 0 };
  if (/[fvh]/.test(cluster)) return { onset: 'breath', tap: 0 };
  if (/[mn]/.test(cluster)) return { onset: 'nasal', tap: 0 };
  if (/[lrwy]/.test(cluster)) return { onset: 'liquid', tap: 0 };
  return { onset: 'none', tap: 0 };
}

interface RawSyl { vowel: Vowel; vowelTo: Vowel; onset: Onset; tap: number; wordEnd: boolean; wordStart: boolean }

/** Split text into sung syllables (one per vowel group; digits sing one syllable each). */
export function syllabify(words: string): RawSyl[] {
  const clean = words.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const tokens = clean.match(/[a-z']+|\d/g) ?? [];
  const out: RawSyl[] = [];
  for (const tok of tokens) {
    const w = tok.replace(/'/g, '');
    if (!w) continue;
    if (/^\d$/.test(w)) {
      out.push({ vowel: 'a', vowelTo: 'i', onset: 'none', tap: 0, wordEnd: true, wordStart: true });
      continue;
    }
    const re = /[aeiouy]+/g;
    let m: RegExpExecArray | null;
    let prevEnd = 0;
    const syl: RawSyl[] = [];
    while ((m = re.exec(w))) {
      let g = m[0];
      // a leading 'y' before another vowel is a glide ("you", "yes")
      let cluster = w.slice(prevEnd, m.index);
      if (g.length > 1 && g[0] === 'y') { cluster += 'y'; g = g.slice(1); }
      // silent final 'e' (e.g. "the" keeps it, "pale" doesn't) — merge into previous syllable
      if (g === 'e' && m.index === w.length - 1 && syl.length > 0 && cluster.length > 0) break;
      const { onset, tap } = onsetOf(cluster);
      syl.push({ vowel: vowelOf(g[0]), vowelTo: vowelOf(g[g.length - 1]), onset, tap, wordEnd: false, wordStart: syl.length === 0 });
      prevEnd = m.index + m[0].length;
    }
    if (syl.length === 0) {
      const { onset, tap } = onsetOf(w);
      syl.push({ vowel: 'u', vowelTo: 'u', onset: onset === 'none' ? 'nasal' : onset, tap, wordEnd: false, wordStart: true });
    }
    syl[syl.length - 1].wordEnd = true;
    out.push(...syl);
  }
  if (out.length === 0) out.push({ vowel: 'u', vowelTo: 'a', onset: 'nasal', tap: 0, wordEnd: true, wordStart: true });
  return out.slice(0, 14).map((s, i, a) => (i === a.length - 1 ? { ...s, wordEnd: true } : s));
}

/** Pure plan of what the flame sings (timings, vowels, pitches) — also drives mouth animation. */
export function planFlameVoice(words: string, mood: FlameMood = 'happy'): FlameUtterance {
  const st = MOODS[mood] ?? MOODS.happy;
  const rng: Rng = mulberry32(hashString(`${mood}|${words.trim().toLowerCase()}`));
  const raw = syllabify(words);
  const n = raw.length;
  const syllables: FlameSyllable[] = [];
  let t = 0.02;
  let step = st.start + (rng() < 0.5 ? 0 : 1);
  for (let k = 0; k < n; k++) {
    const r = raw[k];
    const last = k === n - 1;
    // contour
    if (k > 0) {
      let d: number;
      if (mood === 'proud') d = last ? 0 : -Math.round(rng() * 1.4);
      else if (mood === 'sleepy') d = -Math.round(rng() * 1.2);
      else if (mood === 'happy') d = (k % 2 ? 1 : -1) * (1 + Math.round(rng())) + (rng() < 0.3 ? 1 : 0);
      else d = Math.round(rng() * 4) - 2;
      step = clamp(step + d, st.lo, st.hi);
    }
    if (last && mood === 'proud') step = 5;
    let stepTo = step;
    if (last) {
      if (mood === 'happy') stepTo = step + 1;
      else if (mood === 'curious') stepTo = step + 2 + Math.round(rng());
      else if (mood === 'sleepy') stepTo = step - 2;
    }
    const stretch = last ? st.finalStretch : r.wordEnd ? 1.3 : 1;
    const dur = st.syl * stretch * (0.9 + 0.2 * rng()) + (r.onset === 'fric' || r.onset === 'breath' ? 0.03 : 0);
    const amp = (r.wordStart ? 1 : 0.82) * (0.9 + 0.1 * rng());
    syllables.push({
      t, dur, vowel: r.vowel, vowelTo: mood === 'sleepy' && last && r.vowel === 'a' ? 'o' : r.vowelTo,
      onset: r.onset, tapHz: r.tap, f0: pentaHz(step), fTo: pentaHz(stepTo), amp, wordEnd: r.wordEnd,
    });
    t += r.wordEnd ? dur + st.wordGap : dur * 0.94;
  }
  const lastS = syllables[syllables.length - 1];
  return { words, mood, duration: lastS.t + lastS.dur + 0.06, syllables };
}

const smooth = (u: number) => u * u * (3 - 2 * u);

/** Render an utterance to a mono buffer (un-normalised; render.ts normalises). */
export function renderFlameVoice(u: FlameUtterance, sr: number): Float32Array {
  const st = MOODS[u.mood] ?? MOODS.happy;
  const out = alloc(sr, u.duration + 0.15);
  const len = out.length;
  const CR = 16;
  const nc = Math.ceil(len / CR) + 1;
  const cF0 = new Float32Array(nc), cAmp = new Float32Array(nc);
  const cF1 = new Float32Array(nc), cF2 = new Float32Array(nc), cF3 = new Float32Array(nc);
  const cNas = new Float32Array(nc), cVib = new Float32Array(nc);
  cF0.fill(u.syllables[0].f0);
  cF1.fill(FORMANTS.a[0]); cF2.fill(FORMANTS.a[1]); cF3.fill(FORMANTS.a[2]);
  const rng = mulberry32(hashString(`voice|${u.mood}|${u.words}`));
  let prevF0 = u.syllables[0].f0;
  for (const s of u.syllables) {
    const c0 = Math.floor((s.t * sr) / CR);
    const c1 = Math.min(nc - 1, Math.ceil(((s.t + s.dur) * sr) / CR));
    const span = Math.max(1, c1 - c0);
    const vot = s.onset === 'plosive' ? 0.012 : s.onset === 'fric' || s.onset === 'breath' ? 0.03 : 0;
    const att = s.onset === 'plosive' ? 0.008 : s.onset === 'nasal' ? 0.012 : 0.018;
    const rel = s.wordEnd ? 0.045 : 0.02;
    const A = FORMANTS[s.vowel], B = FORMANTS[s.vowelTo];
    for (let c = c0; c <= c1; c++) {
      const tl = ((c - c0) * CR) / sr;
      const uu = (c - c0) / span;
      // pitch: portamento in, optional glide out
      let f = s.f0;
      const port = Math.min(1, tl / 0.035);
      f = prevF0 * Math.pow(s.f0 / prevF0, smooth(port));
      if (s.fTo !== s.f0) f *= Math.pow(s.fTo / s.f0, smooth(clamp((uu - 0.4) / 0.6, 0, 1)));
      cF0[c] = f;
      // amplitude
      const ta = tl - vot;
      let env = ta <= 0 ? 0 : ta < att ? 0.5 - 0.5 * Math.cos((Math.PI * ta) / att) : 1;
      const tr = s.dur - tl;
      if (tr < rel) env *= s.wordEnd ? Math.max(0, tr / rel) ** 1.5 : 0.8 + 0.2 * Math.max(0, tr / rel);
      cAmp[c] = Math.max(cAmp[c], env * s.amp);
      // formants
      const vu = smooth(clamp(uu * 1.2, 0, 1));
      let f1 = A[0] + (B[0] - A[0]) * vu, f2 = A[1] + (B[1] - A[1]) * vu, f3 = A[2] + (B[2] - A[2]) * vu;
      let nas = 0;
      if (s.onset === 'liquid' || s.onset === 'nasal') {
        const from = s.onset === 'liquid' ? GLIDE_FROM : NASAL;
        const g = smooth(clamp(tl / 0.045, 0, 1));
        f1 = from[0] + (f1 - from[0]) * g; f2 = from[1] + (f2 - from[1]) * g; f3 = from[2] + (f3 - from[2]) * g;
        if (s.onset === 'nasal') nas = 1 - g;
      }
      cF1[c] = f1; cF2[c] = f2; cF3[c] = f3; cNas[c] = nas;
      cVib[c] = s.dur > 0.17 ? clamp((tl - 0.08) / 0.15, 0, 1) : 0;
    }
    prevF0 = s.fTo;
    // consonant noise
    if (s.onset === 'plosive') addNoiseBurst(out, sr, rng, s.t, 0.012, 0.22, { type: 'bandpass', freq: s.tapHz, q: 1.3 });
    else if (s.onset === 'fric') addNoiseBurst(out, sr, rng, s.t, 0.045, 0.1, { type: 'highpass', freq: 5200 }, 0.012);
    else if (s.onset === 'breath') addNoiseBurst(out, sr, rng, s.t, 0.04, 0.09, { type: 'bandpass', freq: 1400, q: 0.6 }, 0.01);
  }
  // voiced synthesis
  const b1 = new Biquad(sr, 'bandpass', 800, 8), b2 = new Biquad(sr, 'bandpass', 1500, 10), b3 = new Biquad(sr, 'bandpass', 3000, 14);
  const nasLp = new OnePole(sr, 320);
  const tilt = new OnePole(sr, st.tilt);
  const ampS = new OnePole(sr, 90);
  let ph = 0, sph = rng(), vph = 0;
  let jitter = 0;
  const vibW = (TAU * 5.8) / sr;
  for (let i = 0; i < len; i++) {
    const c = (i / CR) | 0;
    if ((i & (CR - 1)) === 0) {
      b1.set('bandpass', cF1[c], cF1[c] / 110);
      b2.set('bandpass', cF2[c], cF2[c] / 150);
      b3.set('bandpass', cF3[c], cF3[c] / 240);
      jitter = jitter * 0.97 + (rng() - 0.5) * 0.0009;
    }
    const a = ampS.process(cAmp[c]);
    if (a < 1e-5 && cAmp[c] === 0) { vph += vibW; continue; }
    vph += vibW;
    const f = cF0[c] * (1 + st.vib * cVib[c] * Math.sin(vph) + jitter);
    const dt = f / sr;
    ph += dt; if (ph >= 1) ph -= 1;
    sph += dt; if (sph >= 1) sph -= 1;
    const src = tilt.process(0.55 * sawBlep(ph, dt) + 0.6 * Math.sin(TAU * sph));
    const asp = st.breath * (rng() * 2 - 1) * 3;
    const x = src + asp;
    const oral = 1.0 * b1.process(x) + 0.75 * b2.process(x) + 0.28 * b3.process(x) + 0.1 * src;
    const nas = nasLp.process(src);
    const n = cNas[c];
    out[i] += a * ((1 - 0.8 * n) * oral + 0.9 * n * nas);
  }
  return out;
}
