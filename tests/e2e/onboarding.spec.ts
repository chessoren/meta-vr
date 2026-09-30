import { test, expect, type Page } from '@playwright/test';

/**
 * The complete first five minutes, driven like a learner would in the headset:
 * pinch the flame, watch the scan, place 5 capitals on real (synthetic) furniture by
 * pinch + gaze + release, lights out, recall each by gaze + pinching a bubble, get the proof.
 */
type State = {
  session: boolean;
  roomReady: boolean;
  furniture: { id: string; label: string; seen: boolean }[];
  flow: { kind: string; step: string } | null;
  onboardingDone: boolean;
  placements: number;
  reviews: number;
  card: boolean;
  bubbles: boolean[];
  proof: boolean;
  options: string[] | null;
  currentNotion: { id: string; answer: string } | null;
  due: string[];
  presenting: string | null;
};

const st = (page: Page) => page.evaluate(() => (window as any).__loci.state() as State);
const lookAt = (page: Page, p: number[]) => page.evaluate((p) => (window as any).__loci.lookAt(p[0], p[1], p[2]), p);
const posOf = (page: Page, what: string) => page.evaluate((w) => (window as any).__loci.posOf(w) as number[], what);
async function pinch(page: Page, holdMs = 250) {
  await page.evaluate(() => ((window as any).__loci.Hands.force.pinch = 'right'));
  await page.waitForTimeout(holdMs);
  await page.evaluate(() => ((window as any).__loci.Hands.force.pinch = null));
  await page.waitForTimeout(150);
}
async function shot(page: Page, name: string) {
  await page.screenshot({ path: `shots/e2e/onb-${name}.png` });
}

test('first five minutes: 5 capitals placed and recalled, 5/5 proof', async ({ page }) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  await page.goto('/app/?emu=living_room&test=1&reset=1');
  await page.locator('#enter:not([disabled])').click({ timeout: 90_000 });
  await expect.poll(async () => (await st(page)).session, { timeout: 30_000 }).toBe(true);

  // 0:15 pinch lesson
  await expect.poll(async () => (await st(page)).flow?.step, { timeout: 30_000 }).toBe('pinch');
  await shot(page, '1-hello');
  await lookAt(page, await posOf(page, 'flame'));
  await page.waitForTimeout(400);
  await pinch(page);
  await page.waitForTimeout(1800);
  await pinch(page);

  // 0:30 scan → place
  await expect.poll(async () => (await st(page)).flow?.step, { timeout: 120_000 }).toBe('place');
  const s0 = await st(page);
  const targets = s0.furniture.filter((f) => f.seen).map((f) => f.id);
  expect(targets.length).toBeGreaterThanOrEqual(3);

  for (let i = 0; i < 5; i++) {
    await expect.poll(async () => (await st(page)).presenting, { timeout: 30_000 }).not.toBeNull();
    if (i === 0) await shot(page, '2-present');
    // Grab (pinch and hold), aim at a piece of furniture, release.
    await page.evaluate(() => ((window as any).__loci.Hands.force.pinch = 'right'));
    await page.waitForTimeout(300);
    await lookAt(page, await posOf(page, `furniture:${targets[i % targets.length]}`));
    await page.waitForTimeout(500);
    if (i === 0) await shot(page, '3-aim');
    await page.evaluate(() => ((window as any).__loci.Hands.force.pinch = null));
    await expect.poll(async () => (await st(page)).placements, { timeout: 15_000 }).toBe(i + 1);
    await lookAt(page, [0, 1.1, -1]);
  }
  await shot(page, '4-placed');

  // 3:30 recall
  await expect.poll(async () => (await st(page)).flow?.step, { timeout: 120_000 }).toBe('recall');
  for (let i = 0; i < 5; i++) {
    await expect.poll(async () => (await st(page)).due.length, { timeout: 30_000 }).toBeGreaterThan(0);
    const s = await st(page);
    await lookAt(page, await posOf(page, s.due[0]));
    await page.waitForTimeout(300);
    await pinch(page);
    await expect.poll(async () => (await st(page)).options, { timeout: 15_000 }).not.toBeNull();
    const q = await st(page);
    if (i === 0) await shot(page, '5-question');
    const idx = q.options!.indexOf(q.currentNotion!.answer);
    await lookAt(page, await posOf(page, `bubble${idx}`));
    await page.waitForTimeout(300);
    await pinch(page);
    await expect.poll(async () => (await st(page)).reviews, { timeout: 15_000 }).toBe(i + 1);
    if (i === 0) {
      await page.waitForTimeout(500);
      await shot(page, '6-correct');
    }
    await lookAt(page, [0, 1.1, -1]);
  }

  // 4:30 proof
  await expect.poll(async () => (await st(page)).proof, { timeout: 30_000 }).toBe(true);
  await shot(page, '7-proof');
  await expect.poll(async () => (await st(page)).onboardingDone, { timeout: 30_000 }).toBe(true);
  expect(errors, errors.join('\n')).toEqual([]);
});
