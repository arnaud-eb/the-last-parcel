import type { Page } from '@playwright/test';

export type GameApi = {
  ready: boolean;
  state: {
    phase: string;
    score: number;
    damage: number;
    targetId: string | null;
    parcelsLeft: number;
    clock: string;
    elapsed: number;
    van: { x: number; y: number; z: number; heading: number; speed: number; upY: number };
    backend: string;
    drawCalls: number;
    triangles: number;
  };
  parcels: {
    id: string; type: string; address: string; zone: { x: number; z: number; radius: number }; y: number; district: string;
    value: number; tip: number; hits: number; delivered: boolean; deliveredAt: number | null;
  }[];
  targetId: string | null;
  tally: { delivered: number; total: number; lines: { label: string; points: number }[]; score: number; rank: string };
  loadKg: number;
  select(id: string): void;
  hit(strength: number): unknown[];
  start(): void;
  restart(seed?: string): void;
  step(dt: number, input?: { steer?: number; throttle?: number; brake?: number }): GameApi['state'];
  teleport(x: number, z: number, heading?: number): void;
  recover(): void;
  overturn(): void;
  app: { on(cb: (e: { type: string }) => void): () => void };
  route(x: number, z: number): { x: number; y: number; z: number }[] | null;
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

export type DriveResult = { reached: boolean; seconds: number; stalls: number; stallsAt: string[]; van: GameApi['state']['van']; phase: string; waypoints: number };

/**
 * Bot: follow the street route to (x, z) with pure pursuit, stop inside `radius`,
 * and hold still for `holdSeconds` (so a delivery can complete). Runs on the
 * simulation clock via the ?test hook, not real time.
 */
export async function driveTo(page: Page, x: number, z: number, opts: { radius?: number; maxSeconds?: number; holdSeconds?: number } = {}): Promise<DriveResult> {
  return page.evaluate(
    ({ x, z, radius, maxSeconds, holdSeconds }) => {
      const g = window.__game;
      const path = g.route(x, z);
      if (!path) return { reached: false, seconds: 0, stalls: 0, stallsAt: [], van: g.state.van, phase: g.state.phase, waypoints: 0 };
      path.push({ x, y: path.at(-1)!.y, z });
      let k = 0;
      let stuck = 0;
      let reverse = 0;
      let stalls = 0;
      const stallsAt: string[] = [];
      let held = 0;
      for (let i = 0; i < 60 * maxSeconds; i++) {
        const v = g.state.van;
        while (k < path.length - 1 && Math.hypot(path[k]!.x - v.x, path[k]!.z - v.z) < 7) k++;
        const aim = path[k]!;
        const want = Math.atan2(aim.x - v.x, aim.z - v.z);
        const diff = Math.atan2(Math.sin(want - v.heading), Math.cos(want - v.heading));
        // Steering right (+1) turns the heading clockwise seen from above (heading decreases).
        const steer = Math.max(-1, Math.min(1, -diff * 2.2));
        const dist = Math.hypot(x - v.x, z - v.z);
        const inside = dist < radius;
        const corner = Math.min(1, Math.abs(diff) * 0.9);
        const wantSpeed = inside ? 0 : Math.min(12 - corner * 8, 0.8 + dist * 0.5);
        // Stuck against something: back out for a second.
        stuck = !inside && wantSpeed > 2 && Math.abs(v.speed) < 0.5 ? stuck + 1 : 0;
        if (stuck > 90) {
          reverse = 60;
          stalls++;
          stallsAt.push(`(${v.x.toFixed(1)}, ${v.y.toFixed(1)}, ${v.z.toFixed(1)}) heading ${v.heading.toFixed(2)}`);
          stuck = 0;
        }
        const s = reverse-- > 0
          ? g.step(1 / 60, { steer: -steer, throttle: 0, brake: 1 })
          : g.step(1 / 60, {
            steer: inside ? 0 : steer,
            throttle: v.speed < wantSpeed - 0.4 ? 0.8 : 0,
            brake: v.speed > wantSpeed + 0.6 ? 1 : 0,
          });
        held = inside && Math.abs(v.speed) < 0.5 ? held + 1 / 60 : 0;
        if (s.phase === 'ended' || held >= holdSeconds) {
          return { reached: true, seconds: i / 60, stalls, stallsAt, van: s.van, phase: s.phase, waypoints: path.length };
        }
      }
      return { reached: false, seconds: maxSeconds, stalls, stallsAt, van: g.state.van, phase: g.state.phase, waypoints: path.length };
    },
    { x, z, radius: opts.radius ?? 1.8, maxSeconds: opts.maxSeconds ?? 200, holdSeconds: opts.holdSeconds ?? 1.5 },
  );
}
