import { describe, expect, it } from 'vitest';
import { DAILY_LOAD, MAX_NEW_PER_DAY, daysUntilExam, examSchedule, planToday } from '../../../src/core/planner';
import { applyReview, newReview } from '../../../src/core/srs';
import { DAY_MS, HOUR_MS, MINUTE_MS, dayIndex, isoDate } from '../../../src/core/time';
import type { Notion, Palace, PalaceProgress, ReviewState } from '../../../src/core/types';

const NOW = Date.UTC(2026, 9, 5, 18, 0);
const today = dayIndex(NOW);
const exam = (days: number) => isoDate(today + days);

function palace(n: number, examDate?: string): Palace {
  const notions: Notion[] = Array.from({ length: n }, (_, i) => ({
    id: `n${i}`,
    question: `Q${i}?`,
    answer: `A${i}`,
    distractors: [`B${i}`, `C${i}`],
    scene: { actors: [{ model: 'owl', role: 'hero', anim: 'float' }], caption: 'OWL', hooks: ['OWL'] },
  }));
  return { id: 'p', title: 'P', subject: 'S', lang: 'en', createdAt: 0, notions, ...(examDate ? { examDate } : {}) };
}

function progressWith(entries: Array<{ id: string; order: number; review: ReviewState }>): PalaceProgress {
  return {
    palaceId: 'p',
    roomId: 'r',
    placements: entries.map((e) => ({ notionId: e.id, furnitureId: 'f', local: [0, 0, 0], order: e.order, placedAt: e.review.placedAt })),
    reviews: Object.fromEntries(entries.map((e) => [e.id, e.review])),
  };
}

/** A notion answered correctly on the given day offsets (relative to today). */
function reviewed(id: string, days: number[], dueInDays = 1): ReviewState {
  let s = newReview(id, NOW + days[0] * DAY_MS - MINUTE_MS);
  for (const d of days) s = applyReview(s, 'good', 'bubble', NOW + d * DAY_MS);
  return { ...s, due: NOW + dueInDays * DAY_MS };
}

const empty: PalaceProgress = { palaceId: 'p', roomId: 'r', placements: [], reviews: {} };

describe('daysUntilExam', () => {
  it('counts learning days, undefined when absent or past', () => {
    expect(daysUntilExam(exam(5), NOW)).toBe(5);
    expect(daysUntilExam(exam(0), NOW)).toBe(0);
    expect(daysUntilExam(exam(-1), NOW)).toBeUndefined();
    expect(daysUntilExam(undefined, NOW)).toBeUndefined();
    expect(daysUntilExam('garbage', NOW)).toBeUndefined();
    // 02:00 local is still "yesterday": the exam tomorrow is 2 learning days away.
    expect(daysUntilExam(isoDate(today + 1), NOW + 8 * HOUR_MS)).toBe(1);
  });
});

