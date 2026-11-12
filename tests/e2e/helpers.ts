import type { Page } from '@playwright/test';

export type GameApi = {
  ready: boolean;
  state: {
    phase: string;
    score: number;
    parcelsLeft: number;
    clock: string;
    elapsed: number;
    van: { x: number; y: number; z: number; heading: number; speed: number };
    backend: string;
    drawCalls: number;
    triangles: number;
  };
  parcels: { id: string; address: string; zone: { x: number; z: number; radius: number }; delivered: boolean }[];
  start(): void;
  restart(seed?: string): void;
  step(dt: number, input?: { steer?: number; throttle?: number; brake?: number }): GameApi['state'];
  teleport(x: number, z: number, heading?: number): void;
  setSeed(seed: string): void;
  deliver(id?: string): void;
  setCameraPreset(name: string | null): void;
  cameraPresets: string[];
};

declare global {
  interface Window {
    __game: GameApi;
  }
}

/** Open the game in test mode and collect page errors. */
export async function openGame(page: Page, query = ''): Promise<{ errors: string[] }> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`/?test&seed=m1-review${query}`);
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 90_000 });
  return { errors };
}

/** Let the render loop draw a few frames. */
export async function frames(page: Page, n = 10): Promise<void> {
  await page.evaluate(
    (n) =>
      new Promise<void>((resolve) => {
        let i = 0;
        const tick = () => (++i >= n ? resolve() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      }),
    n,
  );
}
