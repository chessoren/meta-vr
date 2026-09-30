import { describe, expect, it } from 'vitest';
import { OBJECT_VOICE_COUNT, objectVoiceInfo, type ObjectVoiceKind } from '../../src/audio/voices';
import { FAMILIES } from '../../src/audio/instruments';
import { renderObjectVoice } from '../../src/audio/render';
import { analyze, cosine, fingerprint } from '../../src/audio/offline-check';
import { PENTA, D4 } from '../../src/audio/music';
import { RENDER_RATE } from '../../src/audio/engine';

const SR = RENDER_RATE;
const KINDS: ObjectVoiceKind[] = ['select', 'place', 'reveal'];

describe('object voices', { timeout: 60000 }, () => {
  const renders = new Map<string, Float32Array>();
  const get = (i: number, k: ObjectVoiceKind) => {
    const key = `${i}:${k}`;
    if (!renders.has(key)) renders.set(key, renderObjectVoice(i, k, SR));
    return renders.get(key)!;
  };

  it('all 24 × 3 render cleanly', () => {
    for (let i = 0; i < OBJECT_VOICE_COUNT; i++) {
      for (const k of KINDS) {
        const s = analyze(`${i}/${k}`, [get(i, k)], SR);
        expect(s.hasNaN).toBe(false);
        expect(s.peak).toBeLessThanOrEqual(0.9);
        expect(s.rms).toBeGreaterThan(0.005);
        expect(s.duration).toBeGreaterThan(0.4);
        expect(s.duration).toBeLessThan(4.5);
        expect(s.tailPeak).toBeLessThan(0.02);
      }
    }
  });

  it('every family is used 3 times and every motif is unique', () => {
    const fams = new Map<string, number>();
    const motifs = new Set<string>();
    for (let i = 0; i < OBJECT_VOICE_COUNT; i++) {
      const info = objectVoiceInfo(i);
      fams.set(info.family, (fams.get(info.family) ?? 0) + 1);
      const shape = info.steps.map((s) => s - info.steps[0]).join(',') + '|' + info.times.map((t) => t.toFixed(3)).join(',');
      motifs.add(shape);
    }
    expect([...fams.keys()].sort()).toEqual([...FAMILIES].sort());
    for (const n of fams.values()) expect(n).toBe(3);
    expect(motifs.size).toBe(OBJECT_VOICE_COUNT);
  });

  it('all motif notes are in D major pentatonic and in a comfortable register', () => {
    for (let i = 0; i < OBJECT_VOICE_COUNT; i++) {
      for (const f of objectVoiceInfo(i).freqs) {
        const semis = Math.round(12 * Math.log2(f / D4));
        expect(PENTA).toContain(((semis % 12) + 12) % 12);
        expect(f).toBeGreaterThan(200);
        expect(f).toBeLessThan(2500);
      }
    }
  });

  it('the 24 signatures are pairwise distinct (spectro-temporal fingerprint)', () => {
    for (const k of KINDS) {
      const fps = Array.from({ length: OBJECT_VOICE_COUNT }, (_, i) => fingerprint(get(i, k), SR));
      for (let i = 0; i < OBJECT_VOICE_COUNT; i++) {
        for (let j = i + 1; j < OBJECT_VOICE_COUNT; j++) {
          expect(cosine(fps[i], fps[j]), `${k} ${i} vs ${j}`).toBeLessThan(0.9);
        }
      }
    }
  });

  it('an object keeps its identity across kinds (select ~ place more than select ~ another object)', () => {
    let wins = 0;
    for (let i = 0; i < OBJECT_VOICE_COUNT; i++) {
      const self = cosine(fingerprint(get(i, 'select'), SR), fingerprint(get(i, 'place'), SR));
      const other = cosine(fingerprint(get(i, 'select'), SR), fingerprint(get((i + 1) % OBJECT_VOICE_COUNT, 'place'), SR));
      if (self > other) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(22);
  });

  it('indexes wrap and are deterministic', () => {
    expect(objectVoiceInfo(24).family).toBe(objectVoiceInfo(0).family);
    expect(objectVoiceInfo(-1).index).toBe(23);
    expect(renderObjectVoice(5, 'select', SR)).toEqual(get(5, 'select'));
  });
});
