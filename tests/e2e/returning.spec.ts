import { test, expect } from '@playwright/test';
import { ahead, collectErrors, enter, installClock, lookAt, pinch, placeN, posOf, recallN, setClockShift, st } from './helpers';

/**
 * Day 1: onboarding. Day 2 (clock +26 h), the learner sits elsewhere and the headset was
 * recentred: the palace must reload onto the SAME objects (registration from furniture),
 * only due notions glow, and answering them updates tiers. Also checks exit (fist) & resume.
 */
test('returning learner: palace reloads on the same objects after recentring, due notions reviewed', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = collectErrors(page);
  await installClock(page);
  await page.goto('/app/?emu=living_room&test=1&reset=1');
  await setClockShift(page, 0);
  await enter(page, '/app/?emu=living_room&test=1');

  // Day 1 — onboarding, quickly.
  await expect.poll(async () => (await st(page)).flow?.step, { timeout: 30_000 }).toBe('pinch');
  await lookAt(page, await posOf(page, 'flame'));
  await pinch(page);
  await page.waitForTimeout(1800);
  await pinch(page);
  await expect.poll(async () => (await st(page)).flow?.step, { timeout: 120_000 }).toBe('place');
  const targets = (await st(page)).furniture.filter((f) => f.seen).map((f) => f.id);
  await placeN(page, 5, targets, 0);
  await expect.poll(async () => (await st(page)).flow?.step, { timeout: 120_000 }).toBe('recall');
  await recallN(page, 5, { startReviews: 0, wrong: [2] });
  // One wrong answer comes back at the end of the session.
  await recallN(page, 1, { startReviews: 5 });
  await expect.poll(async () => (await st(page)).onboardingDone, { timeout: 40_000 }).toBe(true);
  const day1 = await st(page);
  expect(day1.placements).toBe(5);

  // Exit with a closed fist held for a second.
  await page.evaluate(() => ((window as any).__loci.Hands.force.fist = 'right'));
  await expect.poll(async () => (await st(page)).session, { timeout: 20_000 }).toBe(false);
  await page.evaluate(() => ((window as any).__loci.Hands.force.fist = null));

  // Day 2 — 26 hours later, seated 40 cm to the left and turned 35°, reference space recentred.
  await setClockShift(page, 26 * 3600_000);
  await page.goto('/app/?emu=living_room&test=1');
  await page.locator('#enter:not([disabled])').waitFor({ timeout: 90_000 });
  await page.evaluate(() => (window as any).__loci.pose(-0.4, 1.2, 0.3, 35, false));
  await page.locator('#enter:not([disabled])').click();
  await expect.poll(async () => (await st(page)).session, { timeout: 30_000 }).toBe(true);
  await page.evaluate(() => (window as any).__loci.pose(-0.4, 1.2, 0.3, 35, true));
  await expect.poll(async () => (await st(page)).roomReady, { timeout: 30_000 }).toBe(true);
  const s2 = await st(page);
  expect(s2.registration).toBe('furniture');
  expect(s2.placements).toBe(5);
  const err = await page.evaluate(() => (window as any).__loci.placementError());
  expect(err).toBeLessThan(0.12);

  // Only due notions glow; review them all.
  await expect.poll(async () => (await st(page)).due.length, { timeout: 40_000 }).toBeGreaterThan(0);
  const due = (await st(page)).due.length;
  const r0 = (await st(page)).reviews;
  await recallN(page, due, { startReviews: r0 });
  await expect.poll(async () => (await st(page)).proof, { timeout: 40_000 }).toBe(true);
  await page.screenshot({ path: 'shots/e2e/ret-summary.png' });
  await lookAt(page, ahead);
  expect(errors, errors.join('\n')).toEqual([]);
});
