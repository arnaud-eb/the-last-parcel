import { test } from '@playwright/test';
import { frames, openGame } from './helpers';

const MILESTONE = process.env.MILESTONE ?? 'm1';

/** Milestone review shots from the fixed camera presets (src/render/cameraPresets.ts). */
test('fixed camera screenshots', async ({ page }, info) => {
  await openGame(page, '&debug');
  const presets = await page.evaluate(() => window.__game.cameraPresets);
  await page.evaluate(() => window.__game.start());
  for (const name of presets) {
    await page.evaluate((n) => window.__game.setCameraPreset(n), name);
    await frames(page, 40);
    await page.screenshot({ path: `screenshots/${MILESTONE}/${info.project.name}-${name}.png` });
  }
});