describe('planToday — no exam', () => {
  it('first day: place 5, nothing due', () => {
    const p = planToday(palace(20), empty, NOW);
    expect(p).toMatchObject({ due: [], newToPlace: 5, nextToPlace: ['n0', 'n1', 'n2', 'n3', 'n4'], onTrack: true, solidCount: 0, total: 20 });
    expect(p.daysLeft).toBeUndefined();
    expect(p.summaryLine).toBe('0 of 20 solid · 5 new notions to place');
  });
  it('respects the remaining unplaced notions', () => {
    const pr = progressWith([0, 1, 2].map((i) => ({ id: `n${i}`, order: i, review: reviewed(`n${i}`, [-1]) })));
    const p = planToday(palace(5), pr, NOW);
    expect(p.newToPlace).toBe(2);
    expect(p.nextToPlace).toEqual(['n3', 'n4']);
  });
  it('due notions in route order, only from this palace', () => {
    const pr = progressWith([
      { id: 'n2', order: 0, review: reviewed('n2', [-1], -0.1) },
      { id: 'n0', order: 2, review: reviewed('n0', [-1], -0.1) },
      { id: 'n1', order: 1, review: reviewed('n1', [-1], 1) },
      { id: 'zz', order: 3, review: reviewed('zz', [-1], -0.1) },
    ]);
    const p = planToday(palace(3), pr, NOW);
    expect(p.due).toEqual(['n2', 'n0']);
    expect(p.summaryLine).toBe('0 of 3 solid · 2 to review');
  });
  it('pauses new placements under a heavy review load', () => {
    const entries = Array.from({ length: 18 }, (_, i) => ({ id: `n${i}`, order: i, review: reviewed(`n${i}`, [-3], -0.1) }));
    const p = planToday(palace(20), progressWith(entries), NOW);
    expect(p.due).toHaveLength(18);
    expect(p.newToPlace).toBe(0);
    expect(p.onTrack).toBe(false);
    const light = planToday(palace(20), progressWith(entries.slice(0, 12)), NOW);
    expect(light.newToPlace).toBe(Math.min(MAX_NEW_PER_DAY, DAILY_LOAD - 12));
  });
  it('options: maxNewPerDay (never above 5) and dailyLoad', () => {
    expect(planToday(palace(20), empty, NOW, { maxNewPerDay: 2 }).newToPlace).toBe(2);
    expect(planToday(palace(20), empty, NOW, { maxNewPerDay: 50 }).newToPlace).toBe(5);
    expect(planToday(palace(20), empty, NOW, { maxNewPerDay: -1 }).newToPlace).toBe(0);
    expect(planToday(palace(20), empty, NOW, { dailyLoad: 3 }).newToPlace).toBe(3);
  });
  it('all caught up and solid counts', () => {
    const pr = progressWith([
      { id: 'n0', order: 0, review: reviewed('n0', [-5, -4, -2], 3) },
      { id: 'n1', order: 1, review: reviewed('n1', [-1], 1) },
    ]);
    const p = planToday(palace(2), pr, NOW);
    expect(p.solidCount).toBe(1);
    expect(p.summaryLine).toBe('1 of 2 solid · all caught up');
  });
  it('handles an empty palace and missing progress fields', () => {
    const p = planToday(palace(0), {} as PalaceProgress, NOW);
    expect(p).toMatchObject({ due: [], newToPlace: 0, total: 0, solidCount: 0, summaryLine: '0 of 0 solid · all caught up' });
  });
});

