// Graphics overhaul G6 (docs/OVERHAUL.md 4.6): animations are presentation only.
// The same game played through the same turns, once with every animation in full
// and once with them all off (and motion reduced), ends with exactly the same
// game: the fingerprints match. Along the way the turn ribbon shows.

import { test, expect } from '@playwright/test';

async function playThreeTurns(page, settings) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript((s) => {
    localStorage.setItem('atlas:settings', JSON.stringify(s));
  }, settings);
  await page.goto('/?seed=42&faction=rome&debug=1&nosw=1');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.waitForFunction(() => window.__atlasGame && !window.__atlasGame.busy);
  // Everyone sleeps, so Next ends the turn each time.
  await page.evaluate(() => {
    const g = window.__atlasGame;
    for (const u of g.view.units.filter((x) => x.faction === g.human)) g.debug.run({ type: 'sleep', faction: g.human, unit: u.id });
  });
  for (let turn = 2; turn <= 4; turn += 1) {
    await page.locator('[data-action="next"]').click();
    await expect(page.locator('[data-field="turn"]')).toHaveText(`Turn ${turn}`, { timeout: 30_000 });
    await page.waitForFunction(() => !window.__atlasGame.busy);
  }
  expect(errors).toEqual([]);
  return page.evaluate(() => window.__atlasGame.fingerprint());
}

test('G6: animations never change the game', async ({ browser }, info) => {
  test.skip(info.project.name !== 'laptop-1366', 'one run is enough');
  test.setTimeout(120_000);
  const full = await browser.newPage();
  const fp1 = await playThreeTurns(full, { animSpeed: 'normal', rivalMoves: 'full', combatCamera: true, motion: 'full' });
  await expect(full.locator('[data-field="turn-ribbon"]')).toHaveText('Turn 4');
  await full.screenshot({ path: `test-results/g6-full-${info.project.name}.png` });
  const none = await browser.newPage();
  const fp2 = await playThreeTurns(none, { animSpeed: 'instant', rivalMoves: 'off', combatCamera: false, motion: 'reduce' });
  expect(fp1).toBe(fp2);
  await full.close();
  await none.close();
});

test('G6: an attack plays a lunge, an impact flash and damage numbers', async ({ page }, info) => {
  test.skip(info.project.name !== 'laptop-1366', 'one run is enough');
  await page.addInitScript(() => localStorage.setItem('atlas:settings', JSON.stringify({ motion: 'full', animSpeed: 'normal' })));
  await page.goto('/?seed=42&faction=rome&debug=1&nosw=1');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.waitForFunction(() => window.__atlasGame?.debug && !window.__atlasGame.busy);
  const before = await page.evaluate(() => {
    const g = window.__atlasGame;
    const w = g.view.units.find((u) => u.faction === g.human && u.type === 'warrior');
    const map = g.view.map;
    const spot = g.mapView && [0, 1, 2, 3, 4, 5].map((d) => {
      const r = Math.floor(w.tile / map.width);
      const c = w.tile - r * map.width;
      const cc = [c + 1, c - 1, c, c, c + (r % 2 ? 1 : -1), c + (r % 2 ? 1 : -1)][d];
      const rr = [r, r, r - 1, r + 1, r - 1, r + 1][d];
      return rr * map.width + cc;
    }).find((t) => map.terrain[t] >= 0 && !['ocean', 'coast', 'lake', 'mountain'].includes(map.terrainIds[map.terrain[t]]) && !g.view.units.some((u) => u.tile === t) && g.view.fog[t] === 2);
    g.debug.spawn('warrior', 'raiders', spot);
    const fp = g.fingerprint();
    g.debug.run({ type: 'attack', faction: g.human, unit: w.id, target: spot });
    return { fp, spot };
  });
  // The attack went through the game's rules; the map is now playing its effects.
  expect(await page.evaluate(() => window.__atlasGame.mapView.isAnimating())).toBe(true);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `test-results/g6-attack-${info.project.name}.png` });
  await expect.poll(() => page.evaluate(() => window.__atlasGame.mapView.isAnimating()), { timeout: 5000 }).toBe(false);
  expect(await page.evaluate(() => window.__atlasGame.fingerprint())).not.toBe(before.fp);
});
