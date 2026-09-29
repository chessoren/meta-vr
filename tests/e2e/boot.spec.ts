import { test, expect } from '@playwright/test';

test('boots into emulated AR and sees the room furniture', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto('/app/?emu=living_room');
  await page.locator('#enter').click({ timeout: 60_000 });
  await expect.poll(async () => page.evaluate(() => (window as any).__scene?.().meshes.length ?? 0), { timeout: 30_000 }).toBeGreaterThan(0);
  const scene = await page.evaluate(() => (window as any).__scene());
  console.log(JSON.stringify(scene));
  await page.screenshot({ path: 'test-results/boot.png' });
  console.log(logs.slice(-15).join('\n'));
});
