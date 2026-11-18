import * as THREE from 'three/webgpu';
import { attribute, float, smoothstep, uv, vec3, vec4 } from 'three/tsl';
import { U } from './materials';

type N = any;

/** Track marks kept per wheel; the oldest are reused. */
const PER_WHEEL = 360;
/** A new mark every this many metres. */
const STEP = 0.45;
/** Seconds for fresh snow to cover a track. */
const FADE = 70;

/**
 * Tyre tracks: dark, flattened marks in the slush behind the rear wheels,
 * slowly filling in with fresh snow. One instanced draw for both wheels.
 */
export class TyreTracks {
  readonly mesh: THREE.InstancedMesh;
  private readonly born: THREE.InstancedBufferAttribute;
  private readonly last: (THREE.Vector3 | null)[] = [null, null];
  private next = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor() {
    const n = PER_WHEEL * 2;
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.born = new THREE.InstancedBufferAttribute(new Float32Array(n).fill(-1e6), 1);
    geo.setAttribute('aBorn', this.born);
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const age = (U.time as N).sub(attribute('aBorn', 'float') as N);
    // Tread: faint bars across the mark; edges soft.
    const p = uv() as N;
    const edge = smoothstep(0.0, 0.2, p.x).mul(smoothstep(1.0, 0.8, p.x));
    const tread = float(0.75).add(float(0.25).mul(smoothstep(0.3, 0.7, p.y.mul(6).fract())));
    const alpha = edge.mul(tread).mul(smoothstep(FADE, 0, age)).mul(0.42);
    mat.colorNode = vec4(vec3(0.035, 0.04, 0.055), alpha);
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.name = 'tyre-tracks';
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < n; i++) this.mesh.setMatrixAt(i, this.m);
  }

  /** Feed the rear wheels' ground contact points (null when in the air), and the clock. */
  update(contacts: readonly ({ x: number; y: number; z: number } | null)[], time: number): void {
    let changed = false;
    contacts.forEach((c, w) => {
      if (!c) {
        this.last[w] = null;
        return;
      }
      const prev = this.last[w];
      if (!prev) {
        this.last[w] = new THREE.Vector3(c.x, c.y, c.z);
        return;
      }
      const dx = c.x - prev.x;
      const dz = c.z - prev.z;
      const d = Math.hypot(dx, dz);
      if (d < STEP) return;
      if (d > 4) {
        // Teleported or recovered: start a fresh track.
        prev.set(c.x, c.y, c.z);
        return;
      }
      const i = this.next;
      this.next = (this.next + 1) % (PER_WHEEL * 2);
      this.q.setFromAxisAngle(this.up, Math.atan2(dx, dz));
      this.m.compose(new THREE.Vector3((c.x + prev.x) / 2, (c.y + prev.y) / 2 + 0.025, (c.z + prev.z) / 2), this.q, new THREE.Vector3(0.24, 1, d + 0.04));
      this.mesh.setMatrixAt(i, this.m);
      this.born.setX(i, time);
      prev.set(c.x, c.y, c.z);
      changed = true;
    });
    if (changed) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.born.needsUpdate = true;
    }
  }
}
