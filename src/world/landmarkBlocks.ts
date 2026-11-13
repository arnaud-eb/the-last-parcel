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
    // Wide and pale, four floors behind a columned portico (landmarks.ts).
    building(lm('hotelDeVille'), { width: 38, depth: 16, height: 15.6, color: CREAM, roofPitch: 0.35, seed: 0.21 }),
    // Long pale station with green copper roofs, end pavilions and the clock tower (landmarks.ts).
    building(lm('gare'), { width: 60, depth: 20, height: 15.6, color: PALE_STONE, roofPitch: 0.6, dormers: 2, seed: 0.83, roofColor: COPPER_ROOF }),
    building(lm('neumunster'), { width: 42, depth: 11, height: 9.6, color: GREY_STONE, roofPitch: 0.95, seed: 0.47, dormers: 2, floodlit: false }),
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

/** Extra colliders for pieces outside the main blocks (monument, wheel, tree, portico, tower). */
export function landmarkColliders(): { x: number; y: number; z: number; radius: number; height: number }[] {
  const g = lm('gelleFra');
  const w = lm('ferrisWheel');
  const t = lm('tree');
  const out = [
    { x: g.x, y: g.y, z: g.z, radius: 2.2, height: 22 },
    { x: w.x, y: w.y, z: w.z, radius: 3, height: 20 },
    { x: t.x, y: t.y, z: t.z, radius: 2.4, height: 6 },
  ];
  // Hôtel de Ville portico columns and lion plinths, out in Place Guillaume II (see landmarks.ts).
  const h = lm('hotelDeVille');
  const d = 8;
  const pd = 3.2;
  for (let i = 0; i < 6; i++) out.push({ ...toWorld(h, -8.75 + i * 3.5, -d - pd + 0.6), y: h.y, radius: 0.75, height: 10 });
  for (const s of [-1, 1]) out.push({ ...toWorld(h, s * 12.5, -d - pd - 1.6), y: h.y, radius: 1.5, height: 3 });
  // Gare clock tower, standing slightly proud of the front.
  const gare = lm('gare');
  out.push({ ...toWorld(gare, 18, -10 + 2.4), y: gare.y, radius: 3.4, height: 40 });
  return out;
}
