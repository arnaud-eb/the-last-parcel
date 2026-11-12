import * as THREE from 'three/webgpu';
import { buildLayout, type Layout } from '../world/layout';
import { buildBuildings } from '../world/buildings';
import { buildStreet } from '../world/street';
import { buildLamps, buildLights, buildTree, lanternPosition } from '../world/props';
import { MAX_LAMPS, U } from './materials';
import { setupSky } from './sky';

/** The visual town: builds the scene once and updates per-frame lighting uniforms. */
export class WorldView {
  readonly layout: Layout;
  private readonly lanterns: THREE.Vector3[];
  private readonly sky: { update(progress: number): void };
  private readonly order: number[];

  constructor(readonly scene: THREE.Scene) {
    this.layout = buildLayout();
    scene.add(buildStreet());
    scene.add(buildBuildings(this.layout.buildings, this.layout.spires));
    scene.add(buildLamps(this.layout.lamps));
    scene.add(buildLights(this.layout.strings));
    scene.add(buildTree());
    this.sky = setupSky(scene);
    this.lanterns = this.layout.lamps.map(lanternPosition);
    this.order = this.lanterns.map((_, i) => i);
  }

  /**
   * Feed the nearest lamps (to `focus`) into the analytic lamp-light uniforms.
   * Sorted nearest-first: snow flakes only read the first few.
   */
  update(progress: number, focus: THREE.Vector3, lampLights: number): void {
    this.sky.update(progress);
    const d = (i: number) => this.lanterns[i]!.distanceToSquared(focus);
    this.order.sort((a, b) => d(a) - d(b));
    const n = Math.min(lampLights, MAX_LAMPS, this.order.length);
    const arr = U.lamps.array as THREE.Vector4[];
    for (let k = 0; k < MAX_LAMPS; k++) {
      const v = arr[k]!;
      if (k < n) {
        const p = this.lanterns[this.order[k]!]!;
        v.set(p.x, p.y, p.z, 1.6);
      } else {
        v.set(0, -1000, 0, 0);
      }
    }
    U.lampCount.value = n;
  }
}
