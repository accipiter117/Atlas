// Phase 10 smoke test: the rivals play in a Web Worker. Worker and page give
// exactly the same game (fingerprints), and the page keeps drawing frames
// while the rivals move.

import { test, expect } from '@playwright/test';

test('rivals in a Web Worker: same game as on the page, and the page never freezes', async ({ page }, info) => {
  test.skip(info.project.name !== 'laptop-1366', 'one run is enough');
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?seed=42&faction=rome&debug=1');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.waitForFunction(() => window.__atlasGame);
  expect(await page.evaluate(() => window.__atlasGame.usesWorker)).toBe(true);

  // Play on a while so the rivals have real work to do, then compare worker and page.
  await page.evaluate(() => window.__atlasGame.debug.autoplay(40));
  const check = await page.evaluate(() => window.__atlasGame.debug.workerCheck());
  expect(check.worker).toBe(check.direct);
  expect(check.commands[0]).toBeGreaterThan(0);
  expect(check.commands[1]).toBe(check.commands[0]);

  // End a turn and count animation frames while the rivals move.
  const frames = await page.evaluate(async () => {
    const g = window.__atlasGame;
    let n = 0;
    let on = true;
    const tick = () => { n += 1; if (on) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    const t0 = performance.now();
    document.querySelector('[data-action="next"]').click();
    while (!g.busy && performance.now() - t0 < 2000) await new Promise((r) => setTimeout(r, 0));
    const sawBusy = g.busy;
    while (g.busy) await new Promise((r) => setTimeout(r, 5));
    on = false;
    return { n, sawBusy, ms: performance.now() - t0 };
  });
  if (frames.sawBusy && frames.ms > 200) expect(frames.n).toBeGreaterThan(3);
  expect(errors).toEqual([]);
});
