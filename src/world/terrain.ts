import { inPlaza, nearestRoad } from './roads';
import { VALLEYS, VALLEY_Y } from './town';

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** 0 on the plateau, 1 on a valley floor. */
export function valleyAmount(x: number, z: number): number {
  const p = VALLEYS.petrusse;
  const petrusse = smooth(p.zNorth, p.zNorth + p.cliff, z) * smooth(p.zSouth, p.zSouth - p.cliff, z) * smooth(p.xWest, p.xWest + 40, x);
  const a = VALLEYS.alzette;
  const alzette = smooth(a.xRim, a.xRim + a.cliff, x) * smooth(a.xEastRim, a.xEastRim - 24, x);
  return Math.max(petrusse, alzette);
}

/** Natural ground: plateau carved by the valleys. */
export function baseHeight(x: number, z: number): number {
  return VALLEY_Y * valleyAmount(x, z);
}

/** How far either side of a carriageway the ground is graded to the road. */
const GRADE = 3.5;

/**
 * Ground height including grading: flat under squares, and cut/filled to the
 * road surface under (and just beside) every street except bridges.
 */
export function terrainHeight(x: number, z: number): number {
  let h = baseHeight(x, z);
  const plaza = inPlaza(x, z, 2);
  if (plaza) return plaza.y - 0.03;
  const near = nearestRoad(x, z, (s) => !s.road.bridge);
  if (near) {
    const inner = near.seg.road.halfWidth + 2.2; // carriageway + sidewalk
    const w = 1 - smooth(inner, inner + GRADE, near.dist);
    h = h * (1 - w) + (near.y - 0.03) * w;
  }
  return h;
}
