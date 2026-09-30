/**
 * Spaced repetition — an SM-2 / Anki-style scheduler tuned for exam preparation.
 *
 * ## Phases
 * - **Learning** (`intervalDays < 1`): a notion that was just placed, or that lapsed.
 *   It is due immediately after placement, so the onboarding recall a few minutes later counts.
 *   - again → re-due in {@link AGAIN_DELAY_MS} (1 min, i.e. later in the same session)
 *   - hard  → re-due in {@link HARD_STEP_MS} (10 min)
 *   - good  → graduates: due tomorrow (1 day)
 *   - easy  → graduates: due in {@link EASY_GRADUATE_DAYS} days
 * - **Review** (`intervalDays ≥ 1`): the interval grows with the ease factor.
 *   - again → lapse: ease −0.20, back to learning (1 min, then 1 day on the next correct answer)
 *   - hard  → ×1.2 (at least +1 day), ease −0.15
 *   - good  → ×ease (at least hard + 1 day) → 1 d, 3 d, 8 d, 20 d … with the default ease 2.5
 *   - easy  → ×ease×1.3 (at least good + 1 day), ease +0.15
 *   Late reviews get part of the delay as a bonus (like Anki); early reviews never shrink the
 *   interval of a correct answer.
 *
 * ## Day-based due dates
 * Intervals of whole days are due at the *start* of the target learning day (04:00 local, see
 * time.ts), so "due tomorrow" really means available all day tomorrow, whatever the clock time of
 * today's session.
 *
 * ## Exam awareness
 * When an exam date is set and at least one full day remains before its eve:
 * - **Eve cap** — the next review is never later than the day before the exam, so every notion
 *   is reviewed at least once on the eve (or earlier and again then).
 * - **Compression** — while the notion is not yet solid (correct on 3 distinct days, tiers.ts),
 *   the interval is shortened so the missing spaced reviews fit before the eve.
 *
 * Everything is deterministic: `now` is always passed in.
 */
import type { AnswerMode, Grade, PalaceProgress, ReviewState } from './types';
import { DAY_MS, MINUTE_MS, dayIndex, dayStart, parseIsoDate } from './time';
import { SOLID_DAYS, correctStats, isCorrectGrade } from './tiers';

export const DEFAULT_EASE = 2.5;
export const MIN_EASE = 1.3;
export const MAX_EASE = 3.0;
export const AGAIN_DELAY_MS = 1 * MINUTE_MS;
export const HARD_STEP_MS = 10 * MINUTE_MS;
export const EASY_GRADUATE_DAYS = 2;
export const MAX_INTERVAL_DAYS = 365;

const EASE_AGAIN = -0.2;
const EASE_HARD = -0.15;
const EASE_EASY = 0.15;
const HARD_FACTOR = 1.2;
const EASY_BONUS = 1.3;

export interface ReviewOpts {
  /** ISO date (YYYY-MM-DD, local) of the exam. Ignored when absent, malformed or past. */
  examDate?: string;
  /** Minutes to add to UTC to get local time (see time.ts). Default 0. */
  tzOffsetMin?: number;
}

/** Fresh state for a notion placed at `now`: due immediately, in learning. */
export function newReview(notionId: string, now: number): ReviewState {
  return { notionId, placedAt: now, due: now, intervalDays: 0, ease: DEFAULT_EASE, streak: 0, lapses: 0, log: [] };
}

/** true while the notion is in (re)learning steps (sub-day intervals). */
export function isLearning(state: ReviewState): boolean {
  return !(state.intervalDays >= 1);
}

/** Epoch ms of the last answer, or of the placement when never reviewed. */
export function lastReviewAt(state: ReviewState): number {
  const n = state.log?.length ?? 0;
  return n > 0 ? state.log[n - 1].at : state.placedAt;
}

/** true when the notion should be reviewed now (optionally looking ahead a few ms). */
export function isDue(state: ReviewState, now: number, lookaheadMs = 0): boolean {
  return state.due <= now + lookaheadMs;
}

const clampEase = (e: number) => Math.min(MAX_EASE, Math.max(MIN_EASE, Number.isFinite(e) ? e : DEFAULT_EASE));
const roundDays = (d: number) => Math.min(MAX_INTERVAL_DAYS, Math.max(1, Math.round(d)));

/**
 * Applies one answer and returns the next state (the input is not mutated).
 * @param mode how the learner answered (logged; does not change scheduling).
 */
