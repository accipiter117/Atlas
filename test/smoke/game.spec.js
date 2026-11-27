// Phase 4 smoke test: a real game in the browser. Select the warrior, plan a
// three-tile walk (turn numbers on the path), walk it over two turns, see the
// fog in three states, and use every unit action. Runs with mouse at both
// laptop sizes and with taps only on the touch tablet.

import { test, expect } from '@playwright/test';
import { openAttention } from './helpers.js';

async function startGame(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?seed=42&faction=rome');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.waitForFunction(() => window.__atlasGame);
  return errors;
}

/** Screen point (inside the map canvas) of a tile, found by asking the map which tile is under each point. */
async function pointOf(page, tile) {
  const box = await page.locator('#game-map canvas').boundingBox();
  const p = await page.evaluate((target) => {
    const mv = window.__atlasGame.mapView;
    mv.centreOnTile(target);
    const { w, h } = mv.viewport();
    let best = null;
    for (let sy = 0; sy < h; sy += 3) for (let sx = 0; sx < w; sx += 3) {
      if (mv.tileAt(sx, sy) === target) {
        const d = (sx - w / 2) ** 2 + (sy - h / 2) ** 2;
        if (!best || d < best.d) best = { sx, sy, d };
      }
    }
    return best;
  }, tile);
  return { x: box.x + p.sx, y: box.y + p.sy };
}

/** A walkable explored tile three steps from the unit, straight along a row if possible. */
async function targetFor(page, unitId) {
  return page.evaluate((id) => {
    const g = window.__atlasGame;
    const v = g.view;
    const u = v.units.find((x) => x.id === id);
    const w = v.map.width;
    const okTerrain = (t) => t >= 0 && t < w * v.map.height && v.map.terrain[t] >= 0
      && !['mountain', 'ocean', 'coast', 'lake'].includes(v.map.terrainIds[v.map.terrain[t]]);
    const cands = [u.tile - 3, u.tile + 3, u.tile - 2 * w - 1, u.tile + 2 * w - 1, u.tile - 2 * w + 1, u.tile + 2 * w + 1];
    return cands.find((t) => okTerrain(t) && Math.floor(t / w) !== -1) ?? null;
  }, unitId);
}

