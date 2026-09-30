import { test, expect } from '@playwright/test';
import { collectErrors, enter, placeN, recallN, seedReturningStore, st } from './helpers';

const COURSE = `The Cold War
1947: Truman Doctrine announced
1949: NATO founded
1961: Berlin Wall built
1962: Cuban Missile Crisis
1989: Fall of the Berlin Wall
Sputnik: first artificial satellite, launched by the USSR in 1957
Iron Curtain: phrase popularised by Winston Churchill in 1946`;

/**
 * The agentic loop, end to end: the headset shows a code → the "phone" sends a pasted course
 * → the server splits it into notions with mnemonic scenes → the headset receives the palace,
 * places today's notions on real objects and quizzes them.
 */
test('import from phone: code → course → palace arrives in the headset → placed and recalled', async ({ page, request }) => {
  test.setTimeout(480_000);
  const errors = collectErrors(page);
  await page.goto('/app/?emu=office_large&reset=1');
  await seedReturningStore(page);
  await enter(page, '/app/?emu=office_large');
  await expect.poll(async () => (await st(page)).roomReady, { timeout: 30_000 }).toBe(true);
  await page.evaluate(() => (window as any).__loci.menu('import'));
  await expect.poll(async () => (await st(page)).pair, { timeout: 30_000 }).not.toBeNull();
  const code = (await st(page)).pair!;
  await page.screenshot({ path: 'shots/e2e/imp-1-code.png' });

  // ── "Phone" side ──────────────────────────────────────────────────────────
  const chk = await request.get(`/api/pair?code=${code}`);
  expect(chk.ok()).toBe(true);
  const ex = await request.post('/api/extract', { data: { code, kind: 'text', data: COURSE, offline: true } });
  expect(ex.ok(), await ex.text()).toBe(true);
  const r = await ex.json();
  expect(r.notions.length).toBeGreaterThanOrEqual(5);
  const palace = { id: `imp-${Date.now()}`, title: r.title, subject: r.subject, lang: r.lang, createdAt: Date.now(), notions: r.notions.slice(0, 8) };
  const sent = await request.post('/api/palace', { data: { code, palace } });
  expect(sent.ok(), await sent.text()).toBe(true);

  // ── Headset receives it and places today's new notions ────────────────────
  await expect.poll(async () => (await st(page)).activePalace, { timeout: 30_000 }).toBe(palace.id);
  await expect.poll(async () => (await st(page)).presenting, { timeout: 40_000 }).not.toBeNull();
  const targets = (await st(page)).furniture.filter((f) => f.seen).map((f) => f.id);
  await placeN(page, 5, targets, 0, async (i) => {
    if (i === 0) await page.screenshot({ path: 'shots/e2e/imp-2-place.png' });
  });
  await recallN(page, 5, { startReviews: 0 });
  await expect.poll(async () => (await st(page)).proof, { timeout: 40_000 }).toBe(true);
  await page.screenshot({ path: 'shots/e2e/imp-3-summary.png' });
  expect(errors, errors.join('\n')).toEqual([]);
});
