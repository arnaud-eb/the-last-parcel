import * as THREE from 'three/webgpu';
import { atan, mix, positionLocal, sin, smoothstep, step, uniform, uv, vec3, vec4, PI } from 'three/tsl';
import { U } from './materials';

type N = any;

/**
 * A glowing ring at the door of every parcel still in the van, in the parcel type's colour.
 * The chosen stop also gets a beam of light, visible from down the street.
 */
export class DeliveryZoneView {
  readonly group = new THREE.Group();
  /** Hand-over progress 0..1, fills the ring. */
  readonly progress = uniform(0);
  /** Colour of the chosen stop's ring (its parcel type). */
  readonly tint = uniform(new THREE.Color(1, 0.72, 0.3));

  constructor() {
    const radius = 2.8;
    const ringMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const p = (uv() as N).sub(0.5).mul(2);
    const r = p.length();
    const ang = atan(p.y, p.x).div(PI.mul(2)).add(0.5);
    const pulse = sin((U.time as N).mul(3)).mul(0.25).add(0.75);
    const ring = smoothstep(0.82, 0.9, r).mul(smoothstep(1.0, 0.93, r));
    const fill = step(ang, this.progress).mul(smoothstep(0.93, 0.6, r)).mul(step(0.001, this.progress));
    const inner = smoothstep(0.9, 0.0, r).mul(0.12);
    ringMat.colorNode = vec4((this.tint as N).mul(ring.mul(pulse).mul(2.4).add(fill.mul(1.6)).add(inner)), 1);
    ringMat.fog = false;
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), ringMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.04;
    disc.renderOrder = 3;

    const h = 26;
    const beamMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const y = (positionLocal as N).y.div(h).add(0.5);
    const fade = smoothstep(1.0, 0.0, y).mul(smoothstep(0.0, 0.03, y));
    const shimmer = sin(y.mul(40).sub((U.time as N).mul(2.5))).mul(0.15).add(0.85);
    beamMat.colorNode = vec4(mix(this.tint as N, vec3(1.0, 0.9, 0.7), y).mul(fade.mul(shimmer).mul(0.13)), 1);
    beamMat.fog = false;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.35, radius * 0.6, h, 24, 1, true), beamMat);
    beam.position.y = h / 2;
    beam.renderOrder = 3;

    this.group.add(disc, beam);
    this.group.name = 'delivery-zone';

    // The other parcels' doors: the same ring (deliverable too), coloured per instance, one draw.
    const dimMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    dimMat.colorNode = vec4(vec3(1).mul(ring.mul(pulse).mul(2.4).add(inner)), 1);
    dimMat.fog = false;
    const plane = new THREE.PlaneGeometry(radius * 2, radius * 2).rotateX(-Math.PI / 2);
    this.others = new THREE.InstancedMesh(plane, dimMat, DeliveryZoneView.MAX_OTHERS);
    // Created up front so the shader is compiled with per-instance colour.
    this.others.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(DeliveryZoneView.MAX_OTHERS * 3).fill(1), 3);
    this.others.count = 0;
    this.others.renderOrder = 3;
    this.others.frustumCulled = false;
    this.others.name = 'delivery-zones';
  }

  static readonly MAX_OTHERS = 24;
  /** Dim rings at the other undelivered stops. Add to the scene next to `group`. */
  readonly others: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private readonly c = new THREE.Color();
  private othersKey = '';

  place(x: number, y: number, z: number, visible: boolean): void {
    this.group.position.set(x, y, z);
    this.group.visible = visible;
  }

  /** Rings at these stops (zone centre, ground height, colour). Cheap to call every frame. */
  placeOthers(stops: readonly { x: number; y: number; z: number; color: string }[]): void {
    const key = stops.map((s) => `${s.x},${s.z}`).join(';');
    if (key === this.othersKey) return;
    this.othersKey = key;
    const n = Math.min(stops.length, DeliveryZoneView.MAX_OTHERS);
    for (let i = 0; i < n; i++) {
      this.others.setMatrixAt(i, this.m.makeTranslation(stops[i]!.x, stops[i]!.y + 0.05, stops[i]!.z));
      this.others.setColorAt(i, this.c.set(stops[i]!.color));
    }
    this.others.count = n;
    this.others.instanceMatrix.needsUpdate = true;
    if (this.others.instanceColor) this.others.instanceColor.needsUpdate = true;
  }
}
