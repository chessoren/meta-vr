import { describe, expect, it } from 'vitest';
import { DAY_MS, HOUR_MS, dayIndex, dayStart, daysBetween, isoDate, parseIsoDate } from '../../../src/core/time';
import {
  PAIR_ALPHABET,
  hashString,
  isBlockedPairCode,
  isValidPairCode,
  mulberry32,
  normalizePairCode,
  pairCode,
  pick,
  randInt,
  seededRandom,
  uid,
} from '../../../src/core/ids';

describe('time', () => {
  const t = Date.UTC(2026, 9, 5, 10, 0); // 2026-10-05 10:00 UTC
  it('day index with a 4 am boundary and time zones', () => {
    expect(isoDate(dayIndex(t))).toBe('2026-10-05');
    expect(isoDate(dayIndex(Date.UTC(2026, 9, 5, 3, 59)))).toBe('2026-10-04');
    expect(isoDate(dayIndex(Date.UTC(2026, 9, 5, 4, 0)))).toBe('2026-10-05');
    // Paris (UTC+2): 01:30 local on the 6th still belongs to the 5th.
    expect(isoDate(dayIndex(Date.UTC(2026, 9, 5, 23, 30), 120))).toBe('2026-10-05');
    expect(isoDate(dayIndex(Date.UTC(2026, 9, 6, 2, 0), 120))).toBe('2026-10-06');
    // New York (UTC−4): 22:00 local on the 5th = 02:00 UTC on the 6th.
    expect(isoDate(dayIndex(Date.UTC(2026, 9, 6, 2, 0), -240))).toBe('2026-10-05');
  });
  it('dayStart is the inverse of dayIndex', () => {
    for (const tz of [-600, -240, 0, 60, 330, 720]) {
      const d = dayIndex(t, tz);
      expect(dayIndex(dayStart(d, tz), tz)).toBe(d);
      expect(dayIndex(dayStart(d, tz) - 1, tz)).toBe(d - 1);
      expect(dayStart(d + 1, tz) - dayStart(d, tz)).toBe(DAY_MS);
    }
    expect(dayStart(dayIndex(t)) % DAY_MS).toBe(4 * HOUR_MS);
  });
  it('parses ISO dates strictly', () => {
    expect(parseIsoDate('2026-10-05')).toBe(dayIndex(t));
    expect(parseIsoDate(' 2026-10-05 ')).toBe(dayIndex(t));
    for (const bad of ['2026-02-30', '2026-13-01', '05/10/2026', '', 'tomorrow', undefined, null]) expect(parseIsoDate(bad as string)).toBeNull();
    expect(parseIsoDate(42 as unknown as string)).toBeNull();
  });
  it('daysBetween', () => {
    expect(daysBetween(t, t + 3 * DAY_MS)).toBe(3);
    expect(daysBetween(t, t - DAY_MS)).toBe(-1);
  });
});

describe('ids', () => {
  it('hashString is stable (FNV-1a)', () => {
    expect(hashString('')).toBe(0x811c9dc5);
    expect(hashString('a')).toBe(0xe40c292c);
    expect(hashString('loci')).toBe(hashString('loci'));
    expect(hashString('loci')).not.toBe(hashString('locj'));
  });
  it('mulberry32 is deterministic and uniform-ish in [0,1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xs = Array.from({ length: 2000 }, () => a());
    expect(xs).toEqual(Array.from({ length: 2000 }, () => b()));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
    expect(seededRandom('x')()).toBe(seededRandom('x')());
    expect(seededRandom(7)()).toBe(mulberry32(7)());
  });
  it('randInt and pick stay in range, even with bad sources', () => {
    expect(randInt(() => 0.999999, 5)).toBe(4);
    expect(randInt(() => 1, 5)).toBe(4);
    expect(randInt(() => NaN, 5)).toBe(0);
    expect(randInt(() => -1, 5)).toBe(0);
    expect(pick(() => 0.5, ['a', 'b', 'c'])).toBe('b');
  });
  it('uid', () => {
    const r = mulberry32(1);
    const id = uid('n', r);
    expect(id).toMatch(/^n_[0-9a-z]{10}$/);
    expect(uid('n', mulberry32(1))).toBe(id);
    expect(uid('', mulberry32(1), 4)).toMatch(/^[0-9a-z]{4}$/);
    const many = new Set(Array.from({ length: 5000 }, () => uid('p', r)));
    expect(many.size).toBe(5000);
  });
  it('pairCode: 4 letters, no I/O, no rude words, deterministic', () => {
    const r = mulberry32(99);
    for (let i = 0; i < 5000; i++) {
      const c = pairCode(r);
      expect(c).toMatch(/^[A-HJ-NP-Z]{4}$/);
      expect(isValidPairCode(c)).toBe(true);
    }
    expect(pairCode(mulberry32(5))).toBe(pairCode(mulberry32(5)));
    expect(PAIR_ALPHABET).not.toMatch(/[IO]/);
    expect(PAIR_ALPHABET).toHaveLength(24);
  });
  it('blocklist and fallback', () => {
    for (const w of ['FUCK', 'CUNT', 'SLUT', 'NAZI', 'RAPE', 'TWAT', 'WANK', 'XASS', 'SEXY', 'ASSZ']) expect(isBlockedPairCode(w)).toBe(true);
    expect(isBlockedPairCode('KXPM')).toBe(false);
    // A source stuck on a rude code falls back to a safe fixed code.
    const letters = 'FUCK';
    let k = 0;
    const stuck = () => (PAIR_ALPHABET.indexOf(letters[k++ % 4]) + 0.5) / PAIR_ALPHABET.length;
    expect(pairCode(stuck)).toBe('LUMA');
    expect(isValidPairCode('LUMA')).toBe(true);
  });
  it('validates and normalises typed codes', () => {
    expect(isValidPairCode('ABCD')).toBe(true);
    expect(isValidPairCode('ABCI')).toBe(false);
    expect(isValidPairCode('ABC')).toBe(false);
    expect(isValidPairCode('abcd')).toBe(false);
    expect(isValidPairCode(1234 as unknown as string)).toBe(false);
    expect(normalizePairCode(' ab-cd9e ')).toBe('ABCD');
    expect(normalizePairCode(undefined as unknown as string)).toBe('');
  });
});
