import { expect, test } from '@playwright/test';
import { frames, openGame } from './helpers';

test('boots on a GPU backend without errors and within the draw budget', async ({ page }) => {
  const { errors } = await openGame(page);
  await frames(page, 30);
  const s = await page.evaluate(() => window.__game.state);
  expect(['webgpu', 'webgl2']).toContain(s.backend);
  expect(s.phase).toBe('ready');
  expect(s.drawCalls).toBeGreaterThan(5);
  expect(s.drawCalls).toBeLessThan(200);
  expect(s.triangles).toBeLessThan(600_000);
  expect(errors).toEqual([]);
});

test('the clock does not run on real time in test mode, and step() advances it', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.__game.start());
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => window.__game.state.elapsed)).toBe(0);
  const s = await page.evaluate(() => window.__game.step(25));
  expect(s.clock).toBe('4:10pm');
  await expect(page.getByTestId('clock')).toHaveText('4:10pm');
});

test('a bot can drive from the depot to the delivery and complete it', async ({ page }) => {
  await openGame(page);
  const result = await page.evaluate(() => {
    const g = window.__game;
    g.start();
    const target = g.parcels[0]!.zone;
    for (let i = 0; i < 60 * 90; i++) {
      const v = g.state.van;
      const dx = target.x - v.x;
      const dz = target.z - v.z;
      const dist = Math.hypot(dx, dz);
      const want = Math.atan2(dx, dz);
      const diff = Math.atan2(Math.sin(want - v.heading), Math.cos(want - v.heading));
      // Steering right (+1) turns the heading clockwise seen from above (heading decreases).
      const steer = Math.max(-1, Math.min(1, -diff * 2.5));
      // Target speed falls with distance; brake hard once inside the ring.
      const inside = dist < target.radius - 1;
      const wantSpeed = inside ? 0 : Math.min(10, 0.8 + dist * 0.5);
      const s = g.step(1 / 60, {
        steer: inside ? 0 : steer,
        throttle: v.speed < wantSpeed - 0.5 ? 0.7 : 0,
        brake: v.speed > wantSpeed + 0.5 ? 1 : 0,
      });
      if (s.phase === 'ended') return { ...s, steps: i };
    }
    return { ...g.state, steps: -1 };
  });
  expect(result.steps).toBeGreaterThan(0);
  expect(result.parcelsLeft).toBe(0);
  expect(result.score).toBeGreaterThan(0);
  await expect(page.getByTestId('end-card')).toContainText('All delivered');
});

test('the shift ends at 6pm with the parcel undelivered', async ({ page }) => {
  await openGame(page);
  const s = await page.evaluate(() => {
    window.__game.start();
    return window.__game.step(301);
  });
  expect(s.phase).toBe('ended');
  expect(s.clock).toBe('6:00pm');
  expect(s.parcelsLeft).toBe(1);
  await expect(page.getByTestId('end-card')).toContainText('Shift over');
});

test('teleport + deliver hooks, and setSeed resets the run', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    const g = window.__game;
    g.start();
    const z = g.parcels[0]!.zone;
    g.teleport(z.x, z.z);
    g.step(1.5);
  });
  expect(await page.evaluate(() => window.__game.state.parcelsLeft)).toBe(0);
  await page.evaluate(() => window.__game.setSeed('another-day'));
  const s = await page.evaluate(() => window.__game.state);
  expect(s.phase).toBe('ready');
  expect(s.parcelsLeft).toBe(1);
});

test('keyboard drives the van in live mode', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard is desktop only');
  await openGame(page, '&live');
  await page.evaluate(() => window.__game.start());
  const z0 = await page.evaluate(() => window.__game.state.van.z);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyW');
  const z1 = await page.evaluate(() => window.__game.state.van.z);
  expect(z1).toBeLessThan(z0 - 1);
});

test('touch controls are shown on phones and drive the van', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'touch is phone only');
  await openGame(page, '&live');
  const gas = page.locator('.pedal.gas');
  await expect(gas).toBeVisible();
  await page.evaluate(() => window.__game.start());
  const z0 = await page.evaluate(() => window.__game.state.van.z);
  const box = (await gas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await gas.dispatchEvent('pointerdown');
  await page.waitForTimeout(1500);
  await gas.dispatchEvent('pointerup');
  const z1 = await page.evaluate(() => window.__game.state.van.z);
  expect(z1).toBeLessThan(z0 - 1);
});
