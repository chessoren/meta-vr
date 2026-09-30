import { test, expect } from '@playwright/test';
import { collectErrors, enter, lookAt, seedReturningStore, st } from './helpers';

/** "The room fills up": new scenes, pale fragile ghosts, plants/crystals (solid), gold statues (anchored). */
test('tiers are visible on the objects (screenshot)', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  await page.goto('/app/?emu=living_room&test=1&reset=1');
  await seedReturningStore(page);
  await enter(page, '/app/?emu=living_room&test=1');
  await expect.poll(async () => (await st(page)).roomReady, { timeout: 30_000 }).toBe(true);
  expect(await page.evaluate(() => (window as any).__loci.placeAll('world-wars', 'idle'))).toBe(20);
  expect(await page.evaluate(() => (window as any).__loci.forgeTiers())).toBe(20);
  for (const [name, p] of [['left', [-1.6, 0.9, -1.2]], ['center', [0, 0.8, -2.4]], ['right', [1.6, 0.9, -1.4]]] as const) {
    await lookAt(page, [...p]);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `shots/e2e/tiers-${name}.png` });
  }
  expect(errors, errors.join('\n')).toEqual([]);
});
