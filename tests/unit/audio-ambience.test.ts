import { describe, expect, it } from 'vitest';
import { AMB, AmbienceSequencer, renderBed } from '../../src/audio/ambience';
import { renderAmb } from '../../src/audio/render';
import { analyze, composeAmbience } from '../../src/audio/offline-check';
import { RENDER_RATE } from '../../src/audio/engine';

const SR = RENDER_RATE;

describe('ambience', { timeout: 30000 }, () => {
  it('bed loop is seamless and quiet', () => {
    const bed = renderBed(SR);
    for (const c of bed) {
      let meanStep = 0;
      for (let i = 1; i < c.length; i++) meanStep += Math.abs(c[i] - c[i - 1]);
      meanStep /= c.length - 1;
      expect(Math.abs(c[0] - c[c.length - 1])).toBeLessThan(meanStep * 12);
    }
    const s = analyze('bed', bed, SR);
    expect(s.rms).toBeGreaterThan(0.005);
    expect(s.rms).toBeLessThan(0.05);
    expect(s.hasNaN).toBe(false);
  });

  it('all one-shot banks render', () => {
    const banks = [['pop', AMB.pops], ['hiss', AMB.hiss], ['wind', AMB.wind], ['rustle', AMB.rustle]] as const;
    for (const [k, n] of banks) {
      for (let v = 0; v < n; v++) {
        const s = analyze(`${k}${v}`, renderAmb(k, v, SR), SR);
        expect(s.hasNaN).toBe(false);
        expect(s.peak).toBeGreaterThan(0.01);
        expect(s.peak).toBeLessThanOrEqual(0.3 + 1e-6);
      }
    }
  });

  it('sequencer is deterministic with sensible densities (never distracting)', () => {
    const a = new AmbienceSequencer(3).advance(300);
    const b = new AmbienceSequencer(3);
    const inc = [...b.advance(100), ...b.advance(200), ...b.advance(300)];
    expect(inc.map((e) => e.t)).toEqual(a.map((e) => e.t));
    const count = (k: string) => a.filter((e) => e.kind === k).length;
    expect(count('pop') / 5).toBeGreaterThan(40); // per minute
    expect(count('pop') / 5).toBeLessThan(400);
    expect(count('wind')).toBeGreaterThanOrEqual(3);
    expect(count('wind')).toBeLessThanOrEqual(12);
    expect(count('rustle')).toBeGreaterThanOrEqual(1);
    expect(count('rustle')).toBeLessThanOrEqual(5);
    for (const e of a) expect(e.gain).toBeLessThanOrEqual(1);
  });

  it('a composed minute is very quiet (≈ -40 dBFS RMS) and never loud', () => {
    const mix = composeAmbience(SR, 20, 5);
    const s = analyze('amb', mix, SR);
    expect(s.rms).toBeLessThan(0.03);
    expect(s.rms).toBeGreaterThan(0.003);
    expect(s.peak).toBeLessThan(0.35);
  });
});
