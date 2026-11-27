// Phase 14 smoke test: a trader lists destinations best first with what each
// end gets; starting a route lays a road and shows in the Trade tab.

import { test, expect } from '@playwright/test';
import { openAttention } from './helpers.js';

test('trade: destinations with yields each way, a road, and the Trade tab', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?seed=42&faction=rome&debug=1');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.waitForFunction(() => window.__atlasGame);
  const panel = page.locator('[data-field="panel"]');

  // Found the capital, then a second city five hexes away (a debug settler founds it on revealed land).
  await page.evaluate(() => window.__atlasGame.debug.reveal());
  await page.locator('[data-action="advice"]').click();
  await page.locator('[data-act="foundCity"]').click();
  await page.locator('[data-action="close-city"]').click();
  const spot = await page.evaluate(() => {
    const g = window.__atlasGame;
    const cap = Object.values(g.state.cities)[0];
    const map = g.state.map;
    const land = (t) => !['ocean', 'coast', 'lake', 'mountain'].includes(map.terrainIds[map.terrain[t]]);
    const [cc, rr] = [cap.tile % map.width, Math.floor(cap.tile / map.width)];
    for (const [dc, dr] of [[5, 0], [-5, 0], [0, 5], [0, -5], [5, 2], [-5, 2], [4, 4], [-4, -4]]) {
      const t = (rr + dr) * map.width + (cc + dc);
      if (t >= 0 && t < map.terrain.length && land(t) && !g.state.owner[t]) return t;
    }
    return -1;
  });
  expect(spot).toBeGreaterThanOrEqual(0);
  const settler = await page.evaluate((t) => window.__atlasGame.debug.spawn('settler', 'f0', t), spot);
  await openAttention(page);
  await page.locator(`.attention-item[data-unit="${settler}"]`).click();
  await page.locator('[data-act="foundCity"]').click();
  await page.locator('[data-action="close-city"]').click();

  // A trader in the capital: its card lists the destinations.
  const trader = await page.evaluate(() => { const g = window.__atlasGame; return g.debug.spawn('trader', 'f0', Object.values(g.state.cities).find((c) => c.capital).tile); });
  await openAttention(page);
  await page.locator(`.attention-item[data-unit="${trader}"]`).click();
  const dests = page.locator('[data-field="destinations"]');
  await expect(dests).toContainText('Trade route to');
  await expect(dests.locator('.trade-dest').first()).toContainText('This city gets');
  await expect(dests.locator('.trade-dest').first()).toContainText('They get');
  await page.screenshot({ path: `test-results/trade-${info.project.name}.png` });
  await dests.locator('.trade-dest').first().click();
  const route = await page.evaluate(() => window.__atlasGame.state.trade.routes[0]);
  expect(route.domain).toBe('land');
  const roads = await page.evaluate((path) => path.map((t) => window.__atlasGame.state.map.road[t]), route.path);
  expect(roads.every((r) => r === 1)).toBe(true);

  // The Trade tab.
  await page.locator('[data-action="empire"]').click();
  await panel.locator('[data-tab="trade"]').click();
  await expect(panel.locator('[data-route]')).toHaveCount(1);
  await expect(panel.locator('[data-route]')).toContainText('turns left');
  expect(await panel.innerText()).not.toContain('undefined');
  expect(errors).toEqual([]);
});
