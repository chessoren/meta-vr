import { describe, expect, it } from 'vitest';
import {
  AGAIN_DELAY_MS,
  DEFAULT_EASE,
  HARD_STEP_MS,
  MAX_EASE,
  MIN_EASE,
  applyReview,
  dueNotions,
  isDue,
  isLearning,
  lastReviewAt,
  newReview,
  nextDueAt,
} from '../../../src/core/srs';
import { tierOf } from '../../../src/core/tiers';
import { DAY_MS, MINUTE_MS, dayIndex, dayStart, isoDate } from '../../../src/core/time';
import type { Grade, PalaceProgress, ReviewState } from '../../../src/core/types';

const NOW = Date.UTC(2026, 9, 5, 18, 0); // Mon 5 Oct 2026, 18:00 UTC
const today = dayIndex(NOW);
const dueDay = (s: ReviewState, tz = 0) => dayIndex(s.due, tz) - dayIndex(NOW, tz);

/** Answers `grades` in order, each at the time the notion becomes due (or `step` later). */
function run(grades: Grade[], opts: { examDate?: string; tzOffsetMin?: number } = {}, start = NOW): ReviewState[] {
  let s = newReview('n1', start);
  const out: ReviewState[] = [];
  let t = start + 3 * MINUTE_MS; // onboarding: recalled a few minutes after placement
  for (const g of grades) {
    s = applyReview(s, g, 'bubble', t, opts);
    out.push(s);
    t = Math.max(s.due, t + MINUTE_MS) + 18 * 60 * MINUTE_MS * (s.intervalDays >= 1 ? 1 : 0); // come back the evening it is due
  }
  return out;
}

describe('newReview', () => {
  it('is due immediately and in learning', () => {
    const s = newReview('n1', NOW);
    expect(s).toEqual({ notionId: 'n1', placedAt: NOW, due: NOW, intervalDays: 0, ease: DEFAULT_EASE, streak: 0, lapses: 0, log: [] });
    expect(isDue(s, NOW)).toBe(true);
    expect(isDue(s, NOW - 1)).toBe(false);
    expect(isDue(s, NOW - 1, 5)).toBe(true);
    expect(isLearning(s)).toBe(true);
    expect(lastReviewAt(s)).toBe(NOW);
  });
});

describe('applyReview — learning', () => {
  const placed = newReview('n1', NOW);
  const t = NOW + 3 * MINUTE_MS;
  it('onboarding recall a few minutes after placement counts and graduates to tomorrow', () => {
    const s = applyReview(placed, 'good', 'voice', t);
    expect(s.intervalDays).toBe(1);
    expect(s.due).toBe(dayStart(today + 1));
    expect(s.streak).toBe(1);
    expect(s.log).toEqual([{ at: t, grade: 'good', mode: 'voice' }]);
    expect(tierOf(s)).toBe('fragile');
    expect(lastReviewAt(s)).toBe(t);
  });
  it('again → re-due one minute later in the same session, no lapse counted', () => {
    const s = applyReview(placed, 'again', 'bubble', t);
    expect(s.due).toBe(t + AGAIN_DELAY_MS);
    expect(s.lapses).toBe(0);
    expect(s.streak).toBe(0);
    expect(s.ease).toBe(DEFAULT_EASE);
    expect(isLearning(s)).toBe(true);
    const s2 = applyReview(s, 'good', 'bubble', t + 2 * MINUTE_MS);
    expect(s2.due).toBe(dayStart(today + 1));
  });
  it('hard → 10 minute step; easy → 2 days', () => {
    const h = applyReview(placed, 'hard', 'reveal', t);
    expect(h.due).toBe(t + HARD_STEP_MS);
    expect(isLearning(h)).toBe(true);
    expect(h.streak).toBe(1);
    const e = applyReview(placed, 'easy', 'reveal', t);
    expect(e.intervalDays).toBe(2);
    expect(e.due).toBe(dayStart(today + 2));
  });
  it('does not mutate its input', () => {
    const copy = JSON.parse(JSON.stringify(placed));
    applyReview(placed, 'good', 'bubble', t);
    expect(placed).toEqual(copy);
  });
});

