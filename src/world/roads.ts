import { PLAZAS, ROADS, type Plaza, type Road } from './town';

export const SIDEWALK = 2.0;
export const CURB_HEIGHT = 0.14;

export type Segment = {
  road: Road;
  roadIndex: number;
  ax: number; ay: number; az: number;
  bx: number; by: number; bz: number;
  /** Arc length at a, along the whole road. */
  s0: number;
  len: number;
};

export type Frame = {
  x: number; y: number; z: number;
  /** Unit tangent along the road (in point order), and the right-hand normal (looking along the tangent). */
  tx: number; tz: number; nx: number; nz: number;
};

export const SEGMENTS: Segment[] = ROADS.flatMap((road, roadIndex) => {
  const segs: Segment[] = [];
  let s = 0;
  for (let i = 0; i < road.points.length - 1; i++) {
    const [ax, ay, az] = road.points[i]!;
    const [bx, by, bz] = road.points[i + 1]!;
    const len = Math.hypot(bx - ax, bz - az);
    segs.push({ road, roadIndex, ax, ay, az, bx, by, bz, s0: s, len });
    s += len;
  }
  return segs;
});

export function roadLength(road: Road): number {
  return SEGMENTS.filter((s) => s.road === road).reduce((n, s) => n + s.len, 0);
}

/**
 * Position and frame at arc length s along a road. Corners are softened by
 * blending the tangent over `round` metres either side of each joint.
 */
export function frameAt(road: Road, s: number): Frame {
  const segs = SEGMENTS.filter((g) => g.road === road);
  const total = segs.reduce((n, g) => n + g.len, 0);
  const ss = Math.max(0, Math.min(total, s));
  let g = segs[segs.length - 1]!;
  for (const c of segs) if (ss <= c.s0 + c.len) { g = c; break; }
  const t = g.len > 0 ? (ss - g.s0) / g.len : 0;
  const x = g.ax + (g.bx - g.ax) * t;
  const y = g.ay + (g.by - g.ay) * t;
  const z = g.az + (g.bz - g.az) * t;
  let tx = (g.bx - g.ax) / g.len;
  let tz = (g.bz - g.az) / g.len;
  // Blend tangents near joints so frontage and ribbons turn smoothly.
  const round = 6;
  const i = segs.indexOf(g);
  const blend = (o: Segment, w: number) => {
    tx = tx * (1 - w) + ((o.bx - o.ax) / o.len) * w;
    tz = tz * (1 - w) + ((o.bz - o.az) / o.len) * w;
  };
  if (i > 0 && ss - g.s0 < round) blend(segs[i - 1]!, 0.5 * (1 - (ss - g.s0) / round));
  if (i < segs.length - 1 && g.s0 + g.len - ss < round) blend(segs[i + 1]!, 0.5 * (1 - (g.s0 + g.len - ss) / round));
  const l = Math.hypot(tx, tz);
  tx /= l;
  tz /= l;
  return { x, y, z, tx, tz, nx: -tz, nz: tx };
}

export type Nearest = { dist: number; y: number; seg: Segment; t: number };

/** Nearest point on the road network (2D distance), with the road height there. */
export function nearestRoad(x: number, z: number, filter?: (s: Segment) => boolean): Nearest | null {
  let best: Nearest | null = null;
  for (const g of SEGMENTS) {
    if (filter && !filter(g)) continue;
    const dx = g.bx - g.ax;
    const dz = g.bz - g.az;
    const t = Math.max(0, Math.min(1, ((x - g.ax) * dx + (z - g.az) * dz) / (dx * dx + dz * dz)));
    const px = g.ax + dx * t;
    const pz = g.az + dz * t;
    const dist = Math.hypot(x - px, z - pz);
    if (!best || dist < best.dist) best = { dist, y: g.ay + (g.by - g.ay) * t, seg: g, t };
  }
  return best;
}

/** True if (x, z) is on a carriageway or sidewalk of a road other than `except`. */
export function onRoad(x: number, z: number, margin = SIDEWALK, except?: Road): boolean {
  for (const g of SEGMENTS) {
    if (g.road === except) continue;
    const dx = g.bx - g.ax;
    const dz = g.bz - g.az;
    const t = Math.max(0, Math.min(1, ((x - g.ax) * dx + (z - g.az) * dz) / (dx * dx + dz * dz)));
    if (Math.hypot(x - (g.ax + dx * t), z - (g.az + dz * t)) < g.road.halfWidth + margin) return true;
  }
  return false;
}

export function inPlaza(x: number, z: number, margin = 0): Plaza | null {
  for (const p of PLAZAS) {
    if (Math.abs(x - p.x) < p.hx + margin && Math.abs(z - p.z) < p.hz + margin) return p;
  }
  return null;
}

/**
 * Where to put a stuck van: the nearest point on a road centreline, preferring
 * roads at the van's own level (so a van off the switchbacks goes back to its
 * own leg), facing along the road in the direction closest to its heading.
 */
export function recoveryPoint(x: number, y: number, z: number, heading: number): { x: number; y: number; z: number; heading: number } {
  let best: { cost: number; x: number; y: number; z: number; seg: Segment } | null = null;
  for (const g of SEGMENTS) {
    const dx = g.bx - g.ax;
    const dz = g.bz - g.az;
    const t = Math.max(0, Math.min(1, ((x - g.ax) * dx + (z - g.az) * dz) / (dx * dx + dz * dz)));
    const px = g.ax + dx * t;
    const pz = g.az + dz * t;
    const py = g.ay + (g.by - g.ay) * t;
    const cost = Math.hypot(x - px, z - pz, (y - py) * 0.7);
    if (!best || cost < best.cost) best = { cost, x: px, y: py, z: pz, seg: g };
  }
  const g = best!.seg;
  let h = Math.atan2(g.bx - g.ax, g.bz - g.az);
  if (Math.cos(h - heading) < 0) h += Math.PI;
  return { x: best!.x, y: best!.y, z: best!.z, heading: Math.atan2(Math.sin(h), Math.cos(h)) };
}
