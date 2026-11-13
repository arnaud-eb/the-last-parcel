import type { App } from '../app';
import { CAMERA_PRESETS, type CameraPresetName } from '../render/cameraPresets';
import { NavGraph } from '../world/navgraph';

/**
 * window.__game, only installed with ?test. The simulation does not advance on
 * real time in test mode (unless &live): tests drive it with step(dt).
 */
export function installTestHook(app: App): void {
  let graph: NavGraph | null = null;
  const api = {
    ready: true,
    /** The App itself, for ad-hoc debugging from Playwright. Not a stable API. */
    app,
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
        van: { x: p.x, y: p.y, z: p.z, heading: app.van.heading, speed: app.van.speed, upY: app.van.upY },
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
      return { x: p.x, y: p.y, z: p.z, heading: app.van.heading, speed: app.van.speed, upY: app.van.upY };
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
    recover: () => app.recover(),
    /** Roll the van onto its roof where it stands (to test recovery). */
    overturn: () => {
      const b = app.van.body;
      const p = b.translation();
      const h = app.van.heading;
      // Yaw by heading, then roll 180° about the van's forward (+Z) axis.
      b.setTranslation({ x: p.x, y: p.y + 1.5, z: p.z }, true);
      b.setRotation({ x: Math.sin(h / 2), y: 0, z: Math.cos(h / 2), w: 0 }, true);
    },
    /** Street route from the van to (x, z), as waypoints. Null if unreachable. */
    route: (x: number, z: number) => {
      graph ??= new NavGraph();
      const p = app.van.body.translation();
      return graph.path(p.x, p.z, x, z)?.map((n) => ({ x: n.x, y: n.y, z: n.z })) ?? null;
    },
    setSeed: (seed: string) => app.restart(seed),
    deliver: (id?: string) => app.game.deliver(id ?? app.game.targetId ?? ''),
    setCameraPreset: (name: CameraPresetName | null) => app.setCameraPreset(name),
    /** Free camera for ad-hoc inspection (not for milestone shots: use presets). */
    setCamera: (pos: [number, number, number], target: [number, number, number]) => app.setCamera(pos, target),
    cameraPresets: Object.keys(CAMERA_PRESETS),
  };
  (window as unknown as { __game: typeof api }).__game = api;
}
