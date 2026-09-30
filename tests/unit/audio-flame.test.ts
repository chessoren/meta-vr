import { describe, expect, it } from 'vitest';
import { planFlameVoice, syllabify } from '../../src/audio/flame';
import { renderFlame } from '../../src/audio/render';
import { analyze, FLAME_SAMPLES } from '../../src/audio/offline-check';
import { PENTA, D4 } from '../../src/audio/music';
import { RENDER_RATE } from '../../src/audio/engine';

const SR = RENDER_RATE;

describe('flame voice', { timeout: 30000 }, () => {
  it('one syllable per vowel group', () => {
    expect(syllabify('Pinch me').length).toBe(2);
    expect(syllabify('Hello').length).toBe(2);
    expect(syllabify('tomorrow').length).toBe(3);
    expect(syllabify('Five').length).toBe(1); // silent final e
    expect(syllabify('Répète après moi').length).toBe(5); // accents stripped, French works
    expect(syllabify('').length).toBe(1); // a little "mm"
    expect(syllabify('5 out of 5').length).toBe(4);
  });

  it('is deterministic per (words, mood) and varies otherwise', () => {
    const a = renderFlame('Pinch me', 'happy', SR);
    expect(renderFlame('Pinch me', 'happy', SR)).toEqual(a);
    expect(renderFlame('Pinch me', 'sleepy', SR)).not.toEqual(a);
    expect(renderFlame('Pinch you', 'happy', SR)).not.toEqual(a);
    expect(planFlameVoice('Hello!', 'curious')).toEqual(planFlameVoice('Hello!', 'curious'));
  });

  it('sings in key with mood-shaped contours', () => {
    for (const [w, m] of FLAME_SAMPLES) {
      const plan = planFlameVoice(w, m);
      for (const s of plan.syllables) {
        for (const f of [s.f0, s.fTo]) {
          const semis = Math.round(12 * Math.log2(f / D4));
          expect(PENTA).toContain(((semis % 12) + 12) % 12);
        }
      }
    }
    const q = planFlameVoice('Your room?', 'curious').syllables.at(-1)!;
    expect(q.fTo).toBeGreaterThan(q.f0); // question rises
    const p = planFlameVoice('Five out of five!', 'proud').syllables.at(-1)!;
    expect(p.f0).toBeCloseTo(D4 * 2, 3); // proud lands on the tonic
    const s = planFlameVoice('Good night', 'sleepy');
    expect(s.syllables.at(-1)!.fTo).toBeLessThan(s.syllables.at(-1)!.f0); // sleepy sighs down
    expect(s.duration).toBeGreaterThan(planFlameVoice('Good night', 'happy').duration);
  });

  it('renders cleanly and stays short', () => {
    for (const [w, m] of [...FLAME_SAMPLES, ['A very long sentence that the flame should never really say in full', 'happy'] as const]) {
      const x = renderFlame(w, m, SR);
      const st = analyze(w, [x], SR);
      expect(st.hasNaN).toBe(false);
      expect(st.peak).toBeLessThanOrEqual(0.9);
      expect(st.rms).toBeGreaterThan(0.01);
      expect(st.duration).toBeLessThan(4);
      expect(st.tailPeak).toBeLessThan(0.02);
      expect(Math.abs(st.duration - planFlameVoice(w, m).duration)).toBeLessThan(0.2);
    }
  });
});
