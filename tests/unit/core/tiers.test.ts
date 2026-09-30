import { describe, expect, it } from 'vitest';
import { ANCHORED_SPAN_DAYS, atLeast, correctStats, isCorrectGrade, tierOf, tierProgress, tierRank } from '../../../src/core/tiers';
import type { Grade, ReviewLog } from '../../../src/core/types';
import { DAY_MS, HOUR_MS, MINUTE_MS } from '../../../src/core/time';

const T0 = Date.UTC(2026, 9, 5, 18, 0); // 18:00 UTC
const at = (day: number, hour = 0, grade: Grade = 'good'): ReviewLog => ({ at: T0 + day * DAY_MS + hour * HOUR_MS, grade, mode: 'bubble' });
const st = (...log: ReviewLog[]) => ({ log });

describe('tiers', () => {
  it('grades', () => {
    expect(isCorrectGrade('again')).toBe(false);
    for (const g of ['hard', 'good', 'easy'] as Grade[]) expect(isCorrectGrade(g)).toBe(true);
  });

  it('new → fragile on the first correct answer (onboarding recall minutes after placement counts)', () => {
    expect(tierOf(st())).toBe('new');
    expect(tierOf(st(at(0, 0, 'again')))).toBe('new');
    expect(tierOf(st({ at: T0 + 3 * MINUTE_MS, grade: 'good', mode: 'voice' }))).toBe('fragile');
  });

  it('solid needs correct answers on 3 distinct days — same-day repeats count once', () => {
    expect(tierOf(st(at(0), at(0, 1), at(0, 2), at(0, 3)))).toBe('fragile');
    expect(tierOf(st(at(0), at(1)))).toBe('fragile');
    expect(tierOf(st(at(0), at(1), at(3)))).toBe('solid');
    expect(tierOf(st(at(0), at(1, 0, 'again'), at(1, 0.1), at(3, 0, 'hard')))).toBe('solid');
  });

  it('day boundary is 4 am local', () => {
    // 18:00 UTC then 02:00 and 05:00 UTC next day, tz 0: 02:00 belongs to day 0, 05:00 to day 1.
    const s = st(at(0), at(0, 8), at(0, 11), at(1, 11));
    expect(correctStats(s).correctDays).toBe(3); // day0 (18:00 & 02:00), day1 (05:00), day2 (05:00 next)
    expect(correctStats(st(at(0), at(0, 8))).correctDays).toBe(1);
    // In UTC+8, 18:00 UTC is 02:00 local next day → belongs to the previous learning day.
    expect(correctStats(st(at(0), at(0, 11)), { tzOffsetMin: 480 }).correctDays).toBe(2);
    expect(correctStats(st(at(0), at(0, 1.5)), { tzOffsetMin: 480 }).correctDays).toBe(1); // 02:00 and 03:30 local
  });

  it('anchored needs ≥5 spaced corrects and ≥14 days between first and last', () => {
    expect(tierOf(st(at(0), at(1), at(3), at(7), at(13)))).toBe('solid'); // span 13
    expect(tierOf(st(at(0), at(1), at(3), at(7), at(14)))).toBe('anchored');
    expect(tierOf(st(at(0), at(20), at(40), at(60)))).toBe('solid'); // only 4 days
    expect(tierOf(st(at(0), at(1), at(1), at(1), at(30)))).toBe('solid'); // 5 corrects but only 3 distinct days
  });

  it('never goes down after lapses', () => {
    const solid = [at(0), at(1), at(3)];
    expect(tierOf(st(...solid, at(4, 0, 'again'), at(5, 0, 'again')))).toBe('solid');
    const anchored = [at(0), at(1), at(3), at(7), at(15)];
    expect(tierOf(st(...anchored, at(30, 0, 'again')))).toBe('anchored');
  });

  it('rank helpers', () => {
    expect(tierRank('new')).toBe(0);
    expect(tierRank('anchored')).toBe(3);
    expect(atLeast('solid', 'fragile')).toBe(true);
    expect(atLeast('fragile', 'solid')).toBe(false);
  });

  it('tolerates a missing log', () => {
    expect(tierOf({} as { log: ReviewLog[] })).toBe('new');
  });
});

describe('tierProgress', () => {
  it('hints for each tier', () => {
    expect(tierProgress(st())).toMatchObject({ tier: 'new', nextTier: 'fragile', missing: '1 correct answer', correctCount: 0 });
    expect(tierProgress(st(at(0)))).toMatchObject({ tier: 'fragile', nextTier: 'solid', missing: '2 more correct answers on different days' });
    expect(tierProgress(st(at(0), at(1)))).toMatchObject({ missing: '1 more correct answer on another day', correctDays: 2 });
  });
  it('solid → anchored hints', () => {
    // 3 days, span 3: needs 2 more days and 11 more days of span.
    const p = tierProgress(st(at(0), at(1), at(3)));
    expect(p).toMatchObject({ tier: 'solid', nextTier: 'anchored' });
    expect(p.missing).toBe('2 more correct answers on different days, the last one 11 days or more after the last one');
    const withNow = tierProgress(st(at(0), at(1), at(3)), { now: T0 + 3 * DAY_MS });
    expect(withNow.missing).toBe('2 more correct answers on different days, the last one in 11 days or later');
    // 4 days, span 10 → 1 more answer, 4 days later.
    expect(tierProgress(st(at(0), at(1), at(3), at(10))).missing).toBe('1 more correct answer 4 days or more after the last one');
    expect(tierProgress(st(at(0), at(1), at(3), at(10)), { now: T0 + 14 * DAY_MS }).missing).toBe('1 more correct answer from today on');
    expect(tierProgress(st(at(0), at(1), at(3), at(10)), { now: T0 + 13 * DAY_MS }).missing).toBe('1 more correct answer in 1 day or later');
    // Span met (0 → 20) but only 3 days / 4 days.
    expect(tierProgress(st(at(0), at(10), at(20))).missing).toBe('2 more correct answers on different days');
    expect(tierProgress(st(at(0), at(5), at(10), at(20))).missing).toBe('1 more correct answer on another day');
    // 5 days but span short.
    expect(tierProgress(st(at(0), at(1), at(2), at(3), at(4))).missing).toBe(`1 more correct answer ${ANCHORED_SPAN_DAYS - 4} days or more after the last one`);
  });
  it('anchored: nothing missing', () => {
    expect(tierProgress(st(at(0), at(1), at(3), at(7), at(14)))).toMatchObject({ tier: 'anchored', nextTier: null, missing: '' });
  });
});