describe('applyReview — review phase', () => {
  it('good answers grow the interval 1 d, ~3 d, ~7 d … with ease', () => {
    const states = run(['good', 'good', 'good', 'good', 'good']);
    const intervals = states.map((s) => s.intervalDays);
    expect(intervals[0]).toBe(1);
    expect(intervals[1]).toBe(3);
    expect(intervals[2]).toBeGreaterThanOrEqual(7);
    expect(intervals[2]).toBeLessThanOrEqual(9);
    expect(intervals[3]).toBeGreaterThan(intervals[2] * 2);
    expect(intervals[4]).toBeGreaterThan(intervals[3] * 2);
    expect(states[4].streak).toBe(5);
    for (let i = 1; i < intervals.length; i++) expect(intervals[i]).toBeGreaterThan(intervals[i - 1]);
  });
  it('due dates land at the start (04:00 local) of the target day', () => {
    for (const tz of [0, 120, -300, 540]) {
      const [s] = run(['good'], { tzOffsetMin: tz });
      expect(s.due).toBe(dayStart(dayIndex(NOW + 3 * MINUTE_MS, tz) + 1, tz));
      const local = new Date(s.due + tz * MINUTE_MS);
      expect(local.getUTCHours()).toBe(4);
    }
  });
  it('hard < good < easy, ease moves accordingly and stays in bounds', () => {
    const base = run(['good', 'good'])[1]; // interval 3
    const t = base.due + 12 * 60 * MINUTE_MS;
    const h = applyReview(base, 'hard', 'bubble', t);
    const g = applyReview(base, 'good', 'bubble', t);
    const e = applyReview(base, 'easy', 'bubble', t);
    expect(h.intervalDays).toBeLessThan(g.intervalDays);
    expect(g.intervalDays).toBeLessThan(e.intervalDays);
    expect(h.intervalDays).toBeGreaterThan(base.intervalDays);
    expect(h.ease).toBeCloseTo(DEFAULT_EASE - 0.15);
    expect(g.ease).toBe(DEFAULT_EASE);
    expect(e.ease).toBeCloseTo(DEFAULT_EASE + 0.15);
    let s = base;
    for (let i = 0; i < 20; i++) s = applyReview(s, 'easy', 'bubble', s.due);
    expect(s.ease).toBe(MAX_EASE);
    expect(s.intervalDays).toBeLessThanOrEqual(365);
    for (let i = 0; i < 10; i++) {
      s = applyReview(s, 'again', 'bubble', s.due); // lapse (review phase): −0.2
      s = applyReview(s, 'good', 'bubble', s.due); // relearnt: 1 day
      s = applyReview(s, 'hard', 'bubble', s.due); // review hard: −0.15
    }
    expect(s.ease).toBe(MIN_EASE);
  });
  it('again in review = lapse: ease −0.2, relearn in 1 min, then tomorrow', () => {
    const base = run(['good', 'good', 'good'])[2];
    const t = base.due + HOUR_MS;
    const lapsed = applyReview(base, 'again', 'voice', t);
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.streak).toBe(0);
    expect(lapsed.ease).toBeCloseTo(DEFAULT_EASE - 0.2);
    expect(lapsed.due).toBe(t + AGAIN_DELAY_MS);
    expect(isLearning(lapsed)).toBe(true);
    const relearned = applyReview(lapsed, 'good', 'voice', t + 2 * MINUTE_MS);
    expect(relearned.intervalDays).toBe(1);
    expect(dayIndex(relearned.due)).toBe(dayIndex(t) + 1);
    expect(relearned.streak).toBe(1);
  });
  it('late reviews get a bonus; early correct reviews never shrink the interval', () => {
    const base = run(['good', 'good'])[1]; // 3 days
    const onTime = applyReview(base, 'good', 'bubble', base.due + HOUR_MS);
    const late = applyReview(base, 'good', 'bubble', base.due + 10 * DAY_MS);
    expect(late.intervalDays).toBeGreaterThan(onTime.intervalDays);
    const early = applyReview(base, 'good', 'bubble', lastReviewAt(base) + HOUR_MS);
    expect(early.intervalDays).toBeGreaterThanOrEqual(base.intervalDays);
    const earlyHard = applyReview(base, 'hard', 'bubble', lastReviewAt(base) + HOUR_MS);
    expect(earlyHard.intervalDays).toBe(base.intervalDays);
    const earlyEasy = applyReview(base, 'easy', 'bubble', lastReviewAt(base) + 2 * DAY_MS);
    expect(earlyEasy.intervalDays).toBeGreaterThanOrEqual(early.intervalDays);
  });
  it('repairs a corrupt ease', () => {
    const s = { ...newReview('x', NOW), ease: NaN };
    expect(applyReview(s, 'good', 'bubble', NOW).ease).toBe(DEFAULT_EASE);
  });
  it('is deterministic', () => {
    expect(run(['good', 'hard', 'again', 'good', 'easy'])).toEqual(run(['good', 'hard', 'again', 'good', 'easy']));
  });
});

const HOUR_MS = 60 * MINUTE_MS;

