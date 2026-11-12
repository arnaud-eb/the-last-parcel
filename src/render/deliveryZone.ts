import * as THREE from 'three/webgpu';
import { atan, mix, positionLocal, sin, smoothstep, step, uniform, uv, vec3, vec4, PI } from 'three/tsl';
import { U } from './materials';

type N = any;

const GOLD = vec3(1.0, 0.72, 0.3);

/** Glowing ring on the ground + a soft beam of light, visible from down the street. */
export class DeliveryZoneView {
  readonly group = new THREE.Group();
  /** Hand-over progress 0..1, fills the ring. */
  readonly progress = uniform(0);

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
    ringMat.colorNode = vec4(GOLD.mul(ring.mul(pulse).mul(2.4).add(fill.mul(1.6)).add(inner)), 1);
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
    beamMat.colorNode = vec4(mix(GOLD, vec3(1.0, 0.9, 0.7), y).mul(fade.mul(shimmer).mul(0.22)), 1);
    beamMat.fog = false;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.35, radius * 0.6, h, 24, 1, true), beamMat);
    beam.position.y = h / 2;
    beam.renderOrder = 3;

    this.group.add(disc, beam);
    this.group.name = 'delivery-zone';
  }

  place(x: number, z: number, visible: boolean): void {
    this.group.position.set(x, 0, z);
    this.group.visible = visible;
  }
}
