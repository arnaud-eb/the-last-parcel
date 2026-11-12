import * as THREE from 'three/webgpu';
import type RAPIER from '@dimforge/rapier3d-compat';
import { Game, type GameEvent } from './core/game';
import { createRenderer, type Backend } from './render/renderer';
import { AdaptiveQuality, type QualitySetting } from './render/quality';
import { createPost, rebuildPost } from './render/post';
import { Snow } from './render/snow';
import { U } from './render/materials';
import { WorldView } from './render/world';
import { ChaseCamera } from './render/chaseCamera';
import { DeliveryZoneView } from './render/deliveryZone';
import { CAMERA_PRESETS, type CameraPresetName } from './render/cameraPresets';
import { loadRapier, type Rapier } from './vehicle/rapier';
import { VanPhysics } from './vehicle/van';
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

export type AppEvent = GameEvent | { type: 'hit'; strength: number };

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
  target: { address: string; dist: number; x: number; y: number; onScreen: boolean; angle: number } | null;
  debug: { fps: number; drawCalls: number; triangles: number; tier: string; scale: number; backend: Backend };
};

const FIXED_DT = 1 / 60;

export class App {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(56, 1, 0.1, 400);
  readonly game: Game;
  readonly van: VanPhysics;
  readonly input = new Input();
  readonly quality: AdaptiveQuality;
  readonly world: WorldView;
  presetName: CameraPresetName | null = null;

  private readonly vanMesh = new VanMesh();
  private readonly zone = new DeliveryZoneView();
  private readonly chase: ChaseCamera;
  private snow: Snow;
  private post: THREE.RenderPipeline;
  private listeners: ((e: AppEvent) => void)[] = [];
  private hudListeners: ((s: HudSnapshot) => void)[] = [];
  private acc = 0;
  private last = -1;
  private fps = 60;
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
    this.scene.add(this.vanMesh.group, this.vanMesh.shadow, this.zone.group);

    this.game = new Game({ seed: opts.seed, stops: this.world.layout.stops, parcelCount: 1 });
    this.chase = new ChaseCamera(this.camera, R, physics);

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
    this.game.reset(seed);
    const s = this.world.layout.start;
    this.van.teleport(s.x, s.z, s.heading);
    this.chase.reset();
  }

  teleport(x: number, z: number, heading: number): void {
    this.van.teleport(x, z, heading);
    for (let i = 0; i < 20; i++) this.stepPhysics(FIXED_DT, true);
    this.chase.reset();
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
    const input = settleOnly || this.game.phase !== 'driving' ? { steer: 0, throttle: 0, brake: this.game.phase === 'ended' ? 1 : 0 } : this.input.value;
    this.van.update(dt, input);
    this.physics.timestep = dt;
    this.physics.step();
    this.van.afterStep();
    if (settleOnly) return;
    if (this.van.impact > 3) this.emit([{ type: 'hit', strength: this.van.impact }]);
    const p = this.van.body.translation();
    this.emit(this.game.update(dt, { x: p.x, z: p.z, speed: this.van.speed }));
  }

  private frame(now: number): void {
    const t = now / 1000;
    const dt = this.last < 0 ? FIXED_DT : Math.min(0.1, t - this.last);
    this.last = t;
    this.fps += (1 / Math.max(dt, 1e-3) - this.fps) * 0.05;

    const change = this.quality.sample(dt * 1000);
    if (change) this.applyQuality();

    this.input.update(dt);
    if (this.game.phase === 'ready' && this.input.active && !this.opts.test) this.start();

    if (!this.simPaused) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= FIXED_DT && n < 5) {
        this.stepPhysics(FIXED_DT, false);
        this.acc -= FIXED_DT;
        n++;
      }
      if (n === 5) this.acc = 0;
    }

    this.syncVisuals(dt);
    U.time.value = t;
    this.snow.step(this.renderer, dt, this.game.clock.progress);
    this.post.render();
    this.publishHud();
  }

  private syncVisuals(dt: number): void {
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
    this.zone.place(target?.stop.zone.x ?? 0, target?.stop.zone.z ?? 0, !!target && this.game.phase !== 'ended');
    this.zone.progress.value = this.game.handover.progress;

    if (!this.presetName) this.chase.update(dt || FIXED_DT, this.tmpV, this.van.heading, this.van.speed);
    this.world.update(this.game.clock.progress, this.presetName ? this.camera.position : this.tmpV, this.quality.settings.lampLights);
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

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
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
      const world = new THREE.Vector3(z.x, 1.5, z.z);
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
