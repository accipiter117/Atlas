// Killzone Extrasolar War K7: every war work drawn on a world's map (src/render/art/worksArt.js).
import { test, expect } from '@playwright/test';

const WORKS = ['trench', 'wire', 'mg_nest', 'bunker', 'artillery_battery', 'anti_air_battery', 'arc_tower', 'minefield', 'landing_bay', 'supply_depot', 'command_post', 'field_hospital', 'comms_relay'];

test('K7: the war works on the map', async ({ page }, info) => {
  test.skip(info.project.name !== 'laptop-1366', 'the laptop layout');
  test.setTimeout(120_000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?seed=5&debug=1&nosw=1');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.locator('select[name="conversion"]').selectOption('killzone-war');
  await page.locator('[data-tab="players"]').click();
  await page.locator('select[name="faction"]').selectOption('isa');
  await page.locator('[data-action="start-game"]').click();
  await page.waitForFunction(() => window.__atlasGame && !window.__atlasGame.busy, null, { timeout: 60_000 });

  // Dig every work round Fort Tarsus on Halcyon before that world is first drawn.
  const placed = await page.evaluate(async (works) => {
    const sim = await import('/src/sim/index.js');
    const g = window.__atlasGame;
    const st = g.state;
    const w = st.world === 'halcyon' ? st : st.worlds.halcyon;
    const map = w.map;
    const city = Object.values(w.cities)[0];
    const land = (t) => !g.ruleset.terrain[map.terrainIds[map.terrain[t]]]?.water && !g.ruleset.terrain[map.terrainIds[map.terrain[t]]]?.impassable;
    const spots = [...Array(map.terrain.length).keys()].filter((t) => t !== city.tile && land(t) && sim.tileDistance(map, t, city.tile) <= 3)
      .sort((a, b) => sim.tileDistance(map, a, city.tile) - sim.tileDistance(map, b, city.tile) || a - b);
    map.works = { ...(map.works ?? {}) };
    works.forEach((id, k) => {
      const t = spots[k];
      map.works[t] = { faction: city.faction, fired: 0 };
      map.improvement[t] = map.improvementIds.indexOf(id);
    });
    return works.filter((id) => map.improvementIds.includes(id)).length;
  }, WORKS);
  expect(placed).toBe(WORKS.length);
  await page.evaluate(() => {
    const g = window.__atlasGame;
    g.switchWorld('halcyon');
    const c = g.view.cities[0];
    g.mapView.centreOnTile(c.tile);
    g.mapView.setCamera({ ...g.mapView.camera, zoom: 1.2 });
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `test-results/k7-works-${info.project.name}.png` });
  expect(errors).toEqual([]);
});
