import * as THREE from 'three/webgpu';
import {
  Fn, cameraPosition, dot, float, hash, instanceIndex, instancedArray, length, max, mix, mod, normalize, pow,
  sin, smoothstep, uniform, uv, varying, vec2, vec3, vec4,
} from 'three/tsl';
import { LAMP_COLOR, U } from './materials';

type N = any;

const BOX = 44; // horizontal extent around the camera
const BOX_H = 22;

/**
 * Falling snow: positions live in a GPU storage buffer and are advanced by a
 * compute shader each frame. Flakes wrap around the camera, so a fixed number
 * of them always fills the view. Flakes catch lamp light and the van's headlights.
 */
export class Snow {
  readonly mesh: THREE.Sprite;
  private readonly update: N;
  private readonly init: N;
  private readonly dt = uniform(0);
  private readonly intensity = uniform(1);
  private initialised = false;

  constructor(readonly count: number) {
    const pos = instancedArray(count, 'vec3') as N;
    const i = instanceIndex as N;

    this.init = Fn(() => {
      const p = pos.element(i);
      p.assign(vec3(hash(i).mul(BOX), hash(i.add(7919)).mul(BOX_H), hash(i.add(104729)).mul(BOX)));
    })().compute(count);

    this.update = Fn(() => {
      const p = pos.element(i);
      const r = hash(i.add(31));
      const fall = mix(0.7, 1.5, r);
      const t = U.time as N;
      const sway = vec3(sin(t.mul(mix(0.6, 1.4, r)).add(r.mul(40))).mul(0.45).add(0.35), fall.negate(), sin(t.mul(0.9).add(r.mul(17))).mul(0.3));
      const np = p.add(sway.mul(this.dt));
      p.assign(vec3(mod(np.x, BOX), mod(np.y, BOX_H), mod(np.z, BOX)));
    })().compute(count);

    // Wrap the stored position into a box centred on the camera.
    const raw = pos.element(i);
    const half = vec3(BOX / 2, 6, BOX / 2);
    const base = (cameraPosition as N).sub(half);
    const world = base.add(mod(raw.sub(base), vec3(BOX, BOX_H, BOX)));

    // Lighting per flake, evaluated in the vertex stage: nearest 4 lamps + headlight cone.
    const light = varying(Fn(() => {
      const acc = vec3(0.32, 0.38, 0.55).toVar();
      for (let k = 0; k < 4; k++) {
        const l = U.lamps.element(k) as N;
        const d2 = dot(l.xyz.sub(world), l.xyz.sub(world));
        acc.addAssign(LAMP_COLOR.mul(l.w.mul(1.6).div(d2.mul(0.5).add(1))));
      }
      const toFlake = world.sub(U.headPos);
      const dist = length(toFlake);
      const cosA = dot(normalize(toFlake), U.headDir);
      const beam = smoothstep(0.86, 0.96, cosA).mul(smoothstep(26, 2, dist)).mul(U.headOn);
      acc.addAssign(vec3(1.0, 0.92, 0.8).mul(beam.mul(3.5)));
      return acc;
    })());

    const camDist = length(world.sub(cameraPosition));
    const fade = smoothstep(0.4, 1.6, camDist).mul(smoothstep(BOX / 2, BOX / 2 - 6, camDist));

    const m = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false });
    m.positionNode = world;
    m.scaleNode = mix(0.035, 0.075, hash(i.add(3))) as N;
    const d = length((uv() as N).sub(vec2(0.5)));
    const disc = pow(max(float(1).sub(d.mul(2)), 0), 1.5);
    m.colorNode = vec4(light, disc.mul(fade).mul(this.intensity).mul(0.9));
    m.fog = true;

    this.mesh = new THREE.Sprite(m);
    this.mesh.count = count;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'snowfall';
  }

  /** Snowfall gets heavier toward 6pm. */
  step(renderer: THREE.WebGPURenderer, dt: number, progress: number): void {
    if (!this.initialised) {
      renderer.compute(this.init);
      this.initialised = true;
    }
    this.dt.value = dt;
    this.intensity.value = 0.65 + progress * 0.45;
    renderer.compute(this.update);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
