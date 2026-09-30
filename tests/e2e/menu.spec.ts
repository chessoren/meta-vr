import { test, expect } from '@playwright/test';
import { collectErrors, enter, lookAt, seedReturningStore, st } from './helpers';

/** Look at the palm → menu → Palaces → pick "World Wars I & II" on the shelf → its session starts. */
test('palm menu: open, choose Palaces, pick the History palace on the shelf', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = collectErrors(page);
  await page.goto('/app/?emu=living_room&test=1&reset=1');
  await seedReturningStore(page);
  await enter(page, '/app/?emu=living_room&test=1');
  await expect.poll(async () => (await st(page)).roomReady, { timeout: 30_000 }).toBe(true);
  await page.waitForTimeout(3000);

  // Palm towards the face → the menu appears above the hand.
  await page.evaluate(() => ((window as any).__loci.Hands.force.palmFace = 'left'));
  await expect.poll(async () => (await st(page)).menu, { timeout: 15_000 }).toBe(true);
  await page.screenshot({ path: 'shots/e2e/menu-open.png' });
  // Gaze at "Palaces" and pinch with the other (right) hand.
  await lookAt(page, await page.evaluate(() => (window as any).__loci.menuButton('palaces')));
  await page.waitForTimeout(400);
  await page.evaluate(() => ((window as any).__loci.Hands.force.pinch = 'right'));
  await page.waitForFunction(() => (window as any).__loci.Hands.right.pinching);
  await page.evaluate(() => ((window as any).__loci.Hands.force.palmFace = null));
  await page.evaluate(() => ((window as any).__loci.Hands.force.pinch = null));
  await expect.poll(async () => (await st(page)).shelf, { timeout: 15_000 }).toBe(true);
  expect((await st(page)).shelfBooks).toEqual(expect.arrayContaining(['capitals', 'world-wars', 'import']));
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'shots/e2e/menu-shelf.png' });

  // Pick the History palace.
  await lookAt(page, await page.evaluate(() => (window as any).__loci.shelfBook('world-wars')));
  await page.waitForTimeout(400);
  await page.evaluate(() => ((window as any).__loci.Hands.force.pinch = 'right'));
  await page.waitForFunction(() => (window as any).__loci.Hands.right.pinching);
  await page.evaluate(() => ((window as any).__loci.Hands.force.pinch = null));
  await expect.poll(async () => (await st(page)).activePalace, { timeout: 15_000 }).toBe('world-wars');
  await expect.poll(async () => (await st(page)).presenting, { timeout: 40_000 }).not.toBeNull();
  expect(errors, errors.join('\n')).toEqual([]);
});
