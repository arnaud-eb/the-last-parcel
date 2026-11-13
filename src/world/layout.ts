/**
 * Generates the town from the hand-authored data in town.ts: buildings along
 * every street and square, lamps, string lights and delivery stops. Pure data,
 * no three.js: rendering, physics and gameplay all read from here. Seeded with
 * a constant, so the town is identical every day (the daily seed never changes it).
 */
import { createRng, type Rng } from '../core/rng';
import type { Stop } from '../core/parcels';
import { facadeCols, facadeSlots, FLOOR_H, GROUND_FLOOR_H } from './facade';
import { SIDEWALK, frameAt, inPlaza, onRoad, roadLength, type Frame } from './roads';
import { baseHeight } from './terrain';
import { LANDMARKS, PLAZAS, ROADS, START, VALLEY_Y, type District, type Landmark, type Plaza } from './town';
import { LANDMARK_SKYLINE, landmarkBuildings } from './landmarkBlocks';

export { GROUND_FLOOR_H, FLOOR_H } from './facade';
export { CURB_HEIGHT, SIDEWALK } from './roads';

export type Building = {
  /** Centre of the footprint and ground height. */
  x: number;
  y: number;
  z: number;
  /** Rotation about Y; local +X runs along the frontage, local -Z faces the street. */
  rot: number;
  width: number;
  depth: number;
  /** Wall height to the eaves. */
  height: number;
  /** Ridge parallel to the frontage (true) or gable facing the street. */
  ridgeAlong: boolean;
  roofPitch: number;
  color: [number, number, number];
  /** 0..1 per-building random. */
  seed: number;
  /** Has a collider. */
  solid: boolean;
  chimney: boolean;
  shop: boolean;
  doorCol: number;
  /** Shutter colour index 0..2, or -1 for none. */
  shutters: number;
  /** Street-facing front gets 3D relief (frames, sills, steps, awnings). */
  relief: boolean;
  dormers: number;
  /** Street or square the front faces (for addresses); null for block infill. */
  street: string | null;
  /** Plain stone walls, no windows (the cathedral). */
  plain?: boolean;
  /** Warm floodlights on the walls (landmarks). */
  floodlit?: boolean;
  /** Roof colour under the snow; slate when unset. */
  roofColor?: [number, number, number];
};

export type Lamp = { x: number; y: number; z: number; /** direction the arm points */ rot: number };
export type StringLight = { ax: number; ay: number; az: number; bx: number; by: number; bz: number; sag: number };

export type Layout = {
  buildings: Building[];
  lamps: Lamp[];
  strings: StringLight[];
  stops: Stop[];
  landmarks: Landmark[];
  start: { x: number; z: number; heading: number };
};

type Rgb = [number, number, number];

// Plaster palette of the old town; Belle Époque stone and cream; Grund stone houses.
const PALETTES: Record<District, Rgb[]> = {
  old: [
    [0.86, 0.8, 0.66], [0.82, 0.66, 0.42], [0.9, 0.84, 0.72], [0.8, 0.56, 0.46], [0.72, 0.72, 0.7],
    [0.62, 0.68, 0.56], [0.6, 0.7, 0.78], [0.88, 0.76, 0.56], [0.74, 0.46, 0.4],
  ],
  belle: [[0.86, 0.8, 0.68], [0.78, 0.7, 0.56], [0.7, 0.66, 0.6], [0.9, 0.86, 0.78], [0.66, 0.58, 0.48]],
  grund: [[0.62, 0.58, 0.52], [0.7, 0.64, 0.52], [0.82, 0.78, 0.7], [0.56, 0.54, 0.52], [0.76, 0.66, 0.5]],
};

const DISTRICT = {
  old: { width: [6.5, 10], floors: [2, 4], pitch: [0.75, 1.0], ridgeAlong: 0.72, shop: 0.55, depth: [10, 13] },
  belle: { width: [10, 14], floors: [4, 5], pitch: [0.35, 0.55], ridgeAlong: 0.9, shop: 0.7, depth: [12, 15] },
  grund: { width: [6, 9], floors: [1, 3], pitch: [0.8, 1.0], ridgeAlong: 0.65, shop: 0.25, depth: [8, 11] },
} as const;

type BuildingBase = Omit<Building, 'shop' | 'doorCol' | 'shutters' | 'relief' | 'dormers'>;

