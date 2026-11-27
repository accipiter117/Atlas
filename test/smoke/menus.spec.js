// Graphics overhaul G7 (docs/OVERHAUL.md 5.1 and 5.2): the menus fit a laptop
// screen, Help explains the game, Quick start replays your last setup on a new
// world, and every new setting really changes something.

import { test, expect } from '@playwright/test';

const fits = (page) => page.evaluate(() => document.scrollingElement.scrollHeight <= innerHeight + 1);

test('G7: setup and settings fit 1366x768; Help; Quick start', async ({ page }, info) => {
  test.skip(info.project.name !== 'laptop-1366', 'the laptop layout');
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?seed=42&nosw=1');
  await expect(page.getByRole('button', { name: 'Quick start' })).toBeDisabled();

  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await expect(page.locator('#help')).toContainText('How to play');
  await expect(page.locator('#help')).toContainText('Keyboard shortcuts');
  await expect(page.locator('#help')).toContainText('Glossary');
  await page.keyboard.press('Escape');
  await expect(page.locator('#title')).toBeVisible();

  await page.getByRole('button', { name: 'Settings' }).click();
  expect(await fits(page)).toBe(true);
  for (const name of ['confirmEndTurn', 'autoEndTurn', 'showGrid', 'showYields', 'edgeScroll', 'zoomSpeed', 'ambient', 'factionColours', 'autosaveEvery', 'autosaveKeep', 'animSpeed', 'rivalMoves', 'combatCamera', 'motion', 'uiScale', 'tooltipDelay']) {
    await expect(page.locator(`#settings [data-setting="${name}"]`)).toHaveCount(1);
  }
  await page.locator('#settings [data-action="back"]').click();

  // Setup: every tab fits without scrolling, and the summary's Start button is always in view.
  await page.getByRole('button', { name: 'New game' }).click();
  await page.locator('[data-preset="quick"]').click();
  for (const tab of ['rules', 'map', 'players', 'victory', 'advanced']) {
    await page.locator(`[data-tab="${tab}"]`).click();
    expect(await fits(page), `${tab} page`).toBe(true);
    expect(await page.evaluate(() => { const p = document.querySelector('.setup-pane'); return p.scrollHeight <= p.clientHeight + 1; }), `${tab} pane`).toBe(true);
    await expect(page.locator('[data-action="start-game"]')).toBeInViewport();
  }
  await page.screenshot({ path: `test-results/g7-setup-${info.project.name}.png` });
  await page.locator('[data-action="start-game"]').click();
  await page.waitForFunction(() => window.__atlasGame && !window.__atlasGame.busy);
  const firstSeed = await page.evaluate(() => window.__atlasGame.state.setup.seed);

  // Save and exit to the title: Continue shows the game's card, and Quick start is ready.
  await page.locator('[data-action="game-menu"]').click();
  await page.locator('[data-action="open-save"]').click();
  await page.locator('[data-action="save-game"]').click();
  await expect(page.locator('[data-field="saved"]')).toBeVisible();
  await page.locator('[data-action="to-title"]').click();
  await expect(page.locator('[data-field="continue-info"]')).toContainText('Turn');
  await page.screenshot({ path: `test-results/g7-title-${info.project.name}.png` });
  await page.getByRole('button', { name: 'Quick start' }).click();
  await page.waitForFunction((seed) => window.__atlasGame && window.__atlasGame.state.setup.seed !== seed, firstSeed);
  expect(await page.evaluate(() => window.__atlasGame.state.setup.map.size)).toBe('small');
  expect(errors).toEqual([]);
});

test('G7: the new settings change the game', async ({ page }, info) => {
  test.skip(info.project.name !== 'laptop-1366', 'the laptop layout');
  await page.addInitScript(() => localStorage.setItem('atlas:settings', JSON.stringify({ showGrid: true, factionColours: 'colourblind', edgeScroll: 'fast', confirmEndTurn: true })));
  await page.goto('/?seed=42&faction=rome&debug=1&nosw=1');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.waitForFunction(() => window.__atlasGame && !window.__atlasGame.busy);
  expect(await page.evaluate(() => window.__atlasGame.mapView.stats.showGrid)).toBe(true);
  expect(await page.evaluate(() => window.__atlasGame.colours[window.__atlasGame.human])).toBe('#0072b2');

  // Edge scrolling: resting the mouse at the left edge moves the map. (Close in and at the
  // right of what you have explored, since the camera keeps to the explored part: G9.)
  const x0 = await page.evaluate(() => { const v = window.__atlasGame.mapView; v.setCamera({ ...v.camera, zoom: 2, x: 1e6 }); return v.camera.x; });
  await page.mouse.move(700, 400);
  await page.mouse.move(3, 400);
  await expect.poll(() => page.evaluate(() => window.__atlasGame.mapView.camera.x), { timeout: 3000 }).toBeLessThan(x0 - 20);
  await page.mouse.move(700, 400);

  // Shift+Enter with units waiting asks first; pressed again, it ends the turn.
  await page.locator('#game-map').focus();
  await page.keyboard.press('Shift+Enter');
  await expect(page.locator('[data-toast]')).toContainText('Shift+Enter again');
  expect(await page.evaluate(() => window.__atlasGame.state.turn)).toBe(1);
  await page.keyboard.press('Shift+Enter');
  await expect(page.locator('[data-field="turn"]')).toHaveText('Turn 2', { timeout: 30_000 });
});

test('G7: auto end turn when nothing needs you', async ({ page }, info) => {
  test.skip(info.project.name !== 'laptop-1366', 'the laptop layout');
  await page.addInitScript(() => localStorage.setItem('atlas:settings', JSON.stringify({ autoEndTurn: true })));
  await page.goto('/?seed=42&faction=rome&debug=1&nosw=1');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.waitForFunction(() => window.__atlasGame && !window.__atlasGame.busy);
  await page.evaluate(() => {
    const g = window.__atlasGame;
    for (const u of g.view.units.filter((x) => x.faction === g.human)) g.debug.run({ type: 'sleep', faction: g.human, unit: u.id });
  });
  // With every unit asleep nothing needs you, so turns end by themselves, each a moment after the last;
  // they can pass faster than a check for one exact turn, so check that the turn has moved on.
  await expect.poll(() => page.evaluate(() => window.__atlasGame.state.turn), { timeout: 30_000 }).toBeGreaterThan(1);
});
