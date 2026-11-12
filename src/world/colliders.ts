import type { Rapier } from '../vehicle/rapier';
import type RAPIER from '@dimforge/rapier3d-compat';
import { CURB_HEIGHT, ROAD_HALF, SIDEWALK, STREET_Z_END, STREET_Z_START, TREE, centerX, frameAt, type Layout } from './layout';

/** Collision group for static scenery (camera rays only hit these). */
export const GROUP_STATIC = 0x0001;
export const GROUP_VAN = 0x0002;
/** Rapier interaction groups: (membership << 16) | filter. */
export const STATIC_GROUPS = (GROUP_STATIC << 16) | 0xffff;
export const VAN_GROUPS = (GROUP_VAN << 16) | 0xffff;
export const CAMERA_RAY_GROUPS = (0xffff << 16) | GROUP_STATIC;

function yawQuat(rot: number) {
  return { x: 0, y: Math.sin(rot / 2), z: 0, w: Math.cos(rot / 2) };
}

/** Static colliders for the town: ground, buildings, curbs, lamp posts, tree, outer bounds. */
export function buildColliders(R: Rapier, world: RAPIER.World, layout: Layout): void {
  const add = (desc: RAPIER.ColliderDesc) => world.createCollider(desc.setCollisionGroups(STATIC_GROUPS).setFriction(0.6));

  add(R.ColliderDesc.cuboid(300, 0.5, 300).setTranslation(0, -0.5, 0));

  for (const b of layout.buildings) {
    if (!b.solid) continue;
    add(R.ColliderDesc.cuboid(b.width / 2, b.height / 2, b.depth / 2).setTranslation(b.x, b.height / 2, b.z).setRotation(yawQuat(b.rot)));
  }

  // Sidewalks as low boxes the wheels can ride up onto.
  const seg = 2;
  for (let z = STREET_Z_START + 12; z > STREET_Z_END; z -= seg) {
    const cz = z - seg / 2;
    const f = frameAt(cz);
    const rot = Math.atan2(f.tx, f.tz);
    for (const s of [-1, 1]) {
      const lat = s * (ROAD_HALF + SIDEWALK / 2 + 0.3);
      add(
        R.ColliderDesc.cuboid(SIDEWALK / 2 + 0.3, CURB_HEIGHT / 2, seg / 2 + 0.02)
          .setTranslation(centerX(cz) + f.nx * lat, CURB_HEIGHT / 2, cz + f.nz * lat)
          .setRotation(yawQuat(rot)),
      );
    }
  }

  for (const l of layout.lamps) add(R.ColliderDesc.cylinder(2.2, 0.14).setTranslation(l.x, 2.2, l.z));
  add(R.ColliderDesc.cylinder(3, 2.4).setTranslation(TREE.x, 3, TREE.z));

  // Outer bounds, in case of gaps between buildings.
  const wall = (x: number, z: number, hx: number, hz: number) => add(R.ColliderDesc.cuboid(hx, 10, hz).setTranslation(x, 10, z));
  wall(0, STREET_Z_START + 12, 40, 1);
  wall(0, -82, 40, 1);
  wall(-31, 0, 1, 100);
  wall(31, 0, 1, 100);
}
