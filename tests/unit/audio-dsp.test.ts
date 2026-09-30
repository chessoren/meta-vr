import { describe, expect, it } from 'vitest';
import {
  Biquad, addMode, addPluck, alloc, convolve, fft, hashString, makeRoomIR, mulberry32, normalizeLoudness, peakOf, rmsOf, trimTail,
} from '../../src/audio/dsp';
import { PENTA, noteHz, pentaHz, pentaSemis, pentatonicRatio } from '../../src/audio/music';
import { spectralCentroid } from '../../src/audio/offline-check';

const SR = 32000;
const sine = (f: number, n: number) => Float32Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * f * i) / SR));

describe('audio dsp', () => {
  it('seeded rng and hash are deterministic', () => {
    const a = mulberry32(42), b = mulberry32(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
    expect(hashString('Pinch me')).toBe(hashString('Pinch me'));
    expect(hashString('Pinch me')).not.toBe(hashString('Pinch me!'));
  });

  it('biquad lowpass passes lows and attenuates highs', () => {
    const lo = sine(200, SR / 2), hi = sine(8000, SR / 2);
    new Biquad(SR, 'lowpass', 1000).run(lo);
    new Biquad(SR, 'lowpass', 1000).run(hi);
    expect(rmsOf(lo.subarray(2000))).toBeGreaterThan(0.6);
    expect(rmsOf(hi.subarray(2000))).toBeLessThan(0.03);
  });

  it('addMode rings at its frequency and decays by ~60 dB over t60', () => {
    const x = alloc(SR, 1.2);
    addMode(x, SR, 0, 880, 0.5, 1.0, 0.001);
    expect(Math.abs(spectralCentroid(x.subarray(0, 8192), SR) - 880)).toBeLessThan(60);
    const early = peakOf(x.subarray(0, 2000));
    const late = peakOf(x.subarray(Math.round(0.95 * SR), Math.round(0.99 * SR)));
    expect(late / early).toBeLessThan(0.003);
    expect(peakOf(x.subarray(Math.round(1.01 * SR)))).toBe(0);
  });

  it('Karplus-Strong pluck is tuned', () => {
    const x = alloc(SR, 1);
    addPluck(x, SR, 0, 440, 0.5, 1.5, 0.3, mulberry32(1));
    // autocorrelation pitch of a stable segment
    const seg = x.subarray(SR * 0.3, SR * 0.6);
    let best = 0, bestLag = 0;
    for (let lag = 40; lag < 120; lag++) {
      let acc = 0;
      for (let i = 0; i + lag < seg.length; i++) acc += seg[i] * seg[i + lag];
      if (acc > best) { best = acc; bestLag = lag; }
    }
    expect(SR / bestLag).toBeGreaterThan(432);
    expect(SR / bestLag).toBeLessThan(448);
  });

  it('fft round-trips and convolution matches direct convolution', () => {
    const re = Float64Array.from({ length: 64 }, (_, i) => Math.sin(i * 0.3) + (i % 5));
    const orig = re.slice();
    const im = new Float64Array(64);
    fft(re, im);
    fft(re, im, true);
    for (let i = 0; i < 64; i++) expect(re[i]).toBeCloseTo(orig[i], 9);
    const a = Float32Array.from([1, 2, 3, -1]), h = Float32Array.from([0.5, -0.25, 1]);
    const y = convolve(a, h);
    const direct = [0.5, 0.75, 2, 0.75, 3.25, -1];
    direct.forEach((v, i) => expect(y[i]).toBeCloseTo(v, 5));
  });

  it('room IR is stereo, unit energy, decorrelated and decaying', () => {
    const [L, R] = makeRoomIR(SR, 1.6);
    let e = 0, lr = 0;
    for (let i = 0; i < L.length; i++) { e += L[i] * L[i] + R[i] * R[i]; lr += L[i] * R[i]; }
    expect(e / 2).toBeCloseTo(1, 3);
    expect(Math.abs(lr) / (e / 2)).toBeLessThan(0.2);
    expect(rmsOf(L.subarray(SR * 1.2, SR * 1.4))).toBeLessThan(rmsOf(L.subarray(SR * 0.05, SR * 0.25)) * 0.05);
  });

  it('trimTail and normalizeLoudness behave', () => {
    const x = alloc(SR, 2);
    addMode(x, SR, 0, 500, 0.8, 0.5);
    const t = trimTail(x, SR);
    expect(t.length / SR).toBeLessThan(0.6);
    normalizeLoudness(t, SR, 0.1, 0.9);
    expect(peakOf(t)).toBeLessThanOrEqual(0.9 + 1e-6);
  });

  it('everything is in D major pentatonic', () => {
    expect(noteHz('A4')).toBeCloseTo(440, 6);
    expect(pentaHz(0)).toBeCloseTo(noteHz('D4'), 6);
    expect(pentaHz(3)).toBeCloseTo(440, 6);
    expect(pentaHz(5)).toBeCloseTo(noteHz('D5'), 6);
    expect(pentaHz(-3)).toBeCloseTo(noteHz('F#3'), 6);
    for (let s = -10; s < 20; s++) expect(PENTA).toContain(((pentaSemis(s) % 12) + 12) % 12);
    expect(pentatonicRatio(5)).toBeCloseTo(2, 9);
  });
});