export function applyReview(state: ReviewState, grade: Grade, mode: AnswerMode, now: number, opts: ReviewOpts = {}): ReviewState {
  const tz = opts.tzOffsetMin ?? 0;
  const log = [...(state.log ?? []), { at: now, grade, mode }];
  let ease = clampEase(state.ease);
  const learning = isLearning(state);

  if (!isCorrectGrade(grade)) {
    const lapses = state.lapses + (learning ? 0 : 1);
    if (!learning) ease = clampEase(ease + EASE_AGAIN);
    return { ...state, log, ease, lapses, streak: 0, intervalDays: AGAIN_DELAY_MS / DAY_MS, due: now + AGAIN_DELAY_MS };
  }

  const streak = state.streak + 1;
  let interval: number;
  if (learning) {
    if (grade === 'hard') {
      return { ...state, log, ease, streak, intervalDays: HARD_STEP_MS / DAY_MS, due: now + HARD_STEP_MS };
    }
    interval = grade === 'easy' ? EASY_GRADUATE_DAYS : 1;
  } else {
    const cur = state.intervalDays;
    // Whole learning days since the last answer (a 22:00 review of a card due at 04:00 is on time).
    const elapsed = Math.max(0, dayIndex(now, tz) - dayIndex(lastReviewAt(state), tz));
    const delay = elapsed - cur;
    if (delay >= 0) {
      const hard = Math.max(roundDays((cur + delay / 4) * HARD_FACTOR), roundDays(cur + 1));
      const good = Math.max(roundDays((cur + delay / 2) * ease), hard + 1);
      const easy = Math.max(roundDays((cur + delay) * ease * EASY_BONUS), good + 1);
      interval = grade === 'hard' ? hard : grade === 'good' ? good : easy;
    } else {
      // Reviewed early: a correct answer keeps (or modestly extends) the current interval.
      const hard = roundDays(cur);
      const good = Math.max(hard, roundDays(elapsed * ease));
      const easy = Math.max(good, roundDays(elapsed * ease * EASY_BONUS));
      interval = grade === 'hard' ? hard : grade === 'good' ? good : easy;
    }
    if (grade === 'hard') ease = clampEase(ease + EASE_HARD);
    if (grade === 'easy') ease = clampEase(ease + EASE_EASY);
  }
  interval = Math.min(MAX_INTERVAL_DAYS, interval);

  const today = dayIndex(now, tz);
  interval = examCap(interval, today, log, opts);
  return { ...state, log, ease, streak, intervalDays: interval, due: dayStart(today + interval, tz) };
}

/**
 * Shortens a day interval so the notion is reviewed on the eve of the exam at the latest and
 * can collect the spaced correct answers it still needs to be solid.
 */
function examCap(interval: number, today: number, log: ReviewState['log'], opts: ReviewOpts): number {
  const examDay = parseIsoDate(opts.examDate);
  if (examDay === null) return interval;
  const eve = examDay - 1;
  const avail = eve - today; // whole days after today, up to and including the eve
  if (avail < 1) return interval;
  let capped = Math.min(interval, avail);
  const need = Math.max(0, SOLID_DAYS - correctStats({ log }, { tzOffsetMin: opts.tzOffsetMin }).correctDays);
  if (need > 0) capped = Math.min(capped, Math.max(1, Math.floor(avail / need)));
  return capped;
}

/**
 * Ids of the notions due at `now`. Placed notions come first, in route order
 * (Placement.order); notions without a placement follow, by due time.
 */
export function dueNotions(progress: Pick<PalaceProgress, 'reviews' | 'placements'>, now: number, lookaheadMs = 0): string[] {
  const order = new Map<string, number>();
  for (const p of progress.placements ?? []) order.set(p.notionId, p.order);
  const due = Object.values(progress.reviews ?? {}).filter((s) => s && isDue(s, now, lookaheadMs));
  due.sort((a, b) => {
    const oa = order.get(a.notionId);
    const ob = order.get(b.notionId);
    if (oa !== undefined && ob !== undefined) return oa - ob || cmp(a.notionId, b.notionId);
    if (oa !== undefined) return -1;
    if (ob !== undefined) return 1;
    return a.due - b.due || cmp(a.notionId, b.notionId);
  });
  return due.map((s) => s.notionId);
}

/** Earliest future due time among the notions (undefined when there is none). */
export function nextDueAt(progress: Pick<PalaceProgress, 'reviews'>, now: number): number | undefined {
  let best: number | undefined;
  for (const s of Object.values(progress.reviews ?? {})) {
    if (s && s.due > now && (best === undefined || s.due < best)) best = s.due;
  }
  return best;
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
