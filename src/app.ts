import * as THREE from 'three/webgpu';
import type RAPIER from '@dimforge/rapier3d-compat';
import { Game, type GameEvent } from './core/game';
import { PARCEL_COLOR, type Parcel } from './core/parcels';
import { createRenderer, type Backend } from './render/renderer';
import { AdaptiveQuality, type QualitySetting } from './render/quality';
import { createPost, rebuildPost } from './render/post';
import { Snow } from './render/snow';
import { U } from './render/materials';
import { WorldView } from './render/world';
import { ChaseCamera } from './render/chaseCamera';
import { DeliveryZoneView } from './render/deliveryZone';
import { TyreTracks } from './render/tyreTracks';
import { BridgeRails } from './world/bridgeRail';
import { CAMERA_PRESETS, type CameraPresetName } from './render/cameraPresets';
import { loadRapier, type Rapier } from './vehicle/rapier';
import { VanPhysics } from './vehicle/van';
import { RecoveryWatch } from './vehicle/recovery';
import { nearestRoad, recoveryPoint } from './world/roads';
import { terrainHeight } from './world/terrain';
import { NavGraph } from './world/navgraph';
import { VanMesh } from './vehicle/vanMesh';
import { buildColliders } from './world/colliders';
import { Input } from './ui/input';

export type AppOptions = {
  test: boolean;
  /** In test mode, run the simulation on real time anyway. */
  live: boolean;
  forceWebGL: boolean;
  quality: QualitySetting;
  seed: string;
  isMobile: boolean;
};

export type AppEvent = GameEvent | { type: 'hit'; strength: number } | { type: 'recovered'; auto: boolean; reason: 'stuck' | 'fall' } | { type: 'parapetBroken' } | { type: 'targetChanged' };

/** What the HUD needs each frame. */
export type HudSnapshot = {
  phase: Game['phase'];
  clock: string;
  minutesLeft: number;
  progress: number;
  parcelsLeft: number;
  parcelsTotal: number;
  score: number;
  handover: number;
  target: { id: string; type: Parcel['type']; address: string; dist: number; x: number; y: number; onScreen: boolean; angle: number } | null;
  debug: { fps: number; drawCalls: number; triangles: number; tier: string; scale: number; backend: Backend };
};

const FIXED_DT = 1 / 60;
/** A drop bigger than this (m) since the wheels last touched counts as a fall off the bridge or a cliff. */
const FALL_HEIGHT = 12;

export class App {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(56, 1, 0.1, 900);
  readonly game: Game;
  readonly van: VanPhysics;
  readonly input = new Input();
  readonly quality: AdaptiveQuality;
  readonly world: WorldView;
  presetName: CameraPresetName | null = null;
  /** Rules screen open: the clock and the van stop. */
  paused = false;

  private readonly vanMesh = new VanMesh();
  private readonly zone = new DeliveryZoneView();
  private readonly tracks = new TyreTracks();
  private readonly rails: BridgeRails;
  /** Height of the ground under the van when it last had wheels down (detects a big fall). */
  private groundY = 0;
  private landedFor = 0;
  private readonly chase: ChaseCamera;
  private readonly recovery = new RecoveryWatch();
  private snow: Snow;
  private post: THREE.RenderPipeline;
  private listeners: ((e: AppEvent) => void)[] = [];
  private hudListeners: ((s: HudSnapshot) => void)[] = [];
  private acc = 0;
  private last = -1;
  private fps = 60;
  /** Time for ambient animation (Ferris wheel). Frozen in paused test mode so screenshots repeat. */
  private sceneTime = 0;
  private simPaused: boolean;
  private readonly tmpV = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();

