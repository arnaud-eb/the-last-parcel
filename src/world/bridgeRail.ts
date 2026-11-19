/**
 * Pont Adolphe's parapets, breakable. Drive into one fast enough and the stone
 * gives way: the segment disappears, blocks tumble into the Pétrusse and the
 * van goes over (the app then puts it back on the road). Slower, the parapet
 * holds like a wall. Each 6 m segment is its own collider and instance.
 */
import * as THREE from 'three/webgpu';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { Rapier } from '../vehicle/rapier';
import { createRng, type Rng } from '../core/rng';
import { GeoBuilder } from './geo';
import { ROADS, VALLEYS } from './town';
import { propMaterial } from '../render/materials';

export type RailSegment = { x: number; z: number; len: number; y: number };

/** Speed toward the parapet (m/s) above which it breaks instead of stopping the van. */
export const BREAK_SPEED = 6.5;
const H = 0.95;
const DEBRIS_PER = 7;
const DEBRIS_MAX = 42;
const DEBRIS_LIFE = 9;
/** Debris collide with the ground and the van, not with camera rays. */
const DEBRIS_GROUPS = (0x0004 << 16) | 0xffff;

/** Parapet segments along both sides of the bridge deck, over the valley only (rim to rim). */
export function railSegments(): RailSegment[] {
  const r = ROADS.find((x) => x.bridge)!;
  const [ax, ay] = r.points[0]!;
  const { zNorth, zSouth } = VALLEYS.petrusse;
  const plen = zSouth - zNorth + 4;
  const pz = (zNorth + zSouth) / 2;
  const off = r.halfWidth + 0.5;
  const out: RailSegment[] = [];
  for (const s of [-1, 1]) {
    for (let z = -plen / 2; z < plen / 2 - 1e-6; z += 6) {
      const z1 = Math.min(plen / 2, z + 6);
      out.push({ x: ax + s * off, z: pz + (z + z1) / 2, len: z1 - z, y: ay });
    }
  }
  return out;
}

type Debris = { body: RAPIER.RigidBody; age: number };

export class BridgeRails {
  readonly group = new THREE.Group();
  private readonly segs = railSegments();
  private readonly colliders: (RAPIER.Collider | null)[] = [];
  private readonly mesh: THREE.InstancedMesh;
  private readonly debrisMesh: THREE.InstancedMesh;
  private debris: Debris[] = [];
  private rng: Rng = createRng('parapet');
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);
  /** Segments broken this shift. */
  broken = 0;

  constructor(private readonly R: Rapier, private readonly world: RAPIER.World) {
    const g = new GeoBuilder();
    g.merge(new THREE.BoxGeometry(0.4, H, 1), new THREE.Matrix4().makeTranslation(0, H / 2, 0), [0.66, 0.56, 0.4]);
    g.merge(new THREE.BoxGeometry(0.46, 0.08, 1), new THREE.Matrix4().makeTranslation(0, H + 0.04, 0), [0.85, 0.9, 1.0]);
    this.mesh = new THREE.InstancedMesh(g.build(), propMaterial(0.8), this.segs.length);
    this.mesh.name = 'bridge-parapets';
    const d = new GeoBuilder();
    d.merge(new THREE.BoxGeometry(0.34, 0.3, 0.6), new THREE.Matrix4(), [0.62, 0.53, 0.38]);
    this.debrisMesh = new THREE.InstancedMesh(d.build(), propMaterial(0.85), DEBRIS_MAX);
    this.debrisMesh.count = 0;
    this.debrisMesh.frustumCulled = false;
    this.debrisMesh.name = 'parapet-debris';
    this.group.add(this.mesh, this.debrisMesh);
    this.reset();
  }

  /** New shift: every segment back in place, debris cleared. */
  reset(): void {
    for (const c of this.colliders) if (c) this.world.removeCollider(c, false);
    this.colliders.length = 0;
    for (const d of this.debris) this.world.removeRigidBody(d.body);
    this.debris = [];
    this.broken = 0;
    this.rng = createRng('parapet');
    this.segs.forEach((s, i) => {
      this.colliders.push(
        this.world.createCollider(
          this.R.ColliderDesc.cuboid(0.2, 0.6, s.len / 2).setTranslation(s.x, s.y + 0.5, s.z).setCollisionGroups((0x0001 << 16) | 0xffff).setFriction(0.6),
        ),
      );
      this.mesh.setMatrixAt(i, this.m.makeScale(1, 1, s.len).setPosition(s.x, s.y, s.z));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.computeBoundingSphere();
    this.syncDebris();
  }

  /**
   * Before each physics step: a van about to hit a segment fast enough breaks it
   * (the collider goes before contact, so the van carries on through).
   */
  update(dt: number, van: { x: number; y: number; z: number; vx: number; vy: number; vz: number }): boolean {
    let broke = false;
    this.segs.forEach((s, i) => {
      if (!this.colliders[i]) return;
      if (Math.abs(van.z - s.z) > s.len / 2 + 1.2 || Math.abs(van.y - s.y) > 3) return;
      const toward = Math.sign(s.x - van.x) * van.vx;
      if (Math.abs(van.x - s.x) < 2.7 && toward > BREAK_SPEED) {
        this.breakSegment(i, van);
        broke = true;
      }
    });
    for (const d of this.debris) d.age += dt;
    const old = this.debris.filter((d) => d.age > DEBRIS_LIFE);
    if (old.length) {
      for (const d of old) this.world.removeRigidBody(d.body);
      this.debris = this.debris.filter((d) => d.age <= DEBRIS_LIFE);
    }
    return broke;
  }

  private breakSegment(i: number, van: { vx: number; vy: number; vz: number }): void {
    const s = this.segs[i]!;
    this.world.removeCollider(this.colliders[i]!, false);
    this.colliders[i] = null;
    this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
    this.mesh.instanceMatrix.needsUpdate = true;
    this.broken++;
    const r = this.rng;
    for (let k = 0; k < DEBRIS_PER; k++) {
      if (this.debris.length >= DEBRIS_MAX) this.world.removeRigidBody(this.debris.shift()!.body);
      const body = this.world.createRigidBody(
        this.R.RigidBodyDesc.dynamic()
          .setTranslation(s.x + r.range(-0.2, 0.2), s.y + r.range(0.2, 0.9), s.z + r.range(-s.len / 2, s.len / 2))
          .setLinvel(van.vx * r.range(0.4, 0.8), r.range(1, 3.5), van.vz * r.range(0.3, 0.7) + r.range(-1.5, 1.5))
          .setAngvel({ x: r.range(-4, 4), y: r.range(-4, 4), z: r.range(-4, 4) }),
      );
      this.world.createCollider(this.R.ColliderDesc.cuboid(0.17, 0.15, 0.3).setDensity(1800).setCollisionGroups(DEBRIS_GROUPS), body);
      this.debris.push({ body, age: 0 });
    }
  }

  /** After physics: move the debris instances to their bodies. */
  syncDebris(): void {
    this.debris.forEach((d, i) => {
      const t = d.body.translation();
      const q = d.body.rotation();
      this.debrisMesh.setMatrixAt(i, this.m.compose(this.p.set(t.x, t.y, t.z), this.q.set(q.x, q.y, q.z, q.w), this.one));
    });
    this.debrisMesh.count = this.debris.length;
    this.debrisMesh.instanceMatrix.needsUpdate = true;
  }
}
