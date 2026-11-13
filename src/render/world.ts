import * as THREE from 'three/webgpu';
import { buildLayout, type Layout } from '../world/layout';
import { buildBuildings } from '../world/buildings';
import { buildRelief } from '../world/relief';
import { buildStreet } from '../world/street';
import { buildLamps, buildLights, lanternPosition } from '../world/props';
import { buildLandmarkExtras } from '../world/landmarks';
import { lm } from '../world/landmarkBlocks';
import { MAX_LAMPS, U } from './materials';
import { setupSky } from './sky';

const LAMP_INTENSITY = 5.0;

/** The visual town: builds the scene once and updates per-frame lighting uniforms. */
export class WorldView {
  readonly layout: Layout;
  private readonly lanterns: THREE.Vector3[];
  private readonly sky: { update(progress: number): void };
  private readonly order: number[];
  /** Chunk-sized meshes hidden beyond the fog (landmarks are exempt so the spires stay visible). */
  private readonly cullable: { obj: THREE.Object3D; center: THREE.Vector3; radius: number }[] = [];

  /** Moving set pieces (the Ferris wheel), driven by scene time in seconds. */
  readonly animateLandmarks: (time: number) => void;

  constructor(readonly scene: THREE.Scene) {
    this.layout = buildLayout();
    scene.add(buildStreet());
    scene.add(buildBuildings(this.layout.buildings));
    scene.add(buildRelief(this.layout.buildings));
    const landmarks = buildLandmarkExtras();
    this.animateLandmarks = landmarks.userData.update as (time: number) => void;
    scene.add(landmarks);
    scene.add(buildLamps(this.layout.lamps));
    scene.add(buildLights(this.layout.strings, lm('tree')));
    this.sky = setupSky(scene);
    scene.updateMatrixWorld(true);
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || isInside(o, landmarks)) return;
      const geo = mesh.geometry;
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      const sphere = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).boundingSphere : geo.boundingSphere;
      if (!sphere || sphere.radius > 160) return; // terrain-wide or unbounded meshes stay
      this.cullable.push({ obj: o, center: sphere.center.clone().applyMatrix4(o.matrixWorld), radius: sphere.radius });
    });
    this.lanterns = this.layout.lamps.map(lanternPosition);
    this.order = this.lanterns.map((_, i) => i);
  }

  /**
   * Feed the nearest lamps (to `focus`) into the analytic lamp-light uniforms.
   * Sorted nearest-first: snow flakes only read the first few.
   */
  update(progress: number, focus: THREE.Vector3, lampLights: number, camera: THREE.Vector3, cullDistance: number): void {
    this.sky.update(progress);
    for (const c of this.cullable) c.obj.visible = c.center.distanceTo(camera) - c.radius < cullDistance;
    const d = (i: number) => this.lanterns[i]!.distanceToSquared(focus);
    this.order.sort((a, b) => d(a) - d(b));
    const n = Math.min(lampLights, MAX_LAMPS, this.order.length);
    const arr = U.lamps.array as THREE.Vector4[];
    for (let k = 0; k < MAX_LAMPS; k++) {
      const v = arr[k]!;
      if (k < n) {
        const p = this.lanterns[this.order[k]!]!;
        v.set(p.x, p.y, p.z, LAMP_INTENSITY);
      } else {
        v.set(0, -1000, 0, 0);
      }
    }
    U.lampCount.value = n;
  }
}

function isInside(o: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === root) return true;
  return false;
}
