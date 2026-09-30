import { test, expect } from '@playwright/test';
import { collectErrors, enter, seedReturningStore, st } from './helpers';

test('boots into emulated mixed reality and understands the room (furniture with labels)', async ({ page }) => {
  const errors = collectErrors(page);
  const t0 = Date.now();
  await page.goto('/app/?emu=living_room&test=1&reset=1');
  await seedReturningStore(page);
  await enter(page, '/app/?emu=living_room&test=1');
  await expect.poll(async () => (await st(page)).roomReady, { timeout: 30_000 }).toBe(true);
  const s = await st(page);
  const labels = new Set(s.furniture.map((f) => f.label));
  expect(s.furniture.length).toBeGreaterThanOrEqual(5);
  for (const l of ['table', 'couch', 'lamp', 'storage']) expect(labels).toContain(l);
  console.log(`room ready in ${((Date.now() - t0) / 1000).toFixed(1)} s (headless software rendering):`, [...labels].join(', '));
  expect(errors, errors.join('\n')).toEqual([]);
});
