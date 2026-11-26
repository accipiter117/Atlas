// Phase 5 smoke test: found a city with B, read the drawer, change focus,
// lock a tile by clicking it, follow the advice line, build a unit.

import { test, expect } from '@playwright/test';

async function startGame(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?seed=42&faction=rome');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.waitForFunction(() => window.__atlasGame);
  return errors;
}

async function pointOf(page, tile) {
  const box = await page.locator('#game-map canvas').boundingBox();
  const p = await page.evaluate((target) => {
    const mv = window.__atlasGame.mapView;
    const { w, h } = mv.viewport();
    let best = null;
    for (let sy = 0; sy < h; sy += 3) for (let sx = 0; sx < w; sx += 3) {
      if (mv.tileAt(sx, sy) !== target) continue;
      // Prefer a point low in the hex, clear of icons drawn near the centre.
      if (!best || sy > best.sy) best = { sx, sy };
    }
    return best && { sx: best.sx, sy: best.sy - 10 };
  }, tile);
  return { x: box.x + p.sx, y: box.y + p.sy };
}

const city = (page) => page.evaluate(() => window.__atlasGame.view.cities.find((c) => c.faction === 'f0'));

test('found a city, read the drawer, focus, lock a tile, follow the advice', async ({ page }, info) => {
  const errors = await startGame(page);
  const touch = Boolean(info.project.use.hasTouch);
  const tap = async (pt) => (touch ? page.touchscreen.tap(pt.x, pt.y) : page.mouse.click(pt.x, pt.y));

  // The advice line says to found a city; Do it selects the settler.
  await expect(page.locator('[data-field="advice"]')).toContainText('Found your first city');
  await page.locator('[data-action="advice"]').click();
  await expect(page.locator('.unit-card h2')).toHaveText('Settler');

  // Found it (B on a keyboard, the button on touch).
  if (touch) await page.locator('[data-act="foundCity"]').click();
  else { await page.locator('#game-map').focus(); await page.keyboard.press('b'); }
  await expect(page.locator('[data-toast]')).toContainText('founded');
  const c = await city(page);
  expect(c.name.length).toBeGreaterThan(0);
  const owned = await page.evaluate((id) => window.__atlasGame.view.map.owner.filter((o) => o === id).length, c.id);
  expect(owned).toBe(7);

  // The drawer: food with turns to grow, production, a ranked list with reasons.
  await expect(page.locator('.city-head h2')).toHaveText(c.name);
  await expect(page.locator('.city-yields .food')).toContainText(/grows in \d+ turns/);
  await expect(page.locator('.choose-item').first().locator('.reason')).not.toBeEmpty();
  // An empty entry must never show up as the word "null" in the panel.
  await expect(page.locator('.unit-panel')).not.toContainText('null');
  await page.screenshot({ path: `test-results/city-drawer-${info.project.name}.png` });

  // The advice now says to choose production; Do it opens this city.
  await expect(page.locator('[data-field="advice"]')).toContainText('nothing to build');
  await expect(page.locator('[data-action="next"]')).toHaveText('Choose production');
  await page.locator('[data-action="close-city"]').click();
  await page.locator('[data-action="advice"]').click();
  await expect(page.locator('.city-head h2')).toHaveText(c.name);

  // Focus: Production never gives less production than Food.
  const prodOf = () => page.evaluate(() => {
    const g = window.__atlasGame;
    const cc = g.view.cities.find((x) => x.faction === 'f0');
    return cc.worked.map((t) => g.view.map.hills[t] + (g.view.map.feature[t] >= 0 ? 1 : 0));
  });
  await page.locator('[data-focus="food"]').click();
  const food = await prodOf();
  await page.locator('[data-focus="production"]').click();
  await expect(page.locator('[data-focus="production"]')).toHaveAttribute('aria-pressed', 'true');
  const prod = await prodOf();
  expect(prod.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(food.reduce((a, b) => a + b, 0));

  // Lock a citizen by clicking one of the city's tiles that is not worked.
  const target = await page.evaluate(() => {
    const g = window.__atlasGame;
    const cc = g.view.cities.find((x) => x.faction === 'f0');
    const mountain = g.view.map.terrainIds.indexOf('mountain');
    return g.view.map.owner.findIndex((o, i) => o === cc.id && i !== cc.tile && !cc.worked.includes(i) && g.view.map.terrain[i] !== mountain
      && !g.view.units.some((u) => u.tile === i));
  });
  await tap(await pointOf(page, target));
  const after = await city(page);
  expect(after.locks).toEqual([target]);
  expect(after.worked).toContain(target);
  await page.screenshot({ path: `test-results/city-lock-${info.project.name}.png` });

  // Choose a warrior; it appears after enough turns.
  if (!(await page.locator('.choose-item[data-item="warrior"]').count())) await page.getByRole('button', { name: /Show all/ }).click();
  await page.locator('.choose-item[data-item="warrior"]').click();
  await expect(page.locator('[data-field="building"]')).toContainText('Warrior');
  const warriors = () => page.evaluate(() => window.__atlasGame.view.units.filter((u) => u.faction === 'f0' && u.type === 'warrior').length);
  const before = await warriors();
  for (let k = 0; k < 20 && (await warriors()) === before; k += 1) {
    // Put idle units to sleep so the Next button ends the turn.
    while (await page.locator('[data-action="next"]').textContent() !== 'Next turn') {
      const label = await page.locator('[data-action="next"]').textContent();
      if (label === 'Choose production') { await page.locator('.choose-item').first().click(); continue; }
      await page.locator('[data-action="next"]').click();
      await page.locator('[data-act="sleep"]').click();
    }
    await page.locator('[data-action="next"]').click();
  }
  expect(await warriors()).toBe(before + 1);
  expect(errors).toEqual([]);
});
