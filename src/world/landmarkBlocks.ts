/**
 * The main block of each landmark, as a regular Building (windows, relief,
 * collider). Pure data, no three.js. Silhouette pieces are in landmarks.ts.
 */
import type { Building } from './layout';
import { LANDMARKS, type Landmark, type LandmarkId } from './town';

type Rgb = [number, number, number];
const SANDSTONE: Rgb = [0.66, 0.56, 0.4];
const CREAM: Rgb = [0.9, 0.86, 0.74];
const GREY_STONE: Rgb = [0.6, 0.58, 0.54];
const PALE_STONE: Rgb = [0.72, 0.62, 0.46];
export const COPPER_ROOF: Rgb = [0.2, 0.42, 0.34];

export const lm = (id: LandmarkId): Landmark => LANDMARKS.find((l) => l.id === id)!;

function building(l: Landmark, o: Partial<Building> & Pick<Building, 'width' | 'depth' | 'height' | 'color'>): Building {
  return {
    x: l.x, y: l.y, z: l.z, rot: l.rot,
    ridgeAlong: true, roofPitch: 0.9, seed: 0.37, solid: true, chimney: false,
    shop: false, doorCol: Math.floor(o.width / 2.6 / 2), shutters: -1, relief: true, dormers: 0, street: null, floodlit: true,
    ...o,
  };
}

/** The main blocks, added to the layout's buildings. */
export function landmarkBuildings(): Building[] {
  return [
    building(lm('cathedral'), { width: 24, depth: 52, height: 15, color: SANDSTONE, ridgeAlong: false, roofPitch: 1.1, plain: true, relief: false }),
    // Five tall floors under a steep slate roof: a head above the old-town houses around it.
    building(lm('palais'), { width: 36, depth: 16, height: 18.6, color: SANDSTONE, roofPitch: 1.2, dormers: 2, seed: 0.62 }),
    // Wide and pale, four floors, front steps and lions (landmarks.ts).
    building(lm('hotelDeVille'), { width: 38, depth: 16, height: 15.6, color: CREAM, roofPitch: 0.35, seed: 0.21 }),
    ...gareBlocks(),
    building(lm('neumunster'), { width: 42, depth: 11, height: 9.6, color: GREY_STONE, roofPitch: 0.95, seed: 0.47, dormers: 2, floodlit: false }),
  ];
}

/** Gare clock tower, in the station's local frame (front faces local -Z). Shared with landmarks.ts. */
export const GARE_TOWER = { x: 17.5, z: -8, half: 4, height: 40 };

/**
 * The station, 60 m long: tall end pavilions with steep copper roofs, two wings,
 * a central hall with a big arched window (glass added in landmarks.ts), and the
 * plain stone clock tower standing proud of the front near the east end.
 */
function gareBlocks(): Building[] {
  const l = lm('gare');
  const at = (dx: number, dz: number, o: Parameters<typeof building>[1]): Building => ({ ...building(l, o), ...toWorld(l, dx, dz) });
  const base = { color: PALE_STONE, roofColor: COPPER_ROOF };
  return [
    ...[-1, 1].map((s, i) => at(s * 25.5, -0.5, { ...base, width: 9, depth: 21, height: 19.6, ridgeAlong: false, roofPitch: 1.3, seed: 0.81 + i * 0.05 })),
    ...[-1, 1].map((s, i) => at(s * 14.5, 0, { ...base, width: 13, depth: 20, height: 15.6, roofPitch: 0.6, dormers: 2, seed: 0.71 + i * 0.05 })),
    at(0, -0.3, { ...base, width: 16, depth: 20.6, height: 19.6, ridgeAlong: false, roofPitch: 0.55, plain: true, relief: false, seed: 0.9 }),
    at(GARE_TOWER.x, GARE_TOWER.z, { ...base, width: GARE_TOWER.half * 2, depth: GARE_TOWER.half * 2, height: GARE_TOWER.height, roofPitch: 0.05, plain: true, relief: false, seed: 0.93 }),
  ];
}

/**
 * Generated buildings within `radius` of these landmarks are capped at `maxHeight`
 * (old-town houses go up to ~19.6 m), so the landmark stands out on its street.
 */
export const LANDMARK_SKYLINE: { x: number; z: number; radius: number; maxHeight: number }[] = (
  [['palais', 40, 12.6], ['hotelDeVille', 40, 12.6], ['gare', 60, 12.6]] as const
).map(([id, radius, maxHeight]) => ({ x: lm(id).x, z: lm(id).z, radius, maxHeight }));

/** Local (x, z) of a landmark to world, same convention as three.js rotation.y. */
function toWorld(l: Landmark, x: number, z: number): { x: number; z: number } {
  const c = Math.cos(l.rot);
  const s = Math.sin(l.rot);
  return { x: l.x + x * c + z * s, z: l.z - x * s + z * c };
}

/** Extra colliders for pieces outside the main blocks (monument, wheel, tree, lions). */
export function landmarkColliders(): { x: number; y: number; z: number; radius: number; height: number }[] {
  const g = lm('gelleFra');
  const w = lm('ferrisWheel');
  const t = lm('tree');
  const out = [
    { x: g.x, y: g.y, z: g.z, radius: 2.2, height: 22 },
    { x: w.x, y: w.y, z: w.z, radius: 3, height: 34 },
    { x: t.x, y: t.y, z: t.z, radius: 2.4, height: 6 },
  ];
  // Hôtel de Ville lion plinths, out in Place Guillaume II (see landmarks.ts).
  const h = lm('hotelDeVille');
  const d = 8;
  const pd = 0;
  for (const s of [-1, 1]) out.push({ ...toWorld(h, s * 12.5, -d - pd - 1.6), y: h.y, radius: 1.5, height: 3 });
  return out;
}
