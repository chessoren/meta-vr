/**
 * Visible progression of a notion on its object: new → fragile → solid → anchored.
 *
 * Rules (see docs/BRIEF.md "Retention & progression"):
 * - **new**      — no correct answer yet (just placed).
 * - **fragile**  — at least one correct answer.
 * - **solid**    — correct answers on at least {@link SOLID_DAYS} distinct learning days
 *                  ("3 correct, spaced"). Several correct answers in one session count once.
 * - **anchored** — solid, AND correct answers on at least {@link ANCHORED_DAYS} distinct days,
 *                  AND at least {@link ANCHORED_SPAN_DAYS} days between the first and the last
 *                  correct answer ("5 correct over ≥ 2 weeks").
 *
 * **No punishment**: tiers are computed from the *total* number of spaced correct answers in the
 * log, so a lapse ('again') never makes a notion go down a tier.
 *
 * A "correct" answer is any grade except 'again' (voice, bubble or self-graded reveal alike).
 * Learning days start at 04:00 local time (see `time.ts`).
 */
import type { Grade, ReviewState, Tier } from './types';
import { dayIndex } from './time';

export const SOLID_DAYS = 3;
export const ANCHORED_DAYS = 5;
export const ANCHORED_SPAN_DAYS = 14;

export const TIER_ORDER: readonly Tier[] = ['new', 'fragile', 'solid', 'anchored'];

export interface TierOpts {
  /** Minutes to add to UTC to get local time (see time.ts). Default 0. */
  tzOffsetMin?: number;
}

/** true for grades that count as a successful recall. */
export function isCorrectGrade(grade: Grade): boolean {
  return grade !== 'again';
}

export interface CorrectStats {
  /** Total correct answers in the log. */
  correctCount: number;
  /** Distinct learning days with at least one correct answer ("spaced corrects"). */
  correctDays: number;
  /** Day index of the first / last correct answer (undefined when none). */
  firstCorrectDay?: number;
  lastCorrectDay?: number;
}

/** Aggregates the correct answers of a review log. */
export function correctStats(state: Pick<ReviewState, 'log'>, opts: TierOpts = {}): CorrectStats {
  const tz = opts.tzOffsetMin ?? 0;
  const days = new Set<number>();
  let correctCount = 0;
  let first: number | undefined;
  let last: number | undefined;
  for (const entry of state.log ?? []) {
    if (!isCorrectGrade(entry.grade)) continue;
    correctCount++;
    const d = dayIndex(entry.at, tz);
    days.add(d);
    if (first === undefined || d < first) first = d;
    if (last === undefined || d > last) last = d;
  }
  return { correctCount, correctDays: days.size, firstCorrectDay: first, lastCorrectDay: last };
}

/** Tier from aggregated stats. */
export function tierFromStats(s: CorrectStats): Tier {
  if (s.correctCount === 0) return 'new';
  if (s.correctDays < SOLID_DAYS) return 'fragile';
  const span = (s.lastCorrectDay ?? 0) - (s.firstCorrectDay ?? 0);
  if (s.correctDays >= ANCHORED_DAYS && span >= ANCHORED_SPAN_DAYS) return 'anchored';
  return 'solid';
}

/** Current tier of a notion. */
export function tierOf(state: Pick<ReviewState, 'log'>, opts: TierOpts = {}): Tier {
  return tierFromStats(correctStats(state, opts));
}

/** Index of a tier in {@link TIER_ORDER} (0 = new … 3 = anchored). */
export function tierRank(tier: Tier): number {
  return TIER_ORDER.indexOf(tier);
}

/** true when the tier is at least `min`. */
export function atLeast(tier: Tier, min: Tier): boolean {
  return tierRank(tier) >= tierRank(min);
}

export interface TierProgress {
  tier: Tier;
  /** Next tier to reach, or null once anchored. */
  nextTier: Tier | null;
  /** Human hint of what is missing, e.g. "1 more correct answer on another day". Empty when anchored. */
  missing: string;
  correctCount: number;
  correctDays: number;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Tier plus a short, encouraging hint of what is missing to reach the next one.
 * With `now`, the waiting time for "anchored" is expressed from today; otherwise from the last
 * correct answer.
 */
export function tierProgress(state: Pick<ReviewState, 'log'>, opts: TierOpts & { now?: number } = {}): TierProgress {
  const s = correctStats(state, opts);
  const tier = tierFromStats(s);
  const base = { tier, correctCount: s.correctCount, correctDays: s.correctDays };
  switch (tier) {
    case 'new':
      return { ...base, nextTier: 'fragile', missing: '1 correct answer' };
    case 'fragile': {
      const n = SOLID_DAYS - s.correctDays;
      const missing = n === 1 ? '1 more correct answer on another day' : `${n} more correct answers on different days`;
      return { ...base, nextTier: 'solid', missing };
    }
    case 'solid': {
      const needDays = Math.max(0, ANCHORED_DAYS - s.correctDays);
      const targetDay = (s.firstCorrectDay ?? 0) + ANCHORED_SPAN_DAYS;
      const fromDay = opts.now !== undefined ? dayIndex(opts.now, opts.tzOffsetMin ?? 0) : (s.lastCorrectDay ?? 0);
      const wait = Math.max(0, targetDay - fromDay);
      const spanMet = (s.lastCorrectDay ?? 0) >= targetDay;
      const when =
        opts.now !== undefined
          ? wait === 0
            ? 'from today on'
            : `in ${plural(wait, 'day')} or later`
          : `${plural(wait, 'day')} or more after the last one`;
      let missing: string;
      if (needDays > 1 && !spanMet) {
        missing = `${needDays} more correct answers on different days, the last one ${when}`;
      } else if (needDays > 0 && spanMet) {
        missing = needDays === 1 ? '1 more correct answer on another day' : `${needDays} more correct answers on different days`;
      } else {
        missing = `1 more correct answer ${when}`;
      }
      return { ...base, nextTier: 'anchored', missing };
    }
    default:
      return { ...base, nextTier: null, missing: '' };
  }
}
