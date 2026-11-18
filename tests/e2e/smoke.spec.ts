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

test('a bot can drive the streets from the depot to the first stop and hand the parcel over', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.__game.start());
  const { zone, id, total } = await page.evaluate(() => {
    const g = window.__game;
    return { zone: g.parcels.find((p) => p.id === g.targetId)!.zone, id: g.targetId, total: g.parcels.length };
  });
  const r = await driveTo(page, zone.x, zone.z, { radius: zone.radius - 1 });
  expect(r.waypoints).toBeGreaterThan(2);
  expect(r.reached, `van ended at ${JSON.stringify(r.van)}`).toBe(true);
  // A blocked junction shows up as stalls and a slow run.
  expect(r.stalls, r.stallsAt.join('; ')).toBe(0);
  expect(r.seconds).toBeLessThan(150);
  const s = await page.evaluate(() => window.__game.state);
  expect(s.parcelsLeft).toBe(total - 1);
  expect(s.score).toBeGreaterThan(0);
  expect(await page.evaluate((id) => window.__game.parcels.find((p) => p.id === id)!.delivered, id)).toBe(true);
  // The next nearest stop becomes the target.
  expect(s.targetId).not.toBe(id);
  await expect(page.getByTestId('score')).toHaveText(String(s.score));
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

test('the shift ends at 6pm with parcels undelivered, on the tally screen', async ({ page }) => {
  await openGame(page);
  const s = await page.evaluate(() => {
    window.__game.start();
    return window.__game.step(301);
  });
  expect(s.phase).toBe('ended');
  expect(s.clock).toBe('6:00pm');
  expect(s.parcelsLeft).toBeGreaterThanOrEqual(14);
  await expect(page.getByTestId('end-card')).toContainText('Shift over');
  await expect(page.getByTestId('rank')).toHaveText('Missed the Sleigh');
  await expect(page.getByTestId('final-score')).toHaveText('0');
});

test('a full shift: deliveries of every type, a crash, then the tally and rank at 6pm', async ({ page }) => {
  await openGame(page);
  const r = await page.evaluate(() => {
    const g = window.__game;
    g.start();
    const types = new Set(g.parcels.map((p) => p.type));
    const load0 = g.loadKg;
    // Hand over parcels one by one at their doors, the way a driver would: stop in the ring and wait.
    let delivered = 0;
    let heavyGone = 0;
    for (let i = 0; i < 9; i++) {
      const p = g.parcels.find((q) => q.id === g.targetId)!;
      g.teleport(p.zone.x, p.zone.z);
      g.step(1.5);
      if (g.parcels.find((q) => q.id === p.id)!.delivered) delivered++;
      if (p.type === 'heavy') heavyGone++;
      g.step(8); // driving time between stops
    }
    g.hit(7);
    const lines = g.tally.lines;
    const before = g.state.score;
    g.step(320);
    return { types: [...types], load0, load1: g.loadKg, heavyGone, delivered, lines, before, state: g.state, tally: g.tally };
  });
  expect(r.types.sort()).toEqual(['express', 'fragile', 'grandma', 'heavy', 'standard']);
  expect(r.delivered).toBe(9);
  expect(r.load1).toBeLessThan(r.load0);
  expect(r.state.phase).toBe('ended');
  expect(r.state.damage).toBe(21);
  expect(r.lines.find((l) => l.label === 'Damage')!.points).toBe(-21);
  expect(r.lines.find((l) => l.label === 'Streak')!.points).toBeGreaterThan(0);
  expect(r.tally.score).toBe(r.before);
  await expect(page.getByTestId('end-card')).toContainText('Shift over');
  await expect(page.getByTestId('final-score')).toHaveText(String(r.tally.score));
  await expect(page.getByTestId('rank')).toHaveText(r.tally.rank);
  await expect(page.getByTestId('end-card')).toContainText('9 parcels delivered');
});

test('after 6pm the van stays parked, even if it was rolling', async ({ page }) => {
  await openGame(page);
  const r = await page.evaluate(() => {
    const g = window.__game;
    g.start();
    g.step(296, { throttle: 0 });
    g.step(4, { throttle: 1 }); // still on the gas when the clock hits 6pm
    const atEnd = g.state.van;
    g.step(10);
    return { atEnd, later: g.state.van, phase: g.state.phase };
  });
  expect(r.phase).toBe('ended');
  expect(Math.abs(r.later.speed)).toBeLessThan(0.2);
  // Stops within a few metres and never backs away.
  expect(Math.hypot(r.later.x - r.atEnd.x, r.later.z - r.atEnd.z)).toBeLessThan(15);
});

test('every parcel delivered ends the shift early, all delivered', async ({ page }) => {
  await openGame(page);
  const s = await page.evaluate(() => {
    const g = window.__game;
    g.start();
    for (const p of g.parcels) g.deliver(p.id);
    return { state: g.state, tally: g.tally };
  });
  expect(s.state.phase).toBe('ended');
  expect(s.tally.rank).toBe('Christmas Hero');
  await expect(page.getByTestId('end-card')).toContainText('All delivered');
});

test('stop picker: the tray lists the parcels and a tap sets the target; the minimap shows', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.__game.start());
  await frames(page, 3);
  await expect(page.getByTestId('minimap')).toBeVisible();
  const first = await page.evaluate(() => window.__game.targetId);
  await page.getByTestId('tray-toggle').click();
  const items = page.getByTestId('tray').locator('.tray-item');
  expect(await items.count()).toBe(await page.evaluate(() => window.__game.state.parcelsLeft));
  const pick = await page.evaluate((first) => window.__game.parcels.filter((p) => p.id !== first).at(-1)!, first);
  await page.getByTestId(`pick-${pick.id}`).click();
  expect(await page.evaluate(() => window.__game.targetId)).toBe(pick.id);
  await expect(page.getByTestId('tray')).toHaveCount(0);
  await frames(page, 3);
  await expect(page.getByTestId('target')).toContainText(pick.address);
});

test('teleport + deliver hooks, and setSeed resets the run', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    const g = window.__game;
    g.start();
    const z = g.parcels.find((p) => p.id === g.targetId)!.zone;
    g.teleport(z.x, z.z);
    g.step(1.5);
  });
  const total = await page.evaluate(() => window.__game.parcels.length);
  expect(await page.evaluate(() => window.__game.state.parcelsLeft)).toBe(total - 1);
  await page.evaluate(() => window.__game.setSeed('another-day'));
  const s = await page.evaluate(() => window.__game.state);
  expect(s.phase).toBe('ready');
  expect(s.parcelsLeft).toBe(await page.evaluate(() => window.__game.parcels.length));
  expect(await page.evaluate(() => window.__game.parcels.every((p) => !p.delivered))).toBe(true);
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

test('the rules open from the ? button, pause the game, and close back to driving', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => window.__game.start());
  await frames(page, 3);
  await page.getByTestId('help').click();
  await expect(page.getByTestId('rules')).toContainText('Stop inside any ring');
  await expect(page.getByTestId('rules')).toContainText('For Grandma');
  expect(await page.evaluate(() => (window.__game.app as unknown as { paused: boolean }).paused)).toBe(true);
  await page.getByTestId('rules-close').click();
  await expect(page.getByTestId('rules')).toHaveCount(0);
  expect(await page.evaluate(() => (window.__game.app as unknown as { paused: boolean }).paused)).toBe(false);
});