describe('planToday — exam countdown', () => {
  it('on track with plenty of time', () => {
    const p = planToday(palace(20, exam(20)), empty, NOW);
    expect(p).toMatchObject({ daysLeft: 20, onTrack: true, newToPlace: 5 });
    expect(p.summaryLine).toBe('0 of 20 solid · exam in 20 days · on track');
  });
  it('front-loads placements so every notion gets 3 days before the exam', () => {
    // 16 placed and due (load-based would be 0), 4 left: the deadline sets the minimum pace.
    const entries = Array.from({ length: 16 }, (_, i) => ({ id: `n${i}`, order: i, review: reviewed(`n${i}`, [-1], -0.1) }));
    const pr = progressWith(entries);
    const p = planToday(palace(20, exam(6)), pr, NOW); // placing days = 4 → 1 per day
    expect(p.due).toHaveLength(16);
    expect(p.newToPlace).toBe(1);
    expect(p.onTrack).toBe(true);
    expect(planToday(palace(20, exam(4)), pr, NOW).newToPlace).toBe(2); // 2 placing days
    expect(planToday(palace(20, exam(3)), pr, NOW).newToPlace).toBe(4); // last placing day
  });
  it('behind schedule when too many are left for the time', () => {
    const p = planToday(palace(20, exam(5)), empty, NOW); // placing days = 3 → max 15 placeable
    expect(p.newToPlace).toBe(5);
    expect(p.onTrack).toBe(false);
    expect(p.summaryLine).toBe('0 of 20 solid · exam in 5 days · behind schedule');
  });
  it('placed notions that can no longer reach solid are flagged', () => {
    const pr = progressWith([{ id: 'n0', order: 0, review: reviewed('n0', [0], 1) }]); // 1 correct day, today
    expect(planToday(palace(1, exam(3)), pr, NOW).onTrack).toBe(true); // tomorrow + eve
    expect(planToday(palace(1, exam(2)), pr, NOW).onTrack).toBe(false); // only the eve left
    const yesterday = progressWith([{ id: 'n0', order: 0, review: reviewed('n0', [-1], 0) }]);
    expect(planToday(palace(1, exam(2)), yesterday, NOW).onTrack).toBe(true); // today + eve
  });
  it('last-minute: still places (best effort) but reports behind; exam day: review only', () => {
    const p = planToday(palace(8, exam(1)), empty, NOW);
    expect(p).toMatchObject({ newToPlace: 5, onTrack: false, daysLeft: 1 });
    expect(p.summaryLine).toBe('0 of 8 solid · exam tomorrow · behind schedule');
    const d0 = planToday(palace(8, exam(0)), empty, NOW);
    expect(d0).toMatchObject({ newToPlace: 0, daysLeft: 0 });
    expect(d0.summaryLine).toContain('exam today');
  });
  it('ready when everything is solid; opts.examDate overrides the palace', () => {
    const pr = progressWith([{ id: 'n0', order: 0, review: reviewed('n0', [-5, -4, -2], 3) }]);
    expect(planToday(palace(1, exam(3)), pr, NOW).summaryLine).toBe('1 of 1 solid · exam in 3 days · ready');
    expect(planToday(palace(1), pr, NOW, { examDate: exam(9) }).daysLeft).toBe(9);
    expect(planToday(palace(1, exam(-3)), pr, NOW).daysLeft).toBeUndefined();
  });
  it('maxNewPerDay 0 with notions left is never on track', () => {
    expect(planToday(palace(3, exam(10)), empty, NOW, { maxNewPerDay: 0 }).onTrack).toBe(false);
  });
});

describe('examSchedule', () => {
  it('empty without a future exam or on exam day', () => {
    expect(examSchedule(palace(5), empty, NOW)).toEqual([]);
    expect(examSchedule(palace(5, exam(0)), empty, NOW)).toEqual([]);
    expect(examSchedule(palace(5, exam(-2)), empty, NOW)).toEqual([]);
  });
  it('projects every day until the eve, and everything is solid by then when on track', () => {
    const days = examSchedule(palace(20, exam(10)), empty, NOW);
    expect(days).toHaveLength(10);
    expect(days[0]).toMatchObject({ date: isoDate(today), dayOffset: 0, reviews: 0, newToPlace: 5 });
    expect(days[9].date).toBe(isoDate(today + 9));
    expect(days.reduce((s, d) => s + d.newToPlace, 0)).toBe(20);
    expect(days[days.length - 1].solid).toBe(20);
    for (let i = 1; i < days.length; i++) expect(days[i].solid).toBeGreaterThanOrEqual(days[i - 1].solid);
    // Every notion is reviewed on the eve (eve cap).
    expect(days[9].reviews).toBe(20);
  });
  it('tight deadline: all placed by exam − 3 days and solid on the eve', () => {
    const days = examSchedule(palace(15, exam(5)), empty, NOW);
    expect(days.map((d) => d.newToPlace)).toEqual([5, 5, 5, 0, 0]);
    expect(days[4].solid).toBe(15);
  });
  it('does not mutate the real progress', () => {
    const pr = progressWith([{ id: 'n0', order: 0, review: reviewed('n0', [-1], -0.1) }]);
    const copy = JSON.parse(JSON.stringify(pr));
    examSchedule(palace(3, exam(7)), pr, NOW);
    expect(pr).toEqual(copy);
  });
  it('caps the horizon', () => {
    expect(examSchedule(palace(2, exam(1000)), empty, NOW)).toHaveLength(400);
  });
});
