import { describe, expect, it } from 'vitest';
import { CUES, CUE_NAMES, type Cue } from '../../src/audio/cues';
import { renderCue, renderJob } from '../../src/audio/render';
import { analyze, checkCue, encodeWav } from '../../src/audio/offline-check';
import { RENDER_RATE } from '../../src/audio/engine';

const SR = RENDER_RATE;
const ALL: Cue[] = [
  'pinch', 'release', 'bounce', 'scanPing', 'placeThunk', 'appear', 'dissolve', 'lightsOut', 'lightsOn', 'correct', 'wrong',
  'reveal', 'tierUp', 'tierAnchored', 'proof', 'hover', 'menuOpen', 'menuClose', 'palaceLoaded', 'phoneConnected', 'importReady',
  'goodbye', 'whoosh',
];
/** Musical/UX duration bounds (seconds) — short feedback stays short, celebrations may breathe. */
const BOUNDS: Partial<Record<Cue, [number, number]>> = {
  pinch: [0.03, 0.2], release: [0.03, 0.25], hover: [0.03, 0.25], bounce: [0.2, 0.6], placeThunk: [0.15, 0.5], whoosh: [0.3, 0.8],
  correct: [0.8, 2.5], wrong: [0.6, 1.8], tierAnchored: [2.5, 5], proof: [1.5, 3.5],
};

describe('audio cues', { timeout: 30000 }, () => {
  it('covers the whole Cue contract', () => {
    expect([...CUE_NAMES].sort()).toEqual([...ALL].sort());
  });

  for (const cue of ALL) {
    it(`${cue}: renders, non-silent, peak ≤ 0.9, no NaN, no end click, duration in bounds`, () => {
      expect(checkCue(cue, SR)).toEqual([]);
      const s = analyze(cue, [renderCue(cue, SR)], SR);
      const [lo, hi] = BOUNDS[cue] ?? [0.05, 5];
      expect(s.duration).toBeGreaterThanOrEqual(lo);
      expect(s.duration).toBeLessThanOrEqual(hi);
      expect(s.peak).toBeGreaterThan(0.1);
      expect(s.peak).toBeLessThanOrEqual(0.9);
    });
  }

  it('renders are deterministic and variants differ', () => {
    expect(renderCue('correct', SR)).toEqual(renderCue('correct', SR));
    const a = renderCue('placeThunk', SR, 0), b = renderCue('placeThunk', SR, 1);
    expect(a).not.toEqual(b);
  });

  it('wrong is soft (a breath): no energy spike, slow attack, darker than correct', () => {
    const w = renderCue('wrong', SR), c = renderCue('correct', SR);
    const w0 = analyze('w', [w], SR), c0 = analyze('c', [c], SR);
    expect(w0.centroid).toBeLessThan(c0.centroid);
    // attack: first 20 ms well below the peak (no buzzer-like onset)
    let early = 0;
    for (let i = 0; i < SR * 0.02; i++) early = Math.max(early, Math.abs(w[i]));
    expect(early).toBeLessThan(w0.peak * 0.5);
  });

  it('hover is the quietest cue; celebrations are the loudest', () => {
    const peak = (c: Cue) => CUES[c].peak;
    for (const c of ALL) if (c !== 'hover') expect(peak('hover')).toBeLessThan(peak(c));
    for (const c of ALL) expect(peak(c)).toBeLessThanOrEqual(peak('tierAnchored'));
  });

  it('renders at the context rate too (48 kHz) and encodes WAV', () => {
    const x = renderJob('cue:pinch:0', 48000);
    expect(x[0].length).toBeGreaterThan(1000);
    const wav = encodeWav(x, 48000);
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe('RIFF');
    expect(new DataView(wav.buffer).getUint32(24, true)).toBe(48000);
    expect(wav.length).toBe(44 + x[0].length * 2);
  });
});
