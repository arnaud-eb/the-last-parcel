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

export const lm = (id: LandmarkId): Landmark => LANDMARKS.find((l) => l.id === id)!;

function building(l: Landmark, o: Partial<Building> & Pick<Building, 'width' | 'depth' | 'height' | 'color'>): Building {
  return {
    x: l.x, y: l.y, z: l.z, rot: l.rot,
    ridgeAlong: true, roofPitch: 0.9, seed: 0.37, solid: true, chimney: false,
    shop: false, doorCol: Math.floor(o.width / 2.6 / 2), shutters: -1, relief: true, dormers: 0, street: null,
    ...o,
  };
}

/** The main blocks, added to the layout's buildings. */
export function landmarkBuildings(): Building[] {
  return [
    building(lm('cathedral'), { width: 24, depth: 52, height: 15, color: SANDSTONE, ridgeAlong: false, roofPitch: 1.1, plain: true, relief: false }),
    building(lm('palais'), { width: 36, depth: 16, height: 12.6, color: SANDSTONE, roofPitch: 1.05, dormers: 2, seed: 0.62 }),
    building(lm('hotelDeVille'), { width: 38, depth: 16, height: 7.4, color: CREAM, roofPitch: 0.3, seed: 0.21 }),
    building(lm('gare'), { width: 60, depth: 20, height: 9.6, color: SANDSTONE, roofPitch: 0.55, dormers: 2, seed: 0.83 }),
    building(lm('neumunster'), { width: 42, depth: 11, height: 9.6, color: GREY_STONE, roofPitch: 0.95, seed: 0.47, dormers: 2 }),
  ];
}

/** Extra colliders for pieces outside the main blocks (monument, wheel, tree). */
export function landmarkColliders(): { x: number; y: number; z: number; radius: number; height: number }[] {
  const g = lm('gelleFra');
  const w = lm('ferrisWheel');
  const t = lm('tree');
  return [
    { x: g.x, y: g.y, z: g.z, radius: 2.2, height: 22 },
    { x: w.x, y: w.y, z: w.z, radius: 3, height: 20 },
    { x: t.x, y: t.y, z: t.z, radius: 2.4, height: 6 },
  ];
}

