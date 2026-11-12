import * as THREE from 'three/webgpu';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { Rapier } from '../vehicle/rapier';
import { CAMERA_RAY_GROUPS } from '../world/colliders';

const BASE_DIST = 6.4;
const BASE_HEIGHT = 3.1;
const BASE_FOV = 56;

/**
 * Behind and above the van. Lags slightly on turns, pulls back at speed,
 * and is pushed in by a ray against the buildings so it never clips through them.
 */
export class ChaseCamera {
  private yaw = 0;
  private readonly pos = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private initialised = false;
  private dist = BASE_DIST;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly R: Rapier,
    private readonly world: RAPIER.World,
  ) {}

  reset(): void {
    this.initialised = false;
  }

  update(dt: number, van: THREE.Vector3, heading: number, speed: number): void {
    if (!this.initialised) {
      this.yaw = heading;
      this.dist = BASE_DIST;
    }
    // Yaw follows the heading with a slight lag.
    const dy = Math.atan2(Math.sin(heading - this.yaw), Math.cos(heading - this.yaw));
    this.yaw += dy * (1 - Math.exp(-dt * 4.5));

    const fast = Math.min(1, Math.abs(speed) / 16);
    const wantDist = BASE_DIST + fast * 2.6;
    this.dist += (wantDist - this.dist) * (1 - Math.exp(-dt * 2));
    const height = BASE_HEIGHT + fast * 0.5;

    const pivot = new THREE.Vector3(van.x, van.y + 1.6, van.z);
    const desired = new THREE.Vector3(
      van.x - Math.sin(this.yaw) * this.dist,
      van.y + height,
      van.z - Math.cos(this.yaw) * this.dist,
    );

    // Pull in if a wall is between the van and the camera.
    const dir = desired.clone().sub(pivot);
    const len = dir.length();
    dir.divideScalar(len);
    const hit = this.world.castRay(new this.R.Ray(pivot, dir), len + 0.5, true, undefined, CAMERA_RAY_GROUPS);
    let target = desired;
    if (hit && hit.timeOfImpact < len + 0.5) {
      target = pivot.clone().addScaledVector(dir, Math.max(0.8, hit.timeOfImpact - 0.5));
    }

    if (!this.initialised) {
      this.pos.copy(target);
      this.initialised = true;
    } else {
      // Smooth, but never let smoothing drag the camera into a wall.
      this.pos.lerp(target, 1 - Math.exp(-dt * 8));
      if (target.distanceTo(pivot) < this.pos.distanceTo(pivot)) this.pos.copy(target);
    }

    this.look.set(van.x + Math.sin(this.yaw) * 4, van.y + 1.1, van.z + Math.cos(this.yaw) * 4);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
    const fov = BASE_FOV + fast * 7;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
