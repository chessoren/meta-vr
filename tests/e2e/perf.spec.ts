import { test, expect } from '@playwright/test';
import { collectErrors, enter, lookAt, seedReturningStore, st } from './helpers';

/** Budget check with the 20-notion History palace placed in a real (synthetic) room. */
test('perf budget: 20 scenes placed stays under draw-call and triangle budgets', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  await page.goto('/app/?emu=living_room&reset=1');
  await seedReturningStore(page);
  await enter(page, '/app/?emu=living_room');
  await expect.poll(async () => (await st(page)).roomReady, { timeout: 30_000 }).toBe(true);
  const results: Record<string, unknown> = {};
  for (const mode of ['idle', 'reveal'] as const) {
    const n = await page.evaluate((m) => (window as any).__loci.placeAll('world-wars', m), mode);
    expect(n).toBe(20);
    // Look across the whole room (worst case: everything in view).
    await lookAt(page, [0, 0.8, -2.5]);
    await page.waitForTimeout(1500);
    const samples: any[] = [];
    for (let i = 0; i < 5; i++) {
      samples.push(await page.evaluate(() => (window as any).__loci.renderInfo()));
      await page.waitForTimeout(200);
    }
    const worst = samples.reduce((a, b) => (b.calls > a.calls ? b : a));
    results[mode] = worst;
    await page.screenshot({ path: `shots/e2e/perf-${mode}.png` });
  }
  const fps = await page.evaluate(
    () =>
      new Promise<number>((res) => {
        let n = 0;
        const t0 = performance.now();
        const loop = () => (++n < 60 ? requestAnimationFrame(loop) : res((n * 1000) / (performance.now() - t0)));
        requestAnimationFrame(loop);
      }),
  );
  console.log('PERF', JSON.stringify(results), 'swiftshader-fps', fps.toFixed(1));
  const reveal = results.reveal as { calls: number; triangles: number };
  expect(reveal.calls).toBeLessThan(150 * 1.0);
  expect(reveal.triangles).toBeLessThan(150_000);
  expect(errors, errors.join('\n')).toEqual([]);
});