/** Facade details from the building's own seed, so they never shift the rest of the layout. */
function decorate(b: BuildingBase, district: District): Building {
  const r = createRng(Math.floor(b.seed * 2 ** 32));
  const cols = facadeCols(b.width);
  return {
    ...b,
    shop: r.next() < DISTRICT[district].shop,
    doorCol: r.int(0, cols - 1),
    shutters: r.next() < (district === 'grund' ? 0.6 : district === 'old' ? 0.45 : 0.1) ? r.int(0, 2) : -1,
    relief: b.street !== null,
    dormers: b.ridgeAlong && b.width > 7 ? r.int(0, 2) : 0,
  };
}

// ---------- footprint geometry ----------

export type Obb = { x: number; z: number; rot: number; hx: number; hz: number };

/** Centre, corners and edge midpoints of an oriented rectangle (local x/z half extents). */
export function obbPoints(o: Obb, inset = 0): [number, number][] {
  const c = Math.cos(o.rot);
  const s = Math.sin(o.rot);
  const hx = o.hx - inset;
  const hz = o.hz - inset;
  const local = [[0, 0], [hx, hz], [-hx, hz], [hx, -hz], [-hx, -hz], [0, hz], [0, -hz], [hx, 0], [-hx, 0]] as const;
  // Rotation about Y: local x → (cos, -sin), local z → (sin, cos).
  return local.map(([lx, lz]) => [o.x + lx * c + lz * s, o.z - lx * s + lz * c]);
}

/** Separating-axis overlap test for two oriented rectangles. */
export function obbOverlap(a: Obb, b: Obb): boolean {
  const axes = (o: Obb) => [[Math.cos(o.rot), -Math.sin(o.rot)], [Math.sin(o.rot), Math.cos(o.rot)]] as const;
  const corners = (o: Obb) => obbPoints(o).slice(1, 5);
  for (const [ax, az] of [...axes(a), ...axes(b)]) {
    const pa = corners(a).map(([x, z]) => x * ax + z * az);
    const pb = corners(b).map(([x, z]) => x * ax + z * az);
    if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
  }
  return true;
}

function inObb(o: Obb, x: number, z: number, margin: number): boolean {
  const c = Math.cos(o.rot);
  const s = Math.sin(o.rot);
  const dx = x - o.x;
  const dz = z - o.z;
  // Inverse of the rotation in obbPoints.
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) < o.hx + margin && Math.abs(lz) < o.hz + margin;
}

// ---------- generation ----------

class Placer {
  readonly buildings: BuildingBase[] = [];
  readonly districts: District[] = [];
  private readonly obbs: Obb[] = [];
  private readonly landmarkObbs: Obb[] = LANDMARKS.map((l) => ({ x: l.x, z: l.z, rot: l.rot, hx: l.hx, hz: l.hz }));

  constructor(private readonly rng: Rng) {}

  /** Clear of roads, squares, landmarks, cliffs and other buildings? */
  fits(o: Obb, y: number): boolean {
    for (const [x, z] of obbPoints(o, 0.2)) {
      if (onRoad(x, z, SIDEWALK - 0.15)) return false;
      if (inPlaza(x, z, 0.2)) return false;
      if (this.landmarkObbs.some((l) => inObb(l, x, z, 1.5))) return false;
      if (Math.abs(baseHeight(x, z) - y) > 1.2) return false;
    }
    const shrunk = { ...o, hx: o.hx - 0.4, hz: o.hz - 0.4 };
    return !this.obbs.some((b) => obbOverlap(shrunk, b));
  }

  add(b: BuildingBase, district: District): void {
    this.buildings.push(b);
    this.districts.push(district);
    this.obbs.push({ x: b.x, z: b.z, rot: b.rot, hx: b.width / 2, hz: b.depth / 2 });
  }

  /**
   * Buildings along one side of a line. `frame(s)` gives position and the
   * right-hand normal; side +1 builds on the right, -1 on the left. Fronts face the line.
   */
  frontage(frame: (s: number) => Frame, length: number, offset: number, side: 1 | -1, district: District, street: string): void {
    const d = DISTRICT[district];
    const rng = this.rng;
    let s = 1.5;
    while (s < length - 2) {
      const width = rng.range(d.width[0], d.width[1]);
      if (s + width > length + 1) break;
      const f = frame(s + width / 2);
      const depth = rng.range(d.depth[0], d.depth[1]);
      const off = offset + depth / 2 + rng.range(0, 0.35);
      const x = f.x + f.nx * off * side;
      const z = f.z + f.nz * off * side;
      // Local -Z must point back at the line: (-sin θ, -cos θ) = -side·n.
      const rot = Math.atan2(side * f.nx, side * f.nz);
      const o: Obb = { x, z, rot, hx: (width + 0.15) / 2, hz: depth / 2 };
      if (this.fits(o, f.y)) {
        this.add(this.make(rng, district, x, f.y, z, rot, width + 0.15, depth, street), district);
        s += width;
      } else {
        s += 2.5;
      }
    }
  }

