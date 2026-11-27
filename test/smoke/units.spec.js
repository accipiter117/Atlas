// Graphics overhaul G4 (docs/OVERHAUL.md 4.3): units are drawn from their own
// sprite sheets in their faction's colour, the selection panel shows the
// unit's portrait, and Diplomacy shows each leader's portrait.

import { test, expect } from '@playwright/test';

test('G4: faction-coloured sprites, unit portraits and leader portraits', async ({ page }, info) => {
  test.skip(info.project.name !== 'laptop-1366', 'one run is enough for the art');
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?seed=42&faction=rome&debug=1&nosw=1');
  await page.getByRole('button', { name: 'New game' }).click();
  await page.waitForFunction(() => window.__atlasGame);

  // The warrior's sheet loads, and the same frame comes out in two different colours.
  await page.waitForFunction(() => { const g = window.__atlasGame; return g.mapView.sheetFor('warrior', g.human)?.ready; });
  const differs = await page.evaluate(() => {
    const g = window.__atlasGame;
    const sheet = g.mapView.sheetFor('warrior', g.human);
    const pixels = (colour) => {
      const f = sheet.frameFor('idle', 's', 0, colour);
      return Array.from(f.img.getContext('2d').getImageData(0, 0, f.sw, f.sh).data);
    };
    const red = pixels('#c0392b');
    const blue = pixels('#2f6fbf');
    return { differ: red.some((v, i) => v !== blue[i]), opaque: red.filter((v, i) => i % 4 === 3 && v > 0).length };
  });
  expect(differs.differ).toBe(true);
  expect(differs.opaque).toBeGreaterThan(200);

  // The selected unit's portrait is drawn from its sheet.
  await page.locator('[data-action="next"]').click();
  await expect(page.locator('.unit-panel .portrait canvas.portrait-art')).toBeVisible();
  await page.screenshot({ path: `test-results/g4-units-${info.project.name}.png` });

  // Diplomacy: every leader you have met has a portrait.
  await page.evaluate(() => window.__atlasGame.debug.meetAll());
  await page.locator('#game-map').focus();
  await page.keyboard.press('d');
  const panel = page.locator('[data-field="panel"]');
  await expect(panel.locator('.dip-leader').first()).toBeVisible();
  await expect(panel.locator('.dip-leader img.dip-face')).toHaveCount(await panel.locator('.dip-leader').count());
  await panel.locator('.dip-leader').first().click();
  const face = panel.locator('.dip-detail img.dip-face');
  await expect(face).toBeVisible();
  await expect.poll(() => face.evaluate((img) => img.naturalWidth)).toBe(128);
  await page.screenshot({ path: `test-results/g4-diplomacy-${info.project.name}.png` });
  expect(errors).toEqual([]);
});
