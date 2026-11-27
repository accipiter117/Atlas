// Graphics overhaul G8 (docs/OVERHAUL.md 5.3): the full-screen screens. The trees
// draw lines and can be searched and zoomed out; the city screen has tabs, a queue
// with arrows and previous and next city; Empire lists your cities and sorts them;
// Victory charts the score over time; the journal filters; Diplomacy has its meter.

import { test, expect } from '@playwright/test';

test('G8: trees, city screen, Empire cities, Victory chart, journal and diplomacy', async ({ page }, info) => {
  test.skip(info.project.name !== 'laptop-1366', 'the laptop layout');
  test.setTimeout(90_000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?seed=42&faction=rome&debug=1&nosw=1');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.waitForFunction(() => window.__atlasGame && !window.__atlasGame.busy);
  const panel = page.locator('[data-field="panel"]');

  // Trees: lines between prerequisites, search, zoom out.
  await page.locator('#game-map').focus();
  await page.keyboard.press('r');
  await expect(panel.locator('.tree-lines path')).not.toHaveCount(0);
  await panel.locator('input[name="tree-search"]').fill('pott');
  await expect(panel.locator('.tech.match')).toHaveCount(1);
  await expect(panel.locator('.tech.faded')).not.toHaveCount(0);
  await panel.locator('[data-action="tree-zoom"]').click();
  await expect(panel.locator('.tree-scroll')).toHaveClass(/zoomed-out/);
  await page.screenshot({ path: `test-results/g8-tree-${info.project.name}.png` });
  await page.keyboard.press('Escape');

  // Two cities, so the city screen can step between them.
  await page.locator('[data-action="advice"]').click();
  await page.locator('[data-act="foundCity"]').click();
  const cities = await page.evaluate(() => {
    const g = window.__atlasGame;
    g.debug.reveal();
    const c = g.view.cities[0];
    const map = g.view.map;
    const cube = (i) => { const r = Math.floor(i / map.width); const q = (i % map.width) - Math.floor(r / 2); return [q, r, -q - r]; };
    const dist = (a, b) => { const x = cube(a); const y = cube(b); return Math.max(Math.abs(x[0] - y[0]), Math.abs(x[1] - y[1]), Math.abs(x[2] - y[2])); };
    const land = (i) => map.terrain[i] >= 0 && !/ocean|coast|lake|mountain/.test(map.terrainIds[map.terrain[i]]);
    for (const tile of map.terrain.map((_, i) => i).filter((i) => land(i) && dist(i, c.tile) >= 5 && dist(i, c.tile) <= 9 && !g.view.units.some((u) => u.tile === i))) {
      const id = g.debug.spawn('settler', g.human, tile);
      if (g.debug.run({ type: 'foundCity', faction: g.human, unit: id })) break;
    }
    return window.__atlasGame.view.cities.filter((x) => x.faction === g.human).map((x) => x.id);
  });
  expect(cities.length).toBe(2);
  await page.evaluate((id) => window.__atlasGame.openCity(id), cities[0]);
  for (const id of ['warrior', 'settler']) {
    const all = page.getByRole('button', { name: /Show all/ });
    if (await all.count()) await all.click();
    await page.locator(`.choose-item[data-item="${id}"] ~ .queue-add, li:has(.choose-item[data-item="${id}"]) .queue-add`).first().click();
  }
  const q0 = await page.evaluate((id) => window.__atlasGame.view.cities.find((c) => c.id === id).queue.map((x) => x.id), cities[0]);
  await page.locator('[data-queue-up="1"]').click();
  const q1 = await page.evaluate((id) => window.__atlasGame.view.cities.find((c) => c.id === id).queue.map((x) => x.id), cities[0]);
  expect(q1).toEqual([q0[1], q0[0], ...q0.slice(2)]);
  await page.locator('[data-city-tab="buildings"]').click();
  await expect(page.locator('[data-field="buildings"]')).toBeVisible();
  await page.screenshot({ path: `test-results/g8-city-${info.project.name}.png` });
  await page.locator('#game-map').focus();
  await page.keyboard.press(']');
  await expect(page.locator('.city-head h2')).toHaveText(await page.evaluate((id) => window.__atlasGame.view.cities.find((c) => c.id === id).name, cities[1]));
  await expect(page.locator('[data-city-tab="buildings"]')).toHaveAttribute('aria-selected', 'true');

  // Empire: the Cities table, sorted by a click on a heading.
  await page.keyboard.press('e');
  await panel.locator('[data-tab="cities"]').click();
  await expect(panel.locator('[data-field="city-table"] tbody tr')).toHaveCount(2);
  await panel.locator('[data-sort="name"]').click();
  await expect(panel.locator('th[aria-sort="descending"], th[aria-sort="ascending"]')).toHaveCount(1);
  await page.keyboard.press('Escape');

  // A turn later: the Victory chart has two points; the journal filters; the meter shows.
  await page.evaluate(() => { const g = window.__atlasGame; for (const u of g.view.units.filter((x) => x.faction === g.human)) g.debug.run({ type: 'sleep', faction: g.human, unit: u.id }); });
  await page.locator('#game-map').focus();
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.press('Shift+Enter');
  await expect(page.locator('[data-field="turn"]')).toHaveText('Turn 2', { timeout: 30_000 });
  await page.waitForFunction(() => !window.__atlasGame.busy);
  await page.locator('#game-map').focus();
  await page.keyboard.press('v');
  await expect(panel.locator('[data-field="score-chart"] polyline')).not.toHaveCount(0);
  await page.screenshot({ path: `test-results/g8-victory-${info.project.name}.png` });
  await page.keyboard.press('Escape');
  await page.keyboard.press('j');
  await panel.locator('select[name="journal-planner"]').selectOption('research');
  await expect(panel.locator('select[name="journal-planner"]')).toHaveValue('research');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__atlasGame.debug.meetAll());
  await page.keyboard.press('d');
  await panel.locator('.dip-leader').first().click();
  await expect(panel.locator('[data-field="opinion-meter"]')).toBeVisible();
  expect(errors).toEqual([]);
});
