// Mouse controls (after Matthew's report): a left click on empty ground lets go of the
// selected unit; a left click on another leader's unit keeps its card (and Declare war)
// in the panel while the mouse moves to it; right-click on a rival's unit or city opens
// a menu to talk, propose a deal or declare war; the browser's own menu never appears.

import { test, expect } from '@playwright/test';

async function screenPoint(page, tile) {
  const box = await page.locator('#game-map canvas').boundingBox();
  const p = await page.evaluate((t) => { const v = window.__atlasGame.mapView; v.centreOnTile(t); v.drawNow(); return v.tileToScreen(t); }, tile);
  return { x: box.x + p.x, y: box.y + p.y };
}

test('left-click lets go, war can be declared from the panel and from a right-click menu', async ({ page }, info) => {
  test.skip(Boolean(info.project.use.hasTouch), 'mouse controls');
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?seed=42&faction=rome&debug=1&nosw=1');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.waitForFunction(() => window.__atlasGame && !window.__atlasGame.busy);

  // Two rival soldiers next to our warrior, from two factions we have met.
  const s = await page.evaluate(() => {
    const g = window.__atlasGame;
    g.debug.meetAll();
    const w = g.view.units.find((u) => u.faction === g.human && u.type === 'warrior');
    const map = g.view.map;
    const r = Math.floor(w.tile / map.width);
    const c = w.tile - r * map.width;
    const near = [[c + 1, r], [c - 1, r], [c, r - 1], [c, r + 1], [c + (r % 2 ? 1 : -1), r - 1], [c + (r % 2 ? 1 : -1), r + 1]].map(([cc, rr]) => rr * map.width + cc)
      .filter((t) => map.terrain[t] >= 0 && !/ocean|coast|lake|mountain/.test(map.terrainIds[map.terrain[t]]) && !g.view.units.some((u) => u.tile === t) && g.view.fog[t] === 2);
    const rivals = g.view.factions.filter((f) => f.id !== g.human).map((f) => f.id);
    g.debug.spawn('warrior', rivals[0], near[0]);
    g.debug.spawn('warrior', rivals[1], near[1]);
    return { warrior: w.id, a: near[0], b: near[1], rivals };
  });

  // Select our warrior, then left-click the first rival: the panel offers Declare war.
  await page.evaluate((id) => { const g = window.__atlasGame; g.mapView.centreOnTile(g.view.units.find((u) => u.id === id).tile); }, s.warrior);
  const wpt = await screenPoint(page, await page.evaluate((id) => window.__atlasGame.view.units.find((u) => u.id === id).tile, s.warrior));
  await page.mouse.click(wpt.x, wpt.y);
  await expect(page.locator('.unit-card h2')).toHaveText('Warrior');
  const apt = await screenPoint(page, s.a);
  await page.mouse.click(apt.x, apt.y);
  const declare = page.locator('[data-action="declare-war"]');
  await expect(declare).toBeVisible();
  // Moving the mouse across the map to the panel keeps it there.
  await page.mouse.move(apt.x + 300, apt.y + 150, { steps: 12 });
  await expect(declare).toBeVisible();
  await declare.click();
  expect(await page.evaluate((f) => (window.__atlasGame.state.wars ?? []).some((k) => k.split('|').includes(f)), s.rivals[0])).toBe(true);

  // A left click on empty ground lets go of the warrior.
  const empty = await page.evaluate(() => {
    const g = window.__atlasGame;
    return g.view.fog.findIndex((f, i) => f === 2 && !g.view.units.some((u) => u.tile === i) && !g.view.cities.some((c) => c.tile === i));
  });
  const ept = await screenPoint(page, empty);
  await page.mouse.click(ept.x, ept.y);
  expect(await page.evaluate(() => window.__atlasGame.mapView.stats.selected)).toBeNull();

  // Right-click the second rival: a menu to talk, propose a deal or declare war (and no browser menu).
  const bpt = await screenPoint(page, s.b);
  await page.mouse.click(bpt.x, bpt.y, { button: 'right' });
  const menu = page.locator('[data-field="map-menu"]');
  await expect(menu).toBeVisible();
  await expect(menu.locator('[data-map-action="diplomacy"]')).toBeVisible();
  await expect(menu.locator('[data-map-action="deal"]')).toBeVisible();
  await page.screenshot({ path: `test-results/controls-menu-${info.project.name}.png` });
  await menu.locator('[data-map-action="declare-war"]').click();
  await expect(menu).toBeHidden();
  expect(await page.evaluate((f) => (window.__atlasGame.state.wars ?? []).some((k) => k.split('|').includes(f)), s.rivals[1])).toBe(true);

  // Right-click a rival again and choose Talk: Diplomacy opens on them.
  const apt2 = await screenPoint(page, s.a);
  await page.mouse.click(apt2.x, apt2.y, { button: 'right' });
  await menu.locator('[data-map-action="diplomacy"]').click();
  await expect(page.locator('[data-field="panel"] .dip-detail')).toBeVisible();
  expect(errors).toEqual([]);
});
