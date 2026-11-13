import { expect, test } from '@playwright/test';
import { driveTo, frames, openGame } from './helpers';

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

test('a bot can drive the streets from the depot to the delivery and complete it', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.__game.start());
  const zone = await page.evaluate(() => window.__game.parcels[0]!.zone);
  const r = await driveTo(page, zone.x, zone.z, { radius: zone.radius - 1 });
  expect(r.waypoints).toBeGreaterThan(2);
  expect(r.reached, `van ended at ${JSON.stringify(r.van)}`).toBe(true);
  // A blocked junction shows up as stalls and a slow run.
  expect(r.stalls, r.stallsAt.join('; ')).toBe(0);
  expect(r.seconds).toBeLessThan(150);
  const s = await page.evaluate(() => window.__game.state);
  expect(s.parcelsLeft).toBe(0);
  expect(s.score).toBeGreaterThan(0);
  await expect(page.getByTestId('end-card')).toContainText('All delivered');
});

test('the switchbacks down to Grund are drivable', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    window.__game.start();
    // Start on the Corniche, at the top of the Montée du Grund.
    window.__game.teleport(230, -40, 0);
  });
  const r = await driveTo(page, 300, 0, { radius: 4, maxSeconds: 120, holdSeconds: 0.2 });
  expect(r.reached, `van ended at ${JSON.stringify(r.van)}`).toBe(true);
  expect(r.stalls, r.stallsAt.join('; ')).toBe(0);
  expect(r.van.y).toBeLessThan(-30);
});

test('an overturned van off the road is put back on it, upright', async ({ page }) => {
  await openGame(page);
  const s = await page.evaluate(() => {
    const g = window.__game;
    g.start();
    const events: string[] = [];
    g.app.on((e) => events.push(e.type));
    // On the wooded slope between two legs of the switchbacks, off the road.
    g.teleport(247, 10, 0);
    g.overturn();
    g.step(0.5);
    const tipped = g.state.van.upY;
    // It tumbles down the slope first, then sits on its side until the watch kicks in.
    g.step(7);
    return { tipped, after: g.state.van, path: g.route(300, 0), events };
  });
  expect(s.tipped).toBeLessThan(0);
  expect(s.after.upY).toBeGreaterThan(0.95);
  // Back on a street the bot can drive on from here.
  expect(s.path).not.toBeNull();
  expect(s.events).toContain('recovered');
});

test('the reset button / R key puts the van back on the road', async ({ page }, info) => {
  await openGame(page);
  await page.evaluate(() => {
    window.__game.start();
    window.__game.teleport(247, 10, 0);
  });
  const before = await page.evaluate(() => window.__game.state.van);
  if (info.project.name === 'phone') await page.getByTestId('reset').tap();
  else await page.keyboard.press('KeyR');
  await frames(page, 3); // the key is read on the next rendered frame
  await page.evaluate(() => window.__game.step(0.5));
  const after = await page.evaluate(() => window.__game.state.van);
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(2);
  expect(after.upY).toBeGreaterThan(0.95);
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