  private constructor(
    readonly renderer: THREE.WebGPURenderer,
    readonly backend: Backend,
    R: Rapier,
    readonly physics: RAPIER.World,
    readonly opts: AppOptions,
  ) {
    this.quality = new AdaptiveQuality(opts.quality, opts.isMobile);
    this.simPaused = opts.test && !opts.live;

    this.world = new WorldView(this.scene);
    buildColliders(R, physics, this.world.layout);

    const s = this.world.layout.start;
    this.van = new VanPhysics(R, physics, s.x, s.z, s.heading);
    this.scene.add(this.vanMesh.group, this.vanMesh.shadow, this.zone.group, this.zone.others, this.tracks.mesh);

    // Default target = next stop on a planned route by driving distance, not as the crow flies (Grund is below the Corniche).
    const nav = new NavGraph();
    this.game = new Game({
      seed: opts.seed,
      stops: this.world.layout.stops,
      start: s,
      distance: (from, stops) => {
        const y = from.y ?? (this.van ? this.van.body.translation().y : 0);
        return nav.distances(from.x, y, from.z, stops.map((st) => ({ x: st.zone.x, y: st.y, z: st.zone.z })));
      },
    });
    this.van.loadKg = this.game.loadKg;
    this.chase = new ChaseCamera(this.camera, R, physics);
    this.rails = new BridgeRails(R, physics);
    this.scene.add(this.rails.group);

    this.snow = new Snow(this.quality.settings.snowCount);
    this.scene.add(this.snow.mesh);
    this.post = createPost(renderer, this.scene, this.camera, this.quality.settings);
    this.applyQuality();

    // Settle the van on its wheels before the first frame.
    for (let i = 0; i < 30; i++) this.stepPhysics(FIXED_DT, true);
    this.syncVisuals(0);
  }

  static async create(canvas: HTMLCanvasElement, opts: AppOptions): Promise<App> {
    const [R, { renderer, backend }] = await Promise.all([
      loadRapier(),
      createRenderer(canvas, { forceWebGL: opts.forceWebGL, antialias: !opts.isMobile }),
    ]);
    const physics = new R.World({ x: 0, y: -9.81, z: 0 });
    physics.timestep = FIXED_DT;
    const app = new App(renderer, backend, R, physics, opts);
    app.resize();
    window.addEventListener('resize', () => app.resize());
    app.input.attach();
    // Compile shaders before the first visible frame to avoid a hitch.
    await renderer.compileAsync(app.scene, app.camera);
    renderer.setAnimationLoop((t) => app.frame(t));
    return app;
  }

  on(cb: (e: AppEvent) => void): () => void {
    this.listeners.push(cb);
    return () => (this.listeners = this.listeners.filter((l) => l !== cb));
  }

  onHud(cb: (s: HudSnapshot) => void): () => void {
    this.hudListeners.push(cb);
    return () => (this.hudListeners = this.hudListeners.filter((l) => l !== cb));
  }

  private emit(events: AppEvent[]): void {
    for (const e of events) for (const l of this.listeners) l(e);
  }

  start(): void {
    this.emit(this.game.start());
  }

  restart(seed = this.game.seed): void {
    const s = this.world.layout.start;
    this.van.teleport(s.x, s.z, s.heading);
    this.game.reset(seed);
    this.van.loadKg = this.game.loadKg;
    this.rails.reset();
    this.groundY = this.van.body.translation().y;
    this.chase.reset();
    this.recovery.reset();
  }

  teleport(x: number, z: number, heading: number): void {
    // On (or over) a road use the road surface, so the bridge deck wins over the valley below.
    const n = nearestRoad(x, z);
    const ground = n && n.dist < n.seg.road.halfWidth + 1 ? n.y : terrainHeight(x, z);
    this.van.teleport(x, z, heading, ground);
    for (let i = 0; i < 20; i++) this.stepPhysics(FIXED_DT, true);
    this.groundY = this.van.body.translation().y;
    this.landedFor = 0;
    this.chase.reset();
    this.recovery.reset();
  }

  /** Put a stuck or overturned van back on the nearest road, upright, facing its way. */
  recover(auto = false, reason: 'stuck' | 'fall' = 'stuck'): void {
    const p = this.van.body.translation();
    const r = recoveryPoint(p.x, p.y, p.z, this.van.heading);
    this.van.teleport(r.x, r.z, r.heading, r.y);
    this.chase.reset();
    this.recovery.reset();
    this.groundY = r.y;
    this.landedFor = 0;
    this.emit([{ type: 'recovered', auto, reason }]);
  }

  setCameraPreset(name: CameraPresetName | null): void {
    this.presetName = name;
    if (!name) {
      this.chase.reset();
      return;
    }
    const p = CAMERA_PRESETS[name];
    this.camera.position.set(...p.pos);
    this.camera.lookAt(...p.target);
    this.camera.fov = 56;
    this.camera.updateProjectionMatrix();
  }

  /** Fixed free camera (test hook only). Clear with setCameraPreset(null). */
  setCamera(pos: [number, number, number], target: [number, number, number]): void {
    this.presetName = '1-chase-start'; // any non-null value disables the chase camera
    this.camera.position.set(...pos);
    this.camera.lookAt(...target);
  }

