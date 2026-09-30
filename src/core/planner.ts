/**
 * Daily plan and exam countdown.
 *
 * {@link planToday} answers "what do I do in today's 5–10 minute session?": which notions to review
 * (in route order), how many new notions to place, and whether the learner is on track for the
 * exam. {@link examSchedule} projects the plan day by day until the exam, assuming every answer is
 * correct — a forecast for the countdown UI, not a promise.
 *
 * Exam rule of thumb: a notion needs **3 learning days** before the exam to become solid
 * (placed + recalled on day d, then d+1, then d+2 ≤ eve). New notions are therefore front-loaded
 * so the last batch is placed at least 3 days before the exam.
 */
import type { Palace, PalaceProgress, ReviewState } from './types';
import { applyReview, dueNotions, newReview } from './srs';
import { SOLID_DAYS, atLeast, correctStats, tierOf } from './tiers';
import { DAY_MS, MINUTE_MS, dayIndex, isoDate, parseIsoDate } from './time';

/** Default maximum number of new notions placed per day. */
export const MAX_NEW_PER_DAY = 5;
/** Default number of reviews after which no new notion is proposed (unless the exam requires it). */
export const DAILY_LOAD = 15;

export interface PlanOpts {
  /** Minutes to add to UTC to get local time (see time.ts). Default 0. */
  tzOffsetMin?: number;
  /** Cap of new notions per day (default 5, never above 5). */
  maxNewPerDay?: number;
  /** Review load above which new placements pause (default 15). */
  dailyLoad?: number;
  /** Overrides `palace.examDate`. */
  examDate?: string;
}

