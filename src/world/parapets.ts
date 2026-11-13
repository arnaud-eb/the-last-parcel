import { SIDEWALK, frameAt, inPlaza, onRoad, roadLength } from './roads';
import { baseHeight } from './terrain';
import { PLAZAS, ROADS } from './town';

export type WallSegment = { ax: number; az: number; bx: number; bz: number; y: number };

/** Low stone walls along cliff-edge streets and the valley-side edges of the viewpoint squares. */
export function parapetSegments(): WallSegment[] {
  const out: WallSegment[] = [];
  for (const r of ROADS) {
    if (!r.parapet) continue;
    const side = r.parapet === 'right' ? 1 : -1;
    const len = roadLength(r);
    for (let s = 0; s < len; s += 4) {
      const a = frameAt(r, s);
      const b = frameAt(r, Math.min(len, s + 4));
      const off = (r.halfWidth + SIDEWALK + 0.4) * side;
      const ax = a.x + a.nx * off;
      const az = a.z + a.nz * off;
      if (onRoad(ax, az, 0.5, r) || inPlaza(ax, az, 0.5)) continue;
      out.push({ ax, az, bx: b.x + b.nx * off, bz: b.z + b.nz * off, y: a.y });
    }
  }
  for (const p of PLAZAS) {
    if (p.open?.includes('s') && baseHeight(p.x, p.z + p.hz + 12) < -5) out.push({ ax: p.x - p.hx, az: p.z + p.hz + 0.3, bx: p.x + p.hx, bz: p.z + p.hz + 0.3, y: p.y });
    if (p.open?.includes('e') && baseHeight(p.x + p.hx + 12, p.z) < -5) out.push({ ax: p.x + p.hx + 0.3, az: p.z - p.hz, bx: p.x + p.hx + 0.3, bz: p.z + p.hz, y: p.y });
  }
  return out;
}

/** The ground grid shared by the terrain mesh and the physics heightfield. */
export const TERRAIN = { x0: -224, x1: 448, z0: -288, z1: 432 };