  make(rng: Rng, district: District, x: number, y: number, z: number, rot: number, width: number, depth: number, street: string | null): BuildingBase {
    const d = DISTRICT[district];
    return {
      x, y, z, rot, width, depth,
      height: GROUND_FLOOR_H + rng.int(d.floors[0], d.floors[1]) * FLOOR_H,
      ridgeAlong: rng.next() < d.ridgeAlong,
      roofPitch: rng.range(d.pitch[0], d.pitch[1]),
      color: rng.pick(PALETTES[district]),
      seed: rng.next(),
      solid: true,
      chimney: rng.next() < 0.6,
      street,
    };
  }
}

/** Straight-line frame from (ax, az) to (bx, bz), at height y. */
function lineFrame(ax: number, az: number, bx: number, bz: number, y: number): [(s: number) => Frame, number] {
  const len = Math.hypot(bx - ax, bz - az);
  const tx = (bx - ax) / len;
  const tz = (bz - az) / len;
  return [(s) => ({ x: ax + tx * s, y, z: az + tz * s, tx, tz, nx: -tz, nz: tx }), len];
}

/** The four edges of a square, walked so that "right" points out of the square. */
function plazaEdges(p: Plaza): { dir: 'n' | 's' | 'e' | 'w'; frame: (s: number) => Frame; len: number }[] {
  const { x, z, hx, hz, y } = p;
  const e = (dir: 'n' | 's' | 'e' | 'w', ax: number, az: number, bx: number, bz: number) => {
    const [frame, len] = lineFrame(ax, az, bx, bz, y);
    return { dir, frame, len };
  };
  return [
    e('n', x + hx, z - hz, x - hx, z - hz),
    e('s', x - hx, z + hz, x + hx, z + hz),
    e('e', x + hx, z + hz, x + hx, z - hz),
    e('w', x - hx, z - hz, x - hx, z + hz),
  ];
}

/** Block interiors behind the frontage get infill so there are no holes between the roofs. */
const INFILL_AREAS = [
  { x0: -130, x1: 232, z0: -165, z1: 56 }, // upper town
  { x0: -60, x1: 60, z0: 170, z1: 372 }, // Gare quarter
  { x0: 272, x1: 334, z0: -80, z1: 56 }, // Grund
];

export function buildLayout(): Layout {
  const rng = createRng('kuerier-luxembourg-v2');
  const placer = new Placer(rng);

  // Streets first (they define the town), then squares, then infill.
  for (const road of ROADS) {
    if (road.frontage === 'none') continue;
    const len = roadLength(road);
    const sides: (1 | -1)[] = road.frontage === 'both' ? [1, -1] : road.frontage === 'right' ? [1] : [-1];
    for (const side of sides) placer.frontage((s) => frameAt(road, s), len, road.halfWidth + SIDEWALK, side, road.district, road.name);
  }
  for (const p of PLAZAS) {
    for (const edge of plazaEdges(p)) {
      if (p.open?.includes(edge.dir)) continue;
      placer.frontage(edge.frame, edge.len, 0.4, 1, p.district, p.name);
    }
  }
  for (const a of INFILL_AREAS) {
    for (let z = a.z0; z < a.z1; z += 13) {
      for (let x = a.x0; x < a.x1; x += 13) {
        const px = x + rng.range(-2, 2);
        const pz = z + rng.range(-2, 2);
        const y = baseHeight(px, pz);
        // Only on flat ground: the plateau or the valley floor.
        if (Math.abs(y) > 0.5 && Math.abs(y - VALLEY_Y) > 0.5) continue;
        const rot = rng.range(-0.15, 0.15);
        const w = rng.range(9, 12);
        const dd = rng.range(9, 12);
        if (!placer.fits({ x: px, z: pz, rot, hx: w / 2, hz: dd / 2 }, y)) continue;
        const district: District = y < -10 ? 'grund' : pz > 160 ? 'belle' : 'old';
        const b = placer.make(rng, district, px, y, pz, rot, w, dd, null);
        b.height += rng.range(0, 4);
        placer.add(b, district);
      }
    }
  }

  const buildings = [...placer.buildings.map((b, i) => capNearLandmarks(decorate(b, placer.districts[i]!))), ...landmarkBuildings()];
  return {
    buildings,
    lamps: buildLamps(),
    strings: buildStrings(rng),
    stops: buildStops(buildings),
    landmarks: LANDMARKS,
    start: START,
  };
}