export interface TodayPlan {
  /** Due notion ids, in route order (placed ones), restricted to the palace's notions. */
  due: string[];
  /** Number of new notions to place today (0–5). */
  newToPlace: number;
  /** The next unplaced notion ids, in palace order (length = newToPlace). */
  nextToPlace: string[];
  /** Whole days until the exam (0 = today, 1 = tomorrow); undefined without a future exam. */
  daysLeft?: number;
  /** Exam: every notion can still be solid on the eve. Without exam: the review load is manageable. */
  onTrack: boolean;
  /** Notions at tier solid or anchored. */
  solidCount: number;
  total: number;
  /** One line for the session summary, e.g. "12 of 20 solid · exam in 5 days · on track". */
  summaryLine: string;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Days until the exam (≥ 0) or undefined when there is no exam date or it is past. */
export function daysUntilExam(examDate: string | undefined, now: number, tzOffsetMin = 0): number | undefined {
  const examDay = parseIsoDate(examDate);
  if (examDay === null) return undefined;
  const d = examDay - dayIndex(now, tzOffsetMin);
  return d >= 0 ? d : undefined;
}

/** Plans today's session for a palace. */
export function planToday(palace: Palace, progress: PalaceProgress, now: number, opts: PlanOpts = {}): TodayPlan {
  const tz = opts.tzOffsetMin ?? 0;
  const maxNew = Math.max(0, Math.min(MAX_NEW_PER_DAY, Math.floor(opts.maxNewPerDay ?? MAX_NEW_PER_DAY)));
  const load = Math.max(0, opts.dailyLoad ?? DAILY_LOAD);
  const ids = new Set(palace.notions.map((n) => n.id));
  const placed = new Set((progress.placements ?? []).map((p) => p.notionId).filter((id) => ids.has(id)));
  const due = dueNotions(progress, now).filter((id) => ids.has(id));
  const unplaced = palace.notions.filter((n) => !placed.has(n.id)).map((n) => n.id);
  const daysLeft = daysUntilExam(opts.examDate ?? palace.examDate, now, tz);
  const today = dayIndex(now, tz);

  // ── New placements ──
  const loadBased = Math.max(0, load - due.length);
  let newToPlace: number;
  if (daysLeft === undefined) newToPlace = Math.min(maxNew, unplaced.length, loadBased);
  else if (daysLeft === 0) newToPlace = 0; // exam day: review only
  else {
    const placingDays = daysLeft - (SOLID_DAYS - 1); // days on which a new notion can still become solid
    const needed = placingDays >= 1 ? Math.ceil(unplaced.length / placingDays) : unplaced.length;
    newToPlace = Math.min(maxNew, unplaced.length, Math.max(loadBased, needed));
  }

  // ── Tiers & feasibility ──
  let solidCount = 0;
  let feasible = true;
  for (const n of palace.notions) {
    const r: ReviewState | undefined = progress.reviews?.[n.id];
    if (!r) continue;
    const tier = tierOf(r, { tzOffsetMin: tz });
    if (atLeast(tier, 'solid')) {
      solidCount++;
      continue;
    }
    if (daysLeft !== undefined && placed.has(n.id)) {
      const s = correctStats(r, { tzOffsetMin: tz });
      const correctToday = s.lastCorrectDay === today;
      const available = daysLeft - (correctToday ? 1 : 0); // learning days left before the exam (today … eve)
      if (SOLID_DAYS - s.correctDays > available) feasible = false;
    }
  }
  if (daysLeft !== undefined && unplaced.length > 0) {
    const placingDays = daysLeft - (SOLID_DAYS - 1);
    if (placingDays < 1 || Math.ceil(unplaced.length / Math.max(1, maxNew)) > placingDays || maxNew === 0) feasible = false;
  }
  const onTrack = daysLeft === undefined ? due.length <= Math.max(load, 1) : feasible;

  // ── Summary ──
  const total = palace.notions.length;
  const parts = [`${solidCount} of ${total} solid`];
  if (daysLeft !== undefined) {
    parts.push(daysLeft === 0 ? 'exam today' : daysLeft === 1 ? 'exam tomorrow' : `exam in ${daysLeft} days`);
    parts.push(solidCount === total ? 'ready' : onTrack ? 'on track' : 'behind schedule');
  } else if (due.length > 0) parts.push(`${due.length} to review`);
  else if (newToPlace > 0) parts.push(`${plural(newToPlace, 'new notion')} to place`);
  else parts.push('all caught up');

  const plan: TodayPlan = { due, newToPlace, nextToPlace: unplaced.slice(0, newToPlace), onTrack, solidCount, total, summaryLine: parts.join(' · ') };
  if (daysLeft !== undefined) plan.daysLeft = daysLeft;
  return plan;
}

export interface ExamDay {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  /** 0 = today. */
  dayOffset: number;
  /** Reviews expected that day. */
  reviews: number;
  /** New notions to place that day. */
  newToPlace: number;
  /** Projected number of solid notions at the end of that day. */
  solid: number;
}

/**
 * Day-by-day forecast from today until the eve of the exam (inclusive), assuming the learner does
 * each day's plan and answers everything correctly. Empty without a future exam (or on exam day).
 * The horizon is capped at 400 days.
 */
export function examSchedule(palace: Palace, progress: PalaceProgress, now: number, opts: PlanOpts = {}): ExamDay[] {
  const tz = opts.tzOffsetMin ?? 0;
  const examDate = opts.examDate ?? palace.examDate;
  const daysLeft = daysUntilExam(examDate, now, tz);
  if (daysLeft === undefined || daysLeft === 0) return [];
  const reviewOpts = { examDate, tzOffsetMin: tz };
  const sim: PalaceProgress = {
    ...progress,
    placements: [...(progress.placements ?? [])],
    reviews: { ...(progress.reviews ?? {}) },
  };
  const out: ExamDay[] = [];
  const today = dayIndex(now, tz);
  const horizon = Math.min(daysLeft, 400);
  for (let d = 0; d < horizon; d++) {
    const t = now + d * DAY_MS;
    const plan = planToday(palace, sim, t, { ...opts, examDate });
    for (const id of plan.due) sim.reviews[id] = applyReview(sim.reviews[id], 'good', 'bubble', t, reviewOpts);
    let order = sim.placements.reduce((m, p) => Math.max(m, p.order + 1), 0);
    for (const id of plan.nextToPlace) {
      sim.placements.push({ notionId: id, furnitureId: '', local: [0, 0, 0], order: order++, placedAt: t });
      sim.reviews[id] = applyReview(newReview(id, t), 'good', 'bubble', t + 5 * MINUTE_MS, reviewOpts);
    }
    const solid = palace.notions.filter((n) => sim.reviews[n.id] && atLeast(tierOf(sim.reviews[n.id], { tzOffsetMin: tz }), 'solid')).length;
    out.push({ date: isoDate(today + d), dayOffset: d, reviews: plan.due.length, newToPlace: plan.newToPlace, solid });
  }
  return out;
}
