// Phase 7 smoke test: point at an enemy to see the odds, attack it, read the
// battle report, and pick a promotion. Uses the ?debug=1 developer hook to
// put a raider next to your warrior.

import { test, expect } from '@playwright/test';
import { openAttention } from './helpers.js';

async function pointOf(page, tile) {
  const box = await page.locator('#game-map canvas').boundingBox();
  const p = await page.evaluate((target) => {
    const mv = window.__atlasGame.mapView;
    mv.centreOnTile(target);
    const { w, h } = mv.viewport();
    let best = null;
    for (let sy = 0; sy < h; sy += 3) for (let sx = 0; sx < w; sx += 3) {
      if (mv.tileAt(sx, sy) !== target) continue;
      const d = (sx - w / 2) ** 2 + (sy - h / 2) ** 2;
      if (!best || d < best.d) best = { sx, sy, d };
    }
    return best;
  }, tile);
  return { x: box.x + p.sx, y: box.y + p.sy };
}

test('odds before attacking, a battle report, and a promotion', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?seed=42&faction=rome&debug=1');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.waitForFunction(() => window.__atlasGame?.debug);
  const touch = Boolean(info.project.use.hasTouch);

  // Put a raider warrior on open land next to our warrior, and give ours enough experience for a promotion.
  const setup = await page.evaluate(() => {
    const g = window.__atlasGame;
    const w = g.view.units.find((u) => u.faction === 'f0' && u.type === 'warrior');
    const map = g.view.map;
    const width = map.width;
    const r = Math.floor(w.tile / width);
    const c = w.tile - r * width;
    const around = [[c + 1, r], [c - 1, r], [c, r - 1], [c, r + 1], [c + (r % 2 ? 1 : -1), r - 1], [c + (r % 2 ? 1 : -1), r + 1]];
    const ok = (t) => map.terrain[t] >= 0 && !['ocean', 'coast', 'lake', 'mountain'].includes(map.terrainIds[map.terrain[t]])
      && !g.view.units.some((u) => u.tile === t) && !g.view.cities.some((x) => x.tile === t) && g.view.fog[t] === 2;
    const spot = around.map(([cc, rr]) => rr * width + cc).find(ok);
    const raider = g.debug.spawn('warrior', 'raiders', spot);
    g.debug.setXp(w.id, 13);
    return { warrior: w.id, spot, raider };
  });
  expect(setup.spot).toBeGreaterThanOrEqual(0);
  await openAttention(page);
  await page.locator(`.attention-item[data-unit="${setup.warrior}"]`).click();
  await expect(page.locator('.unit-card h2')).toHaveText('Warrior');

  // Point (mouse) or first tap (touch): the odds appear.
  const pt = await pointOf(page, setup.spot);
  const rngBefore = await page.evaluate(() => window.__atlasGame.state.rng);
  if (touch) await page.touchscreen.tap(pt.x, pt.y); else await page.mouse.move(pt.x, pt.y);
  const odds = page.locator('[data-field="odds"]');
  await expect(odds).toContainText('Win chance');
  await expect(odds).toContainText('You lose about');
  await expect(odds).toContainText('They lose about');
  // An empty entry must never show up as the word "null" in the panel.
  await expect(page.locator('.unit-panel')).not.toContainText('null');
  await page.screenshot({ path: `test-results/odds-${info.project.name}.png` });
  // Looking at the odds never rolls the game's dice.
  expect(await page.evaluate(() => window.__atlasGame.state.rng)).toBe(rngBefore);

  // Attack: click (mouse) or tap again (touch). A report appears and the raider is hurt.
  if (touch) await page.touchscreen.tap(pt.x, pt.y); else await page.mouse.click(pt.x, pt.y, { button: 'right' });
  await expect(page.locator('[data-toast]')).toContainText('attacked');
  const after = await page.evaluate((id) => window.__atlasGame.state.units[id]?.hp ?? 0, setup.raider);
  expect(after).toBeLessThan(100);

  // 13 + 5 experience passes 15: pick a promotion from the short list.
  await openAttention(page);
  await page.locator(`.attention-item:has-text("can be promoted")`).click();
  const choices = page.locator('[data-field="promote"] [data-promotion]');
  await expect(choices).toHaveCount(2);
  await choices.first().click();
  expect((await page.evaluate((id) => window.__atlasGame.state.units[id].promotions, setup.warrior)).length).toBe(1);
  await page.screenshot({ path: `test-results/promoted-${info.project.name}.png` });
  expect(errors).toEqual([]);
});