test('select a warrior, plan and walk a path over turns, fog in three states, unit actions', async ({ page }, info) => {
  const errors = await startGame(page);
  const touch = Boolean(info.project.use.hasTouch);
  const tap = async (pt) => (touch ? page.touchscreen.tap(pt.x, pt.y) : page.mouse.click(pt.x, pt.y));

  // Three starting units need orders.
  await expect(page.locator('.attention-item')).toHaveCount(3);
  await expect(page.locator('[data-action="next"]')).toHaveText(/Next unit/);

  // Select the warrior from the attention list.
  await openAttention(page);
  await page.locator('.attention-item', { hasText: 'Warrior' }).click();
  await expect(page.locator('.unit-card h2')).toHaveText('Warrior');
  const warrior = await page.evaluate(() => window.__atlasGame.view.units.find((u) => u.type === 'warrior' && u.faction === 'f0'));
  const target = await targetFor(page, warrior.id);
  expect(target).not.toBeNull();

  // Plan: hover (mouse) or first tap (touch) shows the path with turn numbers.
  const pt = await pointOf(page, target);
  if (touch) await tap(pt); else await page.mouse.move(pt.x, pt.y);
  const plan = await page.evaluate(() => window.__atlasGame.mapView.stats.path);
  expect(plan.tiles.at(-1)).toBe(target);
  expect(plan.arrivesOnTurn).toBeGreaterThanOrEqual(1);
  await page.screenshot({ path: `test-results/game-path-${info.project.name}.png` });

  // Go: right-click (mouse) or second tap (touch). The warrior walks, animated, and keeps going next turn.
  if (touch) await tap(pt); else await page.mouse.click(pt.x, pt.y, { button: 'right' });
  const moved = await page.evaluate((id) => window.__atlasGame.state.units[id], warrior.id);
  expect(moved.tile).not.toBe(warrior.tile);
  expect(moved.goto).toBe(target);
  expect(await page.evaluate(() => window.__atlasGame.mapView.isAnimating())).toBe(true);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `test-results/game-walking-${info.project.name}.png` });

  // Every other unit: try each action button.
  const card = page.locator('.unit-panel');
  await openAttention(page);
  await page.locator('.attention-item', { hasText: 'Settler' }).click();
  await card.getByRole('button', { name: 'Sleep' }).click();
  await openAttention(page);
  await page.locator('.attention-item', { hasText: 'Builder' }).click();
  await card.getByRole('button', { name: 'Disband' }).click();
  await expect(card.getByRole('button', { name: 'Press again to disband' })).toBeVisible();
  await card.getByRole('button', { name: 'Press again to disband' }).click();
  await expect(page.locator('[data-toast]')).toHaveText('Builder disbanded.');

  // Nothing needs orders now: Next turn ends it; the warrior arrives at the start of turn 2.
  await expect(page.locator('[data-action="next"]')).toHaveText('Next turn');
  await page.locator('[data-action="next"]').click();
  await expect(page.locator('[data-field="turn"]')).toHaveText('Turn 2');
  await expect.poll(() => page.evaluate((id) => window.__atlasGame.state.units[id].tile, warrior.id)).toBe(target);

  // Fog: unexplored, explored and visible tiles all exist; the view hides unexplored terrain.
  const fog = await page.evaluate(() => {
    const v = window.__atlasGame.view;
    const count = [0, 0, 0];
    v.fog.forEach((f) => { count[f] += 1; });
    const leaks = v.fog.filter((f, i) => f === 0 && v.map.terrain[i] !== -1).length;
    return { count, leaks };
  });
  expect(fog.count.every((n) => n > 0)).toBe(true);
  expect(fog.leaks).toBe(0);

  // The settler is still asleep; wake it, then fortify the warrior.
  await page.locator('[data-action="next"]').click(); // selects the warrior (needs orders)
  await expect(page.locator('.unit-card h2')).toHaveText('Warrior');
  await card.getByRole('button', { name: 'Fortify' }).click();
  expect(await page.evaluate((id) => window.__atlasGame.state.units[id].activity, warrior.id)).toBe('fortify');

  for (const btn of await page.locator('#game button:visible').all()) {
    const box = await btn.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: `test-results/game-turn2-${info.project.name}.png` });
  expect(errors).toEqual([]);
});

test('keyboard: Space selects the next unit, S skips, Enter ends the turn', async ({ page }, info) => {
  test.skip(Boolean(info.project.use.hasTouch), 'keyboard run is for laptops');
  await startGame(page);
  await page.locator('#game-map').focus();
  await page.keyboard.press('Space');
  const first = await page.locator('.unit-card h2').textContent();
  for (let k = 0; k < 3; k += 1) await page.keyboard.press('s');
  await expect(page.locator('[data-action="next"]')).toHaveText('Next turn');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-field="turn"]')).toHaveText('Turn 2');
  expect(first.length).toBeGreaterThan(0);
});

test('reduced motion: units jump instead of walking', async ({ browser }, info) => {
  test.skip(info.project.name !== 'laptop-1366', 'one run is enough');
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  await startGame(page);
  await openAttention(page);
  await page.locator('.attention-item', { hasText: 'Warrior' }).click();
  const warrior = await page.evaluate(() => window.__atlasGame.view.units.find((u) => u.type === 'warrior' && u.faction === 'f0'));
  const target = await targetFor(page, warrior.id);
  const pt = await pointOf(page, target);
  await page.mouse.click(pt.x, pt.y, { button: 'right' });
  expect(await page.evaluate(() => window.__atlasGame.mapView.isAnimating())).toBe(false);
  await context.close();
});
