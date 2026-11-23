// Phase 3 smoke test: the developer map viewer in a real browser.

import { test, expect } from '@playwright/test';

const hash = (page) => page.locator('[data-field="hash"]').textContent();

test('map viewer: same seed same map, pan and zoom work, every type draws', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('/dev.html?seed=1234&type=continents&size=small');
  await page.waitForFunction(() => window.__atlasDev);
  const first = await hash(page);
  expect(first).toMatch(/^[0-9a-f]{8}$/);
  await page.locator('#regenerate').click();
  await expect(page.locator('[data-field="hash"]')).toHaveText(first);
  await page.locator('#map-seed').fill('99');
  await page.locator('#regenerate').click();
  await expect(page.locator('[data-field="hash"]')).not.toHaveText(first);

  // The canvas is painted (not a single flat colour).
  const colours = await page.evaluate(() => {
    const c = window.__atlasDev.view.canvas;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4 * 97) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
    return seen.size;
  });
  expect(colours).toBeGreaterThan(20);

  // Drag pans; the wheel zooms within 50% to 200%.
  const box = await page.locator('.map-canvas').boundingBox();
  const cam0 = await page.evaluate(() => ({ ...window.__atlasDev.view.camera }));
  if (!info.project.use.hasTouch) {
    await page.mouse.move(box.x + 200, box.y + 200);
    await page.mouse.down();
    await page.mouse.move(box.x + 100, box.y + 150, { steps: 5 });
    await page.mouse.up();
    const cam1 = await page.evaluate(() => ({ ...window.__atlasDev.view.camera }));
    expect(cam1.x).toBeGreaterThan(cam0.x);
    for (let k = 0; k < 10; k += 1) await page.mouse.wheel(0, -400);
    expect(await page.evaluate(() => window.__atlasDev.view.camera.zoom)).toBe(2);
    for (let k = 0; k < 20; k += 1) await page.mouse.wheel(0, 400);
    expect(await page.evaluate(() => window.__atlasDev.view.camera.zoom)).toBe(0.5);
    await page.keyboard.press('ArrowRight');
  } else {
    // Two-finger pinch outwards zooms in.
    const zoomed = await page.evaluate(({ x, y }) => {
      const c = window.__atlasDev.view.canvas;
      const fire = (type, id, px) => c.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x + px, clientY: y + 150, bubbles: true, pointerType: 'touch' }));
      const before = window.__atlasDev.view.camera.zoom;
      fire('pointerdown', 1, 150); fire('pointerdown', 2, 250);
      for (let k = 1; k <= 5; k += 1) { fire('pointermove', 1, 150 - k * 20); fire('pointermove', 2, 250 + k * 20); }
      fire('pointerup', 1, 50); fire('pointerup', 2, 350);
      return window.__atlasDev.view.camera.zoom / before;
    }, { x: box.x, y: box.y });
    expect(zoomed).toBeGreaterThan(1.5);
  }

  for (const type of ['continents', 'pangaea', 'islands', 'inland_sea', 'highlands']) {
    await page.locator('#map-type').selectOption(type);
    await expect(page.locator('[data-field="info"]')).toContainText('starts');
  }
  await page.screenshot({ path: `test-results/map-${info.project.name}.png` });
  expect(errors).toEqual([]);
});

// Times the JavaScript side of each frame (choosing and copying the visible
// chunks). The browser finishes the copies on the graphics card, which this
// cannot see, so it guards against slow code rather than measuring frame rate.
test('panning a Huge map stays smooth', async ({ page }, info) => {
  test.skip(info.project.name !== 'laptop-1366', 'one timing run is enough');
  await page.goto('/dev.html?seed=7&type=continents&size=huge');
  await page.waitForFunction(() => window.__atlasDev);
  const ms = await page.evaluate(() => {
    const v = window.__atlasDev.view;
    const times = [];
    for (const zoom of [0.5, 1, 2]) {
      v.setCamera({ ...v.camera, zoom });
      for (let k = 0; k < 40; k += 1) {
        v.setCamera({ ...v.camera, x: v.camera.x + 37, y: v.camera.y + (k % 2 ? 11 : -11) });
        times.push(v.drawNow());
      }
    }
    times.sort((a, b) => a - b);
    return { median: times[Math.floor(times.length / 2)], p95: times[Math.floor(times.length * 0.95)] };
  });
  console.log(`Huge map frame time: median ${ms.median.toFixed(1)} ms, 95th percentile ${ms.p95.toFixed(1)} ms`);
  expect(ms.median).toBeLessThan(16);
});
