import { test, expect } from '@playwright/test';
import { collectErrors, enter, lookAt, pinch, placeN, posOf, recallN, st } from './helpers';

/**
 * Brief: "Retirer le casque puis le remettre ramène exactement au même point."
 * 1) Headset off in the middle of placement → nothing advances, progress is saved → back on → continue.
 * 2) Full reload in the middle of onboarding → resumes at the same step with the same placements.
 */
test('pause/resume: headset off mid-placement and a full reload both resume exactly', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = collectErrors(page);
  await page.goto('/app/?emu=living_room&test=1&reset=1');
  await page.locator('#enter:not([disabled])').waitFor({ timeout: 90_000 });
  await enter(page, '/app/?emu=living_room&test=1');
  await expect.poll(async () => (await st(page)).flow?.step, { timeout: 30_000 }).toBe('pinch');
  await lookAt(page, await posOf(page, 'flame'));
  await pinch(page);
  await page.waitForTimeout(1800);
  await pinch(page);
  await expect.poll(async () => (await st(page)).flow?.step, { timeout: 120_000 }).toBe('place');
  const targets = (await st(page)).furniture.filter((f) => f.seen).map((f) => f.id);
  await placeN(page, 2, targets, 0);

  // Headset off: the presented scene waits, nothing advances even if the learner "pinches".
  await expect.poll(async () => (await st(page)).presenting, { timeout: 30_000 }).not.toBeNull();
  const before = await st(page);
  await page.evaluate(() => (window as any).__loci.visibility('hidden'));
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as any).__loci.savedPlacements())).toBe(2);
  await page.evaluate(() => ((window as any).__loci.Hands.force.pinch = 'right'));
  await page.waitForTimeout(3000);
  await page.evaluate(() => ((window as any).__loci.Hands.force.pinch = null));
  const during = await st(page);
  expect(during.placements).toBe(2);
  expect(during.presenting).toBe(before.presenting);
  expect(during.flow?.step).toBe('place');

  // Headset back on: continue exactly there.
  await page.evaluate(() => (window as any).__loci.visibility('visible'));
  await page.waitForTimeout(500);
  await placeN(page, 1, targets.slice(2), 2);

  // Full reload mid-onboarding.
  await page.reload();
  await page.locator('#enter:not([disabled])').click({ timeout: 90_000 });
  await expect.poll(async () => (await st(page)).session, { timeout: 30_000 }).toBe(true);
  await expect.poll(async () => (await st(page)).flow?.step, { timeout: 60_000 }).toBe('place');
  await expect.poll(async () => (await st(page)).placements, { timeout: 30_000 }).toBe(3);
  await placeN(page, 2, targets.slice(3), 3);
  await expect.poll(async () => (await st(page)).flow?.step, { timeout: 120_000 }).toBe('recall');
  await recallN(page, 5, { startReviews: 0 });
  await expect.poll(async () => (await st(page)).onboardingDone, { timeout: 40_000 }).toBe(true);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('sparse room: no furniture detected → learner plants lanterns on the walls, onboarding still works', async ({ page }) => {
  test.setTimeout(420_000);
  const errors = collectErrors(page);
  await page.goto('/app/?emu=empty&test=1&reset=1');
  await page.locator('#enter:not([disabled])').waitFor({ timeout: 90_000 });
  await enter(page, '/app/?emu=empty&test=1');
  await expect.poll(async () => (await st(page)).flow?.step, { timeout: 30_000 }).toBe('pinch');
  await lookAt(page, await posOf(page, 'flame'));
  await pinch(page);
  await page.waitForTimeout(1800);
  await pinch(page);
  // Lantern fallback: 5 pinches at different spots.
  const spots = [[-1.2, 1.4, -1.5], [-0.5, 1.6, -1.8], [0.3, 1.5, -1.9], [1.0, 1.3, -1.6], [1.5, 1.4, -0.8]];
  for (const p of spots) {
    await expect.poll(async () => (await st(page)).flow?.step, { timeout: 60_000 }).toBe('scan');
    await lookAt(page, p);
    await page.waitForTimeout(300);
    await pinch(page);
    await page.waitForTimeout(600);
  }
  await expect.poll(async () => (await st(page)).furniture.filter((f) => f.label === 'manual').length, { timeout: 30_000 }).toBe(5);
  await expect.poll(async () => (await st(page)).flow?.step, { timeout: 60_000 }).toBe('place');
  await page.screenshot({ path: 'shots/e2e/sparse-lanterns.png' });
  const lanterns = (await st(page)).furniture.filter((f) => f.label === 'manual').map((f) => f.id);
  await placeN(page, 5, lanterns, 0);
  await expect.poll(async () => (await st(page)).flow?.step, { timeout: 120_000 }).toBe('recall');
  await recallN(page, 5, { startReviews: 0 });
  await expect.poll(async () => (await st(page)).onboardingDone, { timeout: 40_000 }).toBe(true);
  expect(errors, errors.join('\n')).toEqual([]);
});
