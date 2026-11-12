import type { App } from '../app';
import { CAMERA_PRESETS, type CameraPresetName } from '../render/cameraPresets';

/**
 * window.__game, only installed with ?test. The simulation does not advance on
 * real time in test mode (unless &live): tests drive it with step(dt).
 */
export function installTestHook(app: App): void {
  const api = {
    ready: true,
    get state() {
      const g = app.game;
      const p = app.van.body.translation();
      return {
        phase: g.phase,
        seed: g.seed,
        score: g.score,
        parcelsLeft: g.parcelsLeft,
        clock: g.clock.format(),
        elapsed: g.clock.elapsed,
        van: { x: p.x, y: p.y, z: p.z, heading: app.van.heading, speed: app.van.speed },
        backend: app.backend,
        tier: app.quality.tier,
        drawCalls: app.renderer.info.render.drawCalls,
        triangles: app.renderer.info.render.triangles,
      };
    },
    get clock() {
      return { elapsed: app.game.clock.elapsed, minutes: app.game.clock.minutes, text: app.game.clock.format() };
    },
    get van() {
      const p = app.van.body.translation();
      return { x: p.x, y: p.y, z: p.z, heading: app.van.heading, speed: app.van.speed };
    },
    get parcels() {
      return app.game.parcels.map((p) => ({ id: p.id, address: p.stop.address, zone: p.stop.zone, value: p.value, delivered: p.delivered }));
    },
    start: () => app.start(),
    restart: (seed?: string) => app.restart(seed),
    /** Advance the simulation by dt seconds (fixed 1/60 sub-steps). */
    step: (dt: number, input?: { steer?: number; throttle?: number; brake?: number }) => {
      if (input) Object.assign(app.input.touch, { steer: input.steer ?? 0, gas: (input.throttle ?? 0) > 0, brake: (input.brake ?? 0) > 0 });
      app.input.update(0);
      app.step(dt);
      if (input) Object.assign(app.input.touch, { steer: 0, gas: false, brake: false });
      return api.state;
    },
    teleport: (x: number, z: number, heading = Math.PI) => app.teleport(x, z, heading),
    setSeed: (seed: string) => app.restart(seed),
    deliver: (id?: string) => app.game.deliver(id ?? app.game.targetId ?? ''),
    setCameraPreset: (name: CameraPresetName | null) => app.setCameraPreset(name),
    cameraPresets: Object.keys(CAMERA_PRESETS),
  };
  (window as unknown as { __game: typeof api }).__game = api;
}