describe('applyReview — exam aware', () => {
  const exam = (days: number) => isoDate(today + days);

  it('never schedules past the eve of the exam', () => {
    const states = run(['good', 'good', 'good', 'good', 'good', 'good'], { examDate: exam(30) });
    for (const s of states) {
      const lastReview = dayIndex(s.log[s.log.length - 1].at);
      if (lastReview < today + 29) expect(dayIndex(s.due)).toBeLessThanOrEqual(today + 29);
    }
  });

  it('compresses intervals so the notion can be solid before the exam', () => {
    // Placed today, exam in 5 days: eve = day 4. Needs 2 more spaced days after today.
    const opts = { examDate: exam(5) };
    let s = applyReview(newReview('n', NOW), 'good', 'bubble', NOW + MINUTE_MS, opts);
    expect(dueDay(s)).toBe(1);
    s = applyReview(s, 'good', 'bubble', dayStart(today + 1) + 14 * HOUR_MS, opts);
    expect(dueDay(s)).toBeLessThanOrEqual(4);
    expect(dueDay(s)).toBeGreaterThanOrEqual(2);
    s = applyReview(s, 'good', 'bubble', s.due + 14 * HOUR_MS, opts);
    expect(tierOf(s)).toBe('solid');
    const d = dayIndex(s.log[2].at);
    if (d < today + 4) expect(dayIndex(s.due)).toBeLessThanOrEqual(today + 4);
  });

  it('with only 2 days left, reviews every day until the eve', () => {
    const opts = { examDate: exam(3) }; // eve = day 2
    let s = applyReview(newReview('n', NOW), 'easy', 'bubble', NOW + MINUTE_MS, opts);
    expect(dueDay(s)).toBe(1); // easy would be 2 days, compressed to 1 (needs 2 more days, 2 available)
    s = applyReview(s, 'easy', 'bubble', s.due + HOUR_MS, opts);
    expect(dayIndex(s.due)).toBe(today + 2);
  });

  it('on the eve and after, schedules normally (no loop)', () => {
    const base = run(['good', 'good'])[1];
    const eveT = base.due + HOUR_MS;
    const examTomorrow = isoDate(dayIndex(eveT) + 1);
    const s = applyReview(base, 'good', 'bubble', eveT, { examDate: examTomorrow });
    expect(s.due).toBeGreaterThan(eveT + DAY_MS);
    const past = applyReview(base, 'good', 'bubble', eveT, { examDate: '2020-01-01' });
    expect(past.intervalDays).toBe(s.intervalDays);
    const bad = applyReview(base, 'good', 'bubble', eveT, { examDate: 'soon' });
    expect(bad.intervalDays).toBe(s.intervalDays);
  });

  it('keeps sub-day steps untouched', () => {
    const s = applyReview(newReview('n', NOW), 'again', 'bubble', NOW, { examDate: exam(10) });
    expect(s.due).toBe(NOW + AGAIN_DELAY_MS);
  });

  it('every notion placed at least 3 days before the exam can reach solid with good answers', () => {
    for (let daysLeft = 3; daysLeft <= 40; daysLeft++) {
      const opts = { examDate: exam(daysLeft) };
      let s = applyReview(newReview('n', NOW), 'good', 'bubble', NOW + MINUTE_MS, opts);
      let reviewsOnEve = 0;
      for (let i = 0; i < 30 && dayIndex(s.due) < today + daysLeft; i++) {
        const t = Math.max(s.due, NOW) + 13 * HOUR_MS;
        if (dayIndex(t) === today + daysLeft - 1) reviewsOnEve++;
        s = applyReview(s, 'good', 'bubble', t, opts);
      }
      expect(tierOf(s), `daysLeft=${daysLeft}`).not.toBe('fragile');
      expect(reviewsOnEve, `daysLeft=${daysLeft}`).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('dueNotions & nextDueAt', () => {
  const mk = (id: string, due: number): ReviewState => ({ ...newReview(id, NOW - DAY_MS), due });
  const progress: PalaceProgress = {
    palaceId: 'p',
    roomId: 'r',
    placements: [
      { notionId: 'b', furnitureId: 'f', local: [0, 0, 0], order: 0, placedAt: NOW },
      { notionId: 'a', furnitureId: 'f', local: [0, 0, 0], order: 2, placedAt: NOW },
      { notionId: 'c', furnitureId: 'f', local: [0, 0, 0], order: 1, placedAt: NOW },
    ],
    reviews: { a: mk('a', NOW - 5), b: mk('b', NOW - 1), c: mk('c', NOW + DAY_MS), d: mk('d', NOW - 100), e: mk('e', NOW - 200) },
  };
  it('placed notions in route order first, then unplaced by due', () => {
    expect(dueNotions(progress, NOW)).toEqual(['b', 'a', 'e', 'd']);
    expect(dueNotions(progress, NOW + DAY_MS)).toEqual(['b', 'c', 'a', 'e', 'd']);
    expect(dueNotions({ placements: [], reviews: {} }, NOW)).toEqual([]);
    expect(dueNotions({} as PalaceProgress, NOW)).toEqual([]);
  });
  it('breaks ties by id', () => {
    const p = { placements: [], reviews: { z: mk('z', NOW - 1), y: mk('y', NOW - 1) } };
    expect(dueNotions(p, NOW)).toEqual(['y', 'z']);
    const q = {
      placements: [
        { notionId: 'z', furnitureId: 'f', local: [0, 0, 0] as [number, number, number], order: 0, placedAt: 0 },
        { notionId: 'y', furnitureId: 'f', local: [0, 0, 0] as [number, number, number], order: 0, placedAt: 0 },
      ],
      reviews: p.reviews,
    };
    expect(dueNotions(q, NOW)).toEqual(['y', 'z']);
  });
  it('nextDueAt', () => {
    expect(nextDueAt(progress, NOW)).toBe(NOW + DAY_MS);
    expect(nextDueAt({ reviews: {} }, NOW)).toBeUndefined();
  });
});
