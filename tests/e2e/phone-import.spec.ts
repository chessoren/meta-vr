import { test, expect, type Page } from '@playwright/test';

/**
 * Phone companion, end to end (offline engine, no API key needed):
 * headset pairs → phone types the code → pastes a course → reviews (edit + delete) → sends → headset downloads.
 * Screens are captured at iPhone size into test-results/phone-*.png.
 */

const COURSE = `Cell biology — essentials

Mitochondria: the powerhouse of the cell
Ribosome – site of protein synthesis
DNA = deoxyribonucleic acid
1665: Robert Hooke first describes cells
Photosynthesis takes place in the chloroplasts.
A human cell contains 46 chromosomes.
Who discovered penicillin in 1928? Alexander Fleming
`;

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

const shot = (page: Page, name: string, fullPage = false) => page.screenshot({ path: `test-results/phone-${name}.png`, fullPage });

test('phone import: paste → review → edit → delete → send → headset receives the palace', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  // the headset opens a pairing slot
  const pair = await (await page.request.post('/api/pair')).json();
  expect(pair.code).toMatch(/^[A-Z]{4}$/);

  // 1. code screen (typed code)
  await page.goto('/import/?offline=1');
  await expect(page.getByRole('heading', { name: 'Enter the code shown in your headset' })).toBeVisible();
  await page.waitForTimeout(300);
  await shot(page, 'code');
  await page.locator('#code').fill(pair.code.toLowerCase());
  await page.locator('#connect').click();

  // 2. connected → choose a source
  await expect(page.getByRole('heading', { name: 'Bring your course' })).toBeVisible();
  await expect(page.getByText('Connected to your headset ✨').first()).toBeVisible();
  await expect(page.locator('.code-chip')).toHaveText(pair.code);
  expect((await (await page.request.get(`/api/palace?code=${pair.code}&secret=${pair.secret}`)).json()).status).toBe('importing');
  await page.waitForTimeout(400);
  await shot(page, 'source');

  await page.locator('[data-source="text"]').click();
  await page.locator('#paste').fill(COURSE);
  await page.locator('.details summary').click();
  await page.locator('#title').fill('Cell biology');
  await page.locator('#exam').fill('2026-12-15');
  await page.locator('#paste').focus();
  await shot(page, 'paste');

  // 3. building (hold the response a moment so the screen is visible)
  await page.route('**/api/extract', async (route) => {
    const res = await route.fetch();
    await new Promise((r) => setTimeout(r, 1800));
    await route.fulfill({ response: res });
  });
  await page.locator('#build').click();
  await expect(page.getByRole('heading', { name: 'Building your palace…' })).toBeVisible();
  await page.waitForTimeout(900);
  await shot(page, 'building');

  // 4. review
  await expect(page.locator('.card').first()).toBeVisible({ timeout: 20_000 });
  const cards = page.locator('.cards > .card');
  const n = await cards.count();
  expect(n).toBeGreaterThanOrEqual(6);
  await expect(page.locator('.badge')).toHaveText(`${n}/20`);
  await expect(page.locator('.palace-title')).toHaveText('Cell biology');
  await expect(page.locator('.alert-warn')).toContainText(/offline/i);
  await expect(page.locator('.card .caption .hook').first()).toBeVisible();
  await page.waitForTimeout(500);
  await shot(page, 'review');
  await shot(page, 'review-full', true);

  // a refresh keeps the draft
  await page.reload();
  await expect(page.locator('.cards > .card')).toHaveCount(n);

  // edit the first notion's answer
  const first = cards.first();
  const firstQuestion = (await first.locator('.q').textContent())!;
  await first.locator('button.edit').click();
  await expect(page.locator('.card.editing')).toBeVisible();
  await page.locator('.card.editing .edit-a').fill('The cell’s power plant');
  await shot(page, 'edit');
  await page.locator('.card.editing .save').click();
  await expect(cards.first().locator('.a')).toHaveText('The cell’s power plant');

  // delete the second notion
  const deletedQuestion = (await cards.nth(1).locator('.q').textContent())!;
  await cards.nth(1).locator('button.delete').click();
  await expect(cards).toHaveCount(n - 1);
  await expect(page.locator('.badge')).toHaveText(`${n - 1}/20`);
  await expect(page.locator('#toast')).toContainText('Notion removed');

  // 5. send
  await page.locator('#send').click();
  await expect(page.getByRole('heading', { name: 'Look up — your palace is arriving' })).toBeVisible();
  await page.waitForTimeout(600);
  await shot(page, 'done');

  // 6. the headset downloads it with its secret
  const got = await (await page.request.get(`/api/palace?code=${pair.code}&secret=${pair.secret}`)).json();
  expect(got.status).toBe('ready');
  expect(got.palace.title).toBe('Cell biology');
  expect(got.palace.examDate).toBe('2026-12-15');
  expect(got.palace.lang).toBe('en');
  expect(got.palace.notions).toHaveLength(n - 1);
  const edited = got.palace.notions.find((x: { question: string }) => x.question === firstQuestion);
  expect(edited.answer).toBe('The cell’s power plant');
  expect(edited.distractors).toHaveLength(2);
  expect(got.palace.notions.some((x: { question: string }) => x.question === deletedQuestion)).toBe(false);
  // a second fetch still works (re-fetch window), marked consumed
  expect((await (await page.request.get(`/api/palace?code=${pair.code}&secret=${pair.secret}`)).json()).status).toBe('consumed');

  expect(errors).toEqual([]);
});

test('phone import: unknown code, error states', async ({ page }) => {
  await page.goto('/import/?c=ZZZZ');
  await expect(page.getByRole('alert')).toContainText(`We can't find "ZZZZ"`);
  await page.waitForTimeout(300);
  await shot(page, 'expired');

  // text too short: the build button stays disabled; AI-less photo import explains itself
  const pair = await (await page.request.post('/api/pair')).json();
  await page.goto(`/import/?c=${pair.code}&offline=1`);
  await page.locator('[data-source="text"]').click();
  await page.locator('#paste').fill('hi');
  await expect(page.locator('#build')).toBeDisabled();
  await page.locator('#paste').fill('hello there, how are you doing today my friend');
  await page.locator('#build').click();
  await expect(page.getByRole('alert')).toContainText(/No clear facts found/);
});
