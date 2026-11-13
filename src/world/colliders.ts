import type { Rapier } from '../vehicle/rapier';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { Layout } from './layout';
import { landmarkColliders } from './landmarkBlocks';
import { TERRAIN, parapetSegments } from './parapets';
import { terrainHeight } from './terrain';
import { ROADS, VALLEYS } from './town';

/** Collision group for static scenery (camera rays only hit these). */
export const GROUP_STATIC = 0x0001;
export const GROUP_VAN = 0x0002;
/** Rapier interaction groups: (membership << 16) | filter. */
export const STATIC_GROUPS = (GROUP_STATIC << 16) | 0xffff;
export const VAN_GROUPS = (GROUP_VAN << 16) | 0xffff;
export const CAMERA_RAY_GROUPS = (0xffff << 16) | GROUP_STATIC;

/** Physics heightfield resolution (metres). Finer than the 4 m visual mesh so ramps are smooth. */
export const HEIGHTFIELD_STEP = 2;

function yawQuat(rot: number) {
  return { x: 0, y: Math.sin(rot / 2), z: 0, w: Math.cos(rot / 2) };
}

/** Heights sampled for Rapier: (nrows+1)×(ncols+1), column-major, rows along Z, columns along X. */
export function heightfieldData(): { nrows: number; ncols: number; heights: Float32Array; cx: number; cz: number; sx: number; sz: number } {
  const { x0, x1, z0, z1 } = TERRAIN;
  const ncols = Math.round((x1 - x0) / HEIGHTFIELD_STEP);
  const nrows = Math.round((z1 - z0) / HEIGHTFIELD_STEP);
  const heights = new Float32Array((nrows + 1) * (ncols + 1));
  for (let c = 0; c <= ncols; c++) {
    for (let r = 0; r <= nrows; r++) heights[c * (nrows + 1) + r] = terrainHeight(x0 + c * HEIGHTFIELD_STEP, z0 + r * HEIGHTFIELD_STEP);
  }
  return { nrows, ncols, heights, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, sx: x1 - x0, sz: z1 - z0 };
}

/** Static colliders for the town: terrain, bridge deck, parapets, buildings, lamps, landmarks, cliff rims, bounds. */
export function buildColliders(R: Rapier, world: RAPIER.World, layout: Layout): void {
  const add = (desc: RAPIER.ColliderDesc) => world.createCollider(desc.setCollisionGroups(STATIC_GROUPS).setFriction(0.6));

  const hf = heightfieldData();
  add(R.ColliderDesc.heightfield(hf.nrows, hf.ncols, hf.heights, { x: hf.sx, y: 1, z: hf.sz }).setTranslation(hf.cx, 0, hf.cz));

  // Bridge deck (the valley stays open below it).
  for (const r of ROADS.filter((x) => x.bridge)) {
    const [ax, ay, az] = r.points[0]!;
    const [bx, , bz] = r.points[r.points.length - 1]!;
    const len = Math.hypot(bx - ax, bz - az);
    const rot = Math.atan2(bx - ax, bz - az);
    add(R.ColliderDesc.cuboid(r.halfWidth + 0.7, 0.7, len / 2 + 2).setTranslation((ax + bx) / 2, ay - 0.7, (az + bz) / 2).setRotation(yawQuat(rot)));
    // Parapets only over the valley itself, rim to rim, so the junctions at both ends stay open.
    const { zNorth, zSouth } = VALLEYS.petrusse;
    const pz = (zNorth + zSouth) / 2;
    const plen = zSouth - zNorth + 4;
    for (const s of [-1, 1]) {
      const ox = Math.cos(rot) * s * (r.halfWidth + 0.5);
      add(R.ColliderDesc.cuboid(0.2, 0.6, plen / 2).setTranslation((ax + bx) / 2 + ox, ay + 0.5, pz).setRotation(yawQuat(rot)));
    }
  }

  for (const w of parapetSegments()) {
    const len = Math.hypot(w.bx - w.ax, w.bz - w.az);
    if (len < 0.5) continue;
    add(R.ColliderDesc.cuboid(0.22, 0.7, len / 2 + 0.1).setTranslation((w.ax + w.bx) / 2, w.y + 0.3, (w.az + w.bz) / 2).setRotation(yawQuat(Math.atan2(w.bx - w.ax, w.bz - w.az))));
  }

  for (const b of layout.buildings) {
    if (!b.solid) continue;
    add(R.ColliderDesc.cuboid(b.width / 2, b.height / 2, b.depth / 2).setTranslation(b.x, b.y + b.height / 2, b.z).setRotation(yawQuat(b.rot)));
  }
  for (const l of layout.lamps) add(R.ColliderDesc.cylinder(2.2, 0.14).setTranslation(l.x, l.y + 2.2, l.z));
  for (const c of landmarkColliders()) add(R.ColliderDesc.cylinder(c.height / 2, c.radius).setTranslation(c.x, c.y + c.height / 2, c.z));

  // Invisible walls along cliff rims, with gaps where streets go over or down them.
  const wall = (x: number, z: number, hx: number, hz: number, y = 0) => add(R.ColliderDesc.cuboid(hx, 3, hz).setTranslation(x, y + 2, z));
  const p = VALLEYS.petrusse;
  for (const zr of [p.zNorth - 1, p.zSouth + 1]) {
    wall((-220 - 6) / 2, zr, (220 - 6) / 2, 0.5); // west of the bridge
    wall((6 + 236) / 2, zr, (236 - 6) / 2, 0.5); // east of the bridge
  }
  const a = VALLEYS.alzette;
  // Beyond the Corniche parapet, north of where the switchbacks leave the rim.
  wall(a.xRim + 3, (-260 - 30) / 2, 0.5, (260 - 30) / 2);

  // Outer bounds.
  const { x0, x1, z0, z1 } = TERRAIN;
  const bound = (x: number, z: number, hx: number, hz: number) => add(R.ColliderDesc.cuboid(hx, 60, hz).setTranslation(x, 0, z));
  bound((x0 + x1) / 2, z0 + 4, (x1 - x0) / 2, 1);
  bound((x0 + x1) / 2, z1 - 4, (x1 - x0) / 2, 1);
  bound(x0 + 4, (z0 + z1) / 2, 1, (z1 - z0) / 2);
  bound(x1 - 4, (z0 + z1) / 2, 1, (z1 - z0) / 2);
}
