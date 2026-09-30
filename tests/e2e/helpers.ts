import { expect, type Page } from '@playwright/test';

export type State = {
  session: boolean;
  roomReady: boolean;
  registration: string;
  furniture: { id: string; label: string; name: string; seen: boolean }[];
  flow: { kind: string; step: string; palaceId: string } | null;
  onboardingDone: boolean;
  activePalace?: string;
  placements: number;
  reviews: number;
  card: boolean;
  bubbles: boolean[];
  proof: boolean;
  qr: boolean;
  options: string[] | null;
  currentNotion: { id: string; answer: string } | null;
  due: string[];
  presenting: string | null;
  pair: string | null;
};

export const st = (page: Page) => page.evaluate(() => (window as any).__loci.state() as State);
export const lookAt = (page: Page, p: number[]) => page.evaluate((p) => (window as any).__loci.lookAt(p[0], p[1], p[2]), p);
export const posOf = (page: Page, what: string) => page.evaluate((w) => (window as any).__loci.posOf(w) as number[], what);
export const ahead = [0, 1.1, -1];

/** Press the (emulated) pinch and wait until a rendered frame has seen it — robust at any frame rate. */
export async function pinchDown(page: Page) {
  await page.evaluate(() => ((window as any).__loci.Hands.force.pinch = 'right'));
  await page.waitForFunction(() => (window as any).__loci.Hands.right.pinching, null, { timeout: 10_000 });
}
/** Release the pinch and wait until a frame has seen the release. */
export async function pinchUp(page: Page) {
  await page.evaluate(() => ((window as any).__loci.Hands.force.pinch = null));
  await page.waitForFunction(() => !(window as any).__loci.Hands.right.pinching, null, { timeout: 10_000 });
}
export async function pinch(page: Page, holdMs = 120) {
  await pinchDown(page);
  await page.waitForTimeout(holdMs);
  await pinchUp(page);
  await page.waitForTimeout(100);
}

/** Shift the page clock (Date.now) by `ms`, persisted across reloads. Call before goto. */
export async function installClock(page: Page) {
  await page.addInitScript(() => {
    const shift = Number(localStorage.getItem('__clockShift') || 0);
    const orig = Date.now.bind(Date);
    Date.now = () => orig() + shift;
  });
}
export async function setClockShift(page: Page, ms: number) {
  await page.locator('#enter:not([disabled])').waitFor({ timeout: 90_000 });
  await page.evaluate((ms) => localStorage.setItem('__clockShift', String(ms)), ms);
}

export function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|ERR_CONNECTION/.test(m.text())) errors.push(m.text());
  });
  return errors;
}

export async function enter(page: Page, url: string) {
  await page.goto(url);
  await page.locator('#enter:not([disabled])').click({ timeout: 90_000 });
  await expect.poll(async () => (await st(page)).session, { timeout: 30_000 }).toBe(true);
}

/** Place the currently presented notions (n times) on the given furniture ids round-robin. */
export async function placeN(page: Page, n: number, targets: string[], startCount: number, shot?: (i: number) => Promise<void>) {
  for (let i = 0; i < n; i++) {
    await expect.poll(async () => (await st(page)).presenting, { timeout: 40_000 }).not.toBeNull();
    await pinchDown(page);
    await page.waitForTimeout(200);
    await lookAt(page, await posOf(page, `furniture:${targets[i % targets.length]}`));
    await page.waitForTimeout(500);
    await shot?.(i);
    await pinchUp(page);
    await expect.poll(async () => (await st(page)).placements, { timeout: 15_000 }).toBe(startCount + i + 1);
    await lookAt(page, ahead);
  }
}

/** Answer `n` recall questions (correctly unless `wrong` includes the index). Returns review count. */
export async function recallN(page: Page, n: number, opts: { wrong?: number[]; startReviews: number; shot?: (i: number) => Promise<void> }) {
  let reviews = opts.startReviews;
  for (let i = 0; i < n; i++) {
    await expect.poll(async () => (await st(page)).due.length, { timeout: 40_000 }).toBeGreaterThan(0);
    const s = await st(page);
    await lookAt(page, await posOf(page, s.due[0]));
    await page.waitForTimeout(300);
    await pinch(page);
    try {
      await expect.poll(async () => (await st(page)).options, { timeout: 15_000 }).not.toBeNull();
    } catch (e) {
      console.log('RECALL DEBUG', JSON.stringify({ state: await st(page), targets: await page.evaluate(() => (window as any).__loci.targets()) }));
      await page.screenshot({ path: 'shots/e2e/recall-fail.png' });
      throw e;
    }
    const q = await st(page);
    await opts.shot?.(i);
    let idx = q.options!.indexOf(q.currentNotion!.answer);
    if (opts.wrong?.includes(i)) idx = (idx + 1) % 3;
    await lookAt(page, await posOf(page, `bubble${idx}`));
    await page.waitForTimeout(300);
    await pinch(page);
    reviews++;
    await expect.poll(async () => (await st(page)).reviews, { timeout: 15_000 }).toBe(reviews);
    await lookAt(page, ahead);
  }
  return reviews;
}

/** A store where onboarding is already done (skips the first five minutes). */
export async function seedReturningStore(page: Page) {
  await page.locator('#enter:not([disabled])').waitFor({ timeout: 90_000 });
  await page.evaluate(() =>
    localStorage.setItem(
      'loci.store.v1',
      JSON.stringify({ version: 1, rooms: [], palaces: [], progress: [], settings: { voice: false, sound: true }, onboardingDone: true }),
    ),
  );
}