  /** Advance the simulation by dt seconds in fixed steps (used by the loop and the ?test hook). */
  step(dt: number): void {
    let remaining = dt;
    while (remaining > 1e-9) {
      const h = Math.min(FIXED_DT, remaining);
      this.stepPhysics(h, false);
      remaining -= h;
    }
  }

  private stepPhysics(dt: number, settleOnly: boolean): void {
    // Before the start and after 6pm the van stays put: handbrake on, no player input.
    const input = settleOnly || this.game.phase !== 'driving' ? { steer: 0, throttle: 0, brake: 0, park: this.game.phase === 'ended' } : this.input.value;
    if (!settleOnly) {
      const p = this.van.body.translation();
      const v = this.van.body.linvel();
      if (this.rails.update(dt, { x: p.x, y: p.y, z: p.z, vx: v.x, vy: v.y, vz: v.z })) this.emit([{ type: 'parapetBroken' }]);
    }
    this.van.update(dt, input);
    this.physics.timestep = dt;
    this.physics.step();
    this.van.afterStep();
    if (settleOnly) return;
    if (this.van.impact > 3) this.emit([{ type: 'hit', strength: this.van.impact }, ...this.game.hit(this.van.impact)]);
    const wheels = this.van.wheelsOnGround();
    if (this.game.phase === 'driving' && this.recovery.update(dt, { upY: this.van.upY, speed: this.van.speed, wheelsOnGround: wheels })) {
      this.recover(true, this.groundY - this.van.body.translation().y > FALL_HEIGHT ? 'fall' : 'stuck');
      return;
    }
    // Over the parapet and down into the valley: a moment to take it in, then back on the bridge.
    if (wheels > 0) {
      const y = this.van.body.translation().y;
      if (this.groundY - y > FALL_HEIGHT) {
        this.landedFor += dt;
        if (this.game.phase === 'driving' && this.landedFor > 1.6) {
          this.recover(true, 'fall');
          return;
        }
      } else {
        this.groundY = y;
        this.landedFor = 0;
      }
    }
    const p = this.van.body.translation();
    const events = this.game.update(dt, { x: p.x, z: p.z, speed: this.van.speed });
    if (events.length) this.van.loadKg = this.game.loadKg;
    this.emit(events);
  }

  /** Stop picker: aim at this parcel. */
  select(id: string): void {
    if (this.game.select(id)) this.emit([{ type: 'targetChanged' }]);
  }

  /** Cycle the target through the parcels left, nearest first (keyboard Tab). */
  cycleTarget(): void {
    const left = this.game.remaining;
    if (left.length < 2) return;
    const p = this.van.body.translation();
    left.sort((a, b) => Math.hypot(a.stop.zone.x - p.x, a.stop.zone.z - p.z) - Math.hypot(b.stop.zone.x - p.x, b.stop.zone.z - p.z));
    const i = left.findIndex((q) => q.id === this.game.targetId);
    this.select(left[(i + 1) % left.length]!.id);
  }