function buildLamps(): Lamp[] {
  const lamps: Lamp[] = [];
  for (const road of ROADS) {
    if (!road.lampEvery) continue;
    const len = roadLength(road);
    let side = 1;
    // Keep clear of junction corners at both ends.
    for (let s = 10; s < len - 10; s += road.lampEvery) {
      const f = frameAt(road, s);
      const off = road.halfWidth + (road.bridge ? 0.25 : 0.55);
      const x = f.x + f.nx * off * side;
      const z = f.z + f.nz * off * side;
      // Clear of other streets by 6 m, so no lamp sits in a junction corner.
      if (!onRoad(x, z, 6, road) && !inPlaza(x, z, 3)) {
        lamps.push({ x, y: f.y, z, rot: Math.atan2(-f.nx * side, -f.nz * side) });
      }
      side = -side;
    }
  }
  for (const p of PLAZAS) {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const x = p.x + sx * (p.hx - 3);
      const z = p.z + sz * (p.hz - 3);
      // Not where a street enters the square: vans cut that corner.
      if (onRoad(x, z, 6)) continue;
      lamps.push({ x, y: p.y, z, rot: Math.atan2(-sx, -sz) });
    }
  }
  return lamps;
}

function buildStrings(rng: Rng): StringLight[] {
  const strings: StringLight[] = [];
  for (const road of ROADS) {
    if (!road.strings) continue;
    const len = roadLength(road);
    for (let s = 10; s < len - 8; s += 15) {
      const f = frameAt(road, s);
      const w = road.halfWidth + SIDEWALK - 0.1;
      const ax = f.x - f.nx * w;
      const az = f.z - f.nz * w;
      const bx = f.x + f.nx * w;
      const bz = f.z + f.nz * w + rng.range(-2.5, 2.5);
      if (onRoad(ax, az, 0, road) || onRoad(bx, bz, 0, road) || inPlaza(ax, az) || inPlaza(bx, bz)) continue;
      const y = f.y + rng.range(6.2, 7.2);
      strings.push({ ax, ay: y, az, bx, by: y, bz, sag: rng.range(0.7, 1.2) });
    }
  }
  // Garlands from the top of the Place d'Armes tree to the square's edges.
  const tree = LANDMARKS.find((l) => l.id === 'tree')!;
  const square = PLAZAS.find((p) => p.name === "Place d'Armes")!;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.3;
    strings.push({
      ax: tree.x, ay: tree.y + 12.5, az: tree.z,
      bx: tree.x + Math.cos(a) * (square.hx - 2), by: tree.y + 3.6, bz: tree.z + Math.sin(a) * (square.hz - 2),
      sag: 2.0,
    });
  }
  return strings;
}

/** Every building with a street front is a deliverable address; its zone is on the road by the door. */
function buildStops(buildings: Building[]): Stop[] {
  const numbers = new Map<string, number>();
  const stops: Stop[] = [];
  for (const b of buildings) {
    if (!b.street) continue;
    const door = facadeSlots({ width: b.width, height: b.height, shop: b.shop, doorCol: b.doorCol }).find((s) => s.kind === 'door')!;
    // Door in local space: x = w/2 - u, front wall at z = -depth/2; the zone is ~4 m out in front.
    const lx = b.width / 2 - door.u;
    const lz = -b.depth / 2 - 4.2;
    const c = Math.cos(b.rot);
    const s = Math.sin(b.rot);
    const n = (numbers.get(b.street) ?? 0) + 1;
    numbers.set(b.street, n);
    stops.push({
      id: `s${stops.length + 1}`,
      address: `${2 * n - 1} ${b.street}`,
      zone: { x: b.x + lx * c + lz * s, z: b.z - lx * s + lz * c, radius: 2.8 },
      y: b.y,
      district: b.y < -10 ? 'grund' : b.z > 160 ? 'belle' : 'old',
    });
  }
  return stops;
}

/** Keep generated neighbours a floor or two below the big landmarks, so those dominate their streets. */
function capNearLandmarks(b: Building): Building {
  for (const c of LANDMARK_SKYLINE) {
    if (Math.hypot(b.x - c.x, b.z - c.z) < c.radius && b.height > c.maxHeight) b.height = c.maxHeight;
  }
  return b;
}
