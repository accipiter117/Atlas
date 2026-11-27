// Graphics overhaul G2 (docs/OVERHAUL.md section 3): the full-screen map with
// floating panels. The panels sit where the plan puts them and never overlap
// at 1366x768, every yield has an icon, the progress widget opens the tree,
// notifications dismiss with a right-click, the minimap moves the camera,
// the map toggles work, hexes have hover tooltips, the selected unit is kept
// clear of the panels, and Escape closes the Help sheet.

import { test, expect } from '@playwright/test';

const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test('G2: the floating HUD over a full-screen map', async ({ page }, info) => {
  test.skip(Boolean(info.project.use.hasTouch), 'the laptop HUD (the phone layout is frozen)');
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?seed=42&faction=rome&nosw=1');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.waitForFunction(() => window.__atlasGame);
  const vp = page.viewportSize();

  // The map fills the window; the bar is 44px; the panels sit in their corners without overlapping.
  const map = await page.locator('#game-map').boundingBox();
  expect(map).toEqual({ x: 0, y: 0, width: vp.width, height: vp.height });
  const box = async (sel) => page.locator(sel).boundingBox();
  const bar = await box('.game-bar');
  expect(Math.round(bar.height)).toBe(44);
  const parts = { bar, progress: await box('.hud-progress'), notes: await box('.attention'), panel: await box('.unit-panel'), endturn: await box('.hud-endturn'), minimap: await box('.hud-minimap') };
  expect(parts.progress.x).toBeLessThan(vp.width / 4);
  expect(parts.notes.x + parts.notes.width).toBeGreaterThan(vp.width * 0.9);
  expect(parts.panel.y + parts.panel.height).toBeGreaterThan(vp.height - 20);
  expect(parts.minimap.x + parts.minimap.width).toBeGreaterThan(vp.width - 20);
  expect(parts.endturn.x + parts.endturn.width).toBeLessThanOrEqual(parts.minimap.x);
  const names = Object.keys(parts);
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) expect(overlap(parts[names[i]], parts[names[j]]), `${names[i]} overlaps ${names[j]}`).toBe(false);
  }

  // Every yield in the bar has its icon; the screen buttons are icons with names.
  for (const y of ['food', 'production', 'gold', 'science', 'culture', 'faith']) await expect(page.locator(`.game-yields .y.${y} svg.icon`)).toHaveCount(1);
  for (const name of ['Empire', 'Diplomacy', 'Victory', 'AI journal', 'Help']) await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  // No underlined links anywhere in the HUD.
  const underlined = await page.evaluate(() => [...document.querySelectorAll('#game *')].filter((n) => getComputedStyle(n).textDecorationLine.includes('underline')).length);
  expect(underlined).toBe(0);

  // The selected unit is in the clear part of the map, not under a panel.
  const unit = await page.evaluate(() => window.__atlasGame.view.units.find((u) => u.id === window.__atlasGame.mapView.stats.selected));
  expect(unit).toBeTruthy();
  expect(await page.evaluate((t) => window.__atlasGame.mapView.isClear(t), unit.tile)).toBe(true);

  // Hovering a hex shows what it is.
  const at = await page.evaluate((t) => window.__atlasGame.mapView.tileToScreen(t), unit.tile);
  const expected = await page.evaluate((t) => window.__atlasGame.hexTooltip(t), unit.tile);
  await page.mouse.move(at.x + 2, at.y + 2);
  const tip = page.locator('.tooltip');
  await expect(tip).toBeVisible();
  await expect(tip.locator('.tooltip-title')).toHaveText(expected.title);
  await expect(tip).toContainText('yours');
  await page.screenshot({ path: `test-results/g2-hex-tooltip-${info.project.name}.png` });
  await page.mouse.move(vp.width / 2, 22);
  await expect(tip).toBeHidden();

  // The progress widget opens the tech tree.
  await page.locator('[data-progress="techs"]').click();
  await expect(page.locator('[data-field="panel"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-field="panel"]')).toBeHidden();

  // Notifications: a right-click dismisses one until next turn.
  const items = page.locator('.attention-item');
  const n = await items.count();
  expect(n).toBeGreaterThan(1);
  await items.first().click({ button: 'right' });
  await expect(items).toHaveCount(n - 1);
  await expect(page.locator('[data-field="attention-title"]')).toHaveText(`Needs attention (${n - 1})`);

  // The minimap: clicking moves the camera; its frame follows. (Close in and at one corner of
  // what you have explored, since the camera keeps to the explored part: G9. Then click the
  // minimap on your first unit.)
  const target = await page.evaluate(() => {
    const g = window.__atlasGame;
    const v = g.mapView;
    v.setCamera({ ...v.camera, zoom: 2, x: -1e6, y: -1e6 });
    const u = g.view.units.find((x) => x.faction === g.human);
    const p = v.tileToScreen(u.tile);
    const w = { x: p.x / v.camera.zoom + v.camera.x, y: p.y / v.camera.zoom + v.camera.y };
    return { fx: w.x / v.world.width, fy: w.y / v.world.height, ww: v.world.width, wh: v.world.height };
  });
  const cam0 = await page.evaluate(() => ({ ...window.__atlasGame.mapView.camera }));
  const mm = parts.minimap;
  const k = Math.min(mm.width / target.ww, mm.height / target.wh);
  await page.mouse.click(mm.x + (mm.width - target.ww * k) / 2 + target.fx * target.ww * k, mm.y + (mm.height - target.wh * k) / 2 + target.fy * target.wh * k);
  const cam1 = await page.evaluate(() => ({ ...window.__atlasGame.mapView.camera }));
  expect(cam1.x !== cam0.x || cam1.y !== cam0.y).toBe(true);

  // Map toggles: the grid by button, yield icons by key.
  await page.locator('[data-action="grid"]').click();
  await expect(page.locator('[data-action="grid"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.__atlasGame.mapView.stats.showGrid)).toBe(true);
  await page.locator('#game-map').focus();
  await page.keyboard.press('y');
  await expect(page.locator('[data-action="yield-icons"]')).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: `test-results/g2-yields-grid-${info.project.name}.png` });

  // Help opens a sheet of shortcuts; Escape closes it.
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await expect(page.locator('[data-field="panel"]')).toContainText('Keyboard shortcuts');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-field="panel"]')).toBeHidden();

  // A city panel takes the left side and hides the progress widget; the city stays in view.
  await page.locator('[data-action="advice"]').click(); // selects the settler
  await page.locator('[data-act="foundCity"]').click();
  await expect.poll(() => page.evaluate(() => window.__atlasGame.view.cities.length)).toBeGreaterThan(0);
  const city = await page.evaluate(() => window.__atlasGame.view.cities.find((c) => c.faction === window.__atlasGame.human));
  expect(city).toBeTruthy();
  await page.evaluate((id) => window.__atlasGame.openCity(id), city.id);
  await expect(page.locator('.hud-progress')).toBeHidden();
  expect(await page.evaluate((t) => window.__atlasGame.mapView.isClear(t), city.tile)).toBe(true);
  await page.screenshot({ path: `test-results/g2-city-${info.project.name}.png` });
  expect(errors).toEqual([]);
});