  private frame(now: number): void {
    const t = now / 1000;
    const dt = this.last < 0 ? FIXED_DT : Math.min(0.1, t - this.last);
    this.last = t;
    this.fps += (1 / Math.max(dt, 1e-3) - this.fps) * 0.05;

    const change = this.quality.sample(dt * 1000);
    if (change) this.applyQuality();

    this.input.update(dt);
    if (this.input.takeRecover() && this.game.phase === 'driving') this.recover();
    if (this.input.takeCycle() && this.game.phase === 'driving') this.cycleTarget();
    if (this.game.phase === 'ready' && this.input.active && !this.opts.test && !this.paused) this.start();

    if (!this.simPaused && !this.paused) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= FIXED_DT && n < 5) {
        this.stepPhysics(FIXED_DT, false);
        this.acc -= FIXED_DT;
        n++;
      }
      if (n === 5) this.acc = 0;
    }

    if (!this.simPaused && !this.paused) this.sceneTime += dt;
    this.world.animateLandmarks(this.sceneTime, this.game.clock.minutes);
    const vp = this.van.body.translation();
    this.world.markets.update(this.simPaused || this.paused ? 0 : dt, { x: vp.x, z: vp.z, speed: this.van.speed });
    this.syncVisuals(dt);
    U.time.value = t;
    this.tracks.update(this.van.rearContacts(), t);
    this.snow.step(this.renderer, dt, this.game.clock.progress);
    this.post.render();
    this.publishHud();
  }

  private syncVisuals(dt: number): void {
    this.rails.syncDebris();
    const p = this.van.body.translation();
    const q = this.van.body.rotation();
    this.tmpV.set(p.x, p.y, p.z);
    this.tmpQ.set(q.x, q.y, q.z, q.w);
    const braking = this.input.value.brake > 0 && this.van.speed > 0.5;
    this.vanMesh.sync(this.tmpV, this.tmpQ, this.van.wheels(), braking);

    // Headlight uniforms (for snow flakes in the beam).
    const fwd = new THREE.Vector3(0, -0.06, 1).applyQuaternion(this.tmpQ).normalize();
    U.headPos.value.copy(this.tmpV).addScaledVector(fwd, 2.2).setY(p.y + 0.5);
    U.headDir.value.copy(fwd);

    const target = this.game.target;
    const live = this.game.phase !== 'ended';
    this.zone.place(target?.stop.zone.x ?? 0, target?.stop.y ?? 0, target?.stop.zone.z ?? 0, !!target && live);
    if (target) this.zone.tint.value.set(PARCEL_COLOR[target.type]);
    this.zone.placeOthers(
      live ? this.game.remaining.filter((q) => q !== target).map((q) => ({ x: q.stop.zone.x, y: q.stop.y, z: q.stop.zone.z, color: PARCEL_COLOR[q.type] })) : [],
    );
    this.zone.progress.value = this.game.handover.progress;

    if (!this.presetName) this.chase.update(dt || FIXED_DT, this.tmpV, this.van.heading, this.van.speed);
    this.world.update(this.game.clock.progress, this.presetName ? this.camera.position : this.tmpV, this.quality.settings.lampLights, this.camera.position, this.quality.settings.cullDistance);
  }

  private applyQuality(): void {
    const s = this.quality.settings;
    const dpr = Math.min(window.devicePixelRatio || 1, s.maxPixelRatio) * this.quality.renderScale;
    this.renderer.setPixelRatio(dpr);
    if (this.snow.count !== s.snowCount) {
      this.scene.remove(this.snow.mesh);
      this.snow.dispose();
      this.snow = new Snow(s.snowCount);
      this.scene.add(this.snow.mesh);
    }
    rebuildPost(this.post, this.scene, this.camera, s);
  }

  /** Match the canvas to the window. `force` re-applies it even if unchanged (recovers a blank canvas after a resume). */
  resize(force = false): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (force) this.renderer.setSize(w, Math.max(1, h - 1), false);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private publishHud(): void {
    if (this.hudListeners.length === 0) return;
    const g = this.game;
    const target = g.target;
    let t: HudSnapshot['target'] = null;
    if (target) {
      const z = target.stop.zone;
      const vp = this.van.body.translation();
      const world = new THREE.Vector3(z.x, target.stop.y + 1.5, z.z);
      const ndc = world.clone().project(this.camera);
      const behind = world.clone().sub(this.camera.position).dot(this.camera.getWorldDirection(this.tmpV)) < 0;
      const onScreen = !behind && Math.abs(ndc.x) < 0.9 && Math.abs(ndc.y) < 0.85;
      let nx = ndc.x;
      let ny = ndc.y;
      if (behind) {
        nx = -nx;
        ny = -Math.abs(ny) - 1;
      }
      t = {
        id: target.id,
        type: target.type,
        address: target.stop.address,
        dist: Math.hypot(z.x - vp.x, z.z - vp.z),
        x: (nx * 0.5 + 0.5) * 100,
        y: (-ny * 0.5 + 0.5) * 100,
        onScreen,
        angle: Math.atan2(-ny, nx),
      };
    }
    const info = this.renderer.info.render;
    const snap: HudSnapshot = {
      phase: g.phase,
      clock: g.clock.format(),
      minutesLeft: 120 - g.clock.minutes,
      progress: g.clock.progress,
      parcelsLeft: g.parcelsLeft,
      parcelsTotal: g.parcels.length,
      score: g.score,
      handover: g.handover.progress,
      target: t,
      debug: {
        fps: Math.round(this.fps),
        drawCalls: info.drawCalls,
        triangles: info.triangles,
        tier: this.quality.tier,
        scale: this.quality.renderScale,
        backend: this.backend,
      },
    };
    for (const l of this.hudListeners) l(snap);
  }
}
