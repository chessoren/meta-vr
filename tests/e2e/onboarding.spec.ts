import { test, expect, type Page } from '@playwright/test';
import { collectErrors, enter, lookAt, pinch, placeN, posOf, recallN, st } from './helpers';

/**
 * The complete first five minutes, driven like a learner would in the headset:
 * pinch the flame, watch the scan, place 5 capitals on real (synthetic) furniture by
 * pinch + gaze + release, lights out, recall each by gaze + pinching a bubble, get the proof.
 */
const shot = (page: Page, name: string) => page.screenshot({ path: `shots/e2e/onb-${name}.png` });

test('first five minutes: 5 capitals placed and recalled, 5/5 proof', async ({ page }) => {
  test.setTimeout(480_000);
  const errors = collectErrors(page);
  await page.goto('/app/?emu=living_room&test=1&reset=1');
  await page.locator('#enter:not([disabled])').waitFor({ timeout: 90_000 });
  await enter(page, '/app/?emu=living_room&test=1');

  // 0:15 pinch lesson
  await expect.poll(async () => (await st(page)).flow?.step, { timeout: 30_000 }).toBe('pinch');
  await shot(page, '1-hello');
  await lookAt(page, await posOf(page, 'flame'));
  await page.waitForTimeout(400);
  await pinch(page);
  await page.waitForTimeout(1800);
  await pinch(page);

  // 0:30 scan → 1:30 place
  await expect.poll(async () => (await st(page)).flow?.step, { timeout: 120_000 }).toBe('place');
  const targets = (await st(page)).furniture.filter((f) => f.seen).map((f) => f.id);
  expect(targets.length).toBeGreaterThanOrEqual(3);
  await expect.poll(async () => (await st(page)).presenting, { timeout: 30_000 }).not.toBeNull();
  await shot(page, '2-present');
  await placeN(page, 5, targets, 0, async (i) => {
    if (i === 0) await shot(page, '3-aim');
  });
  await shot(page, '4-placed');

  // 3:30 recall
  await expect.poll(async () => (await st(page)).flow?.step, { timeout: 120_000 }).toBe('recall');
  await recallN(page, 5, {
    startReviews: 0,
    shot: async (i) => {
      if (i === 0) await shot(page, '5-question');
    },
  });

  // 4:30 proof
  await expect.poll(async () => (await st(page)).proof, { timeout: 30_000 }).toBe(true);
  await shot(page, '7-proof');
  await expect.poll(async () => (await st(page)).onboardingDone, { timeout: 30_000 }).toBe(true);
  expect(errors, errors.join('\n')).toEqual([]);
});
