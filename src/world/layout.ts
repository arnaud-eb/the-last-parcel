/**
 * M1 layout: one gently curving upper-town street ending in a small square
 * with a Christmas tree. Pure data, no three.js: rendering, physics and
 * gameplay all read from here. The layout is fixed (seeded with a constant),
 * the daily seed never changes it.
 */
import { createRng } from '../core/rng';
import type { Stop } from '../core/parcels';

export const ROAD_HALF = 3.6;
export const SIDEWALK = 2.0;
export const FACADE_OFFSET = ROAD_HALF + SIDEWALK; // centreline → facade
export const CURB_HEIGHT = 0.14;
export const GROUND_FLOOR_H = 3.6;
export const FLOOR_H = 3.0;

export const STREET_Z_START = 92; // depot end (closed by a building row)
export const STREET_Z_END = -38; // where the square opens
export const SQUARE = { zMin: -74, zMax: -38, xHalf: 22 };
export const TREE = { x: 0, z: -58, height: 13, radius: 4.2 };

/** Street centreline x as a function of z. Gentle S-curve. */
export function centerX(z: number): number {
  if (z < STREET_Z_END) return centerX(STREET_Z_END);
  return 3.2 * Math.sin(z * 0.034);
}

/** Unit tangent (pointing toward -z, i.e. toward the square) and right normal. */
export function frameAt(z: number): { tx: number; tz: number; nx: number; nz: number } {
  const e = 0.5;
  const dx = centerX(z - e) - centerX(z + e);
  const dz = -2 * e;
  const len = Math.hypot(dx, dz);
  const tx = dx / len;
  const tz = dz / len;
  // Right-hand normal when facing along the tangent (toward the square).
  return { tx, tz, nx: -tz, nz: tx };
}

export type Building = {
  /** Centre of the footprint. */
  x: number;
  z: number;
  /** Rotation about Y; local +X runs along the street frontage. */
  rot: number;
  width: number;
  depth: number;
  /** Wall height to the eaves. */
  height: number;
  /** Ridge parallel to the frontage (true) or gable facing the street. */
  ridgeAlong: boolean;
  roofPitch: number;
  color: [number, number, number];
  /** 0..1 per-building random, drives windows, shutters, shop front. */
  seed: number;
  /** Background buildings get no collider. */
  solid: boolean;
  chimney: boolean;
};

export type Lamp = { x: number; z: number; /** direction the arm points */ rot: number };
export type StringLight = { ax: number; az: number; bx: number; bz: number; y: number; sag: number };
export type Spire = { x: number; z: number; height: number; width: number };

export type Layout = {
  buildings: Building[];
  lamps: Lamp[];
  strings: StringLight[];
  stops: Stop[];
  spires: Spire[];
  start: { x: number; z: number; heading: number };
};

// Plaster palette of the old town: cream, ochre, sand, salmon, pale grey, sage, powder blue.
const PALETTE: [number, number, number][] = [
  [0.86, 0.8, 0.66],
  [0.82, 0.66, 0.42],
  [0.9, 0.84, 0.72],
  [0.8, 0.56, 0.46],
  [0.72, 0.72, 0.7],
  [0.62, 0.68, 0.56],
  [0.6, 0.7, 0.78],
  [0.88, 0.76, 0.56],
  [0.74, 0.46, 0.4],
];

const STREET_NAMES = [
  'Rue du Marché-aux-Herbes',
  'Grand-Rue',
  'Rue de la Boucherie',
  'Rue du Fossé',
];

export function buildLayout(): Layout {
  const rng = createRng('kuerier-upper-town-v1');
  const buildings: Building[] = [];
  const stops: Stop[] = [];

  // Street frontage, both sides.
  for (const side of [-1, 1] as const) {
    let z = STREET_Z_START - 2;
    let n = 0;
    while (z > STREET_Z_END + 2) {
      const width = rng.range(6.5, 10);
      const cz = z - width / 2;
      const f = frameAt(cz);
      const depth = rng.range(10, 13);
      const off = FACADE_OFFSET + depth / 2 + rng.range(0, 0.35);
      const floors = rng.int(2, 4);
      buildings.push({
        x: centerX(cz) + f.nx * off * side,
        z: cz + f.nz * off * side,
        // Local +X along frontage, local -Z faces the street.
        rot: Math.atan2(-f.tz, f.tx) + (side === 1 ? 0 : Math.PI),
        width: width + 0.15, // slight overlap hides seams on the curve
        depth,
        height: GROUND_FLOOR_H + floors * FLOOR_H,
        ridgeAlong: rng.next() < 0.72,
        roofPitch: rng.range(0.75, 1.0),
        color: rng.pick(PALETTE),
        seed: rng.next(),
        solid: true,
        chimney: rng.next() < 0.6,
      });
      // Every other building is a deliverable address.
      if (n % 2 === 1 && cz < STREET_Z_START - 15) {
        const name = STREET_NAMES[(n + (side === 1 ? 1 : 0)) % STREET_NAMES.length]!;
        const num = 2 * n + (side === 1 ? 2 : 1);
        const zoneOff = ROAD_HALF - 1.4;
        stops.push({
          id: `s${stops.length + 1}`,
          address: `${num} ${name}`,
          zone: { x: centerX(cz) + f.nx * zoneOff * side, z: cz + f.nz * zoneOff * side, radius: 2.8 },
        });
      }
      z -= width;
      n++;
    }
  }

  // Building row closing the depot end, behind the start.
  for (let x = -16; x <= 16; x += 8) {
    buildings.push(backdrop(rng, x, STREET_Z_START + 6.5, 0, 8.2, 11, true));
  }

  // The square: three sides of facades.
  const { zMin, zMax, xHalf } = SQUARE;
  for (let x = -xHalf + 4; x <= xHalf - 4 + 0.01; x += 8.8) {
    buildings.push(backdrop(rng, x, zMin - 6, Math.PI, 9, 12, true));
  }
  for (const side of [-1, 1] as const) {
    for (let z = zMax - 5; z > zMin; z -= 9) {
      buildings.push(backdrop(rng, side * (xHalf + 6), z, side === 1 ? Math.PI / 2 : -Math.PI / 2, 9.2, 12, true));
    }
    // Corner fillers between street frontage and square sides.
    buildings.push(backdrop(rng, side * (FACADE_OFFSET + 3 + 6), zMax + 2, 0, 12, 8, true));
  }

  // Second row of roofs behind the frontage, for depth over the rooftops.
  for (const side of [-1, 1] as const) {
    for (let z = STREET_Z_START; z > STREET_Z_END - 10; z -= rng.range(7, 11)) {
      const f = frameAt(z);
      const off = FACADE_OFFSET + 14 + rng.range(2, 8);
      const b = backdrop(rng, centerX(z) + f.nx * off * side, z + f.nz * off * side, Math.atan2(-f.tz, f.tx), rng.range(8, 12), 12, false);
      b.height += rng.range(1, 6);
      buildings.push(b);
    }
  }

  // Lamps alternate sides along the street, then ring the square.
  const lamps: Lamp[] = [];
  let side = 1;
  for (let z = STREET_Z_START - 8; z > STREET_Z_END; z -= 13) {
    const f = frameAt(z);
    const off = ROAD_HALF + 0.55;
    lamps.push({ x: centerX(z) + f.nx * off * side, z: z + f.nz * off * side, rot: Math.atan2(-f.nx * side, -f.nz * side) });
    side = -side;
  }
  for (const [x, z] of [
    [-12, -44], [12, -44], [-16, -58], [16, -58], [-12, -70], [12, -70],
  ] as const) {
    lamps.push({ x, z, rot: Math.atan2(-x, TREE.z - z) });
  }

  // String lights across the street, facade to facade.
  const strings: StringLight[] = [];
  for (let z = STREET_Z_START - 14; z > STREET_Z_END; z -= 15) {
    const f = frameAt(z);
    const cx = centerX(z);
    const w = FACADE_OFFSET - 0.1;
    strings.push({ ax: cx - f.nx * w, az: z - f.nz * w, bx: cx + f.nx * w, bz: z + f.nz * w + rng.range(-3, 3), y: rng.range(6.2, 7.2), sag: rng.range(0.7, 1.2) });
  }
  // Garlands from the tree top down to the square edges.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.3;
    strings.push({ ax: TREE.x, az: TREE.z, bx: TREE.x + Math.cos(a) * 17, bz: TREE.z + Math.sin(a) * 14, y: 9.5, sag: 2.2 });
  }

  // The cathedral's three spires beyond the square, as silhouettes in the fog.
  const spires: Spire[] = [
    { x: -14, z: -125, height: 52, width: 6 },
    { x: 4, z: -138, height: 62, width: 7 },
    { x: 20, z: -122, height: 50, width: 6 },
  ];

  const sz = STREET_Z_START - 10;
  return {
    buildings,
    lamps,
    strings,
    stops,
    spires,
    start: { x: centerX(sz), z: sz, heading: Math.PI },
  };
}

function backdrop(
  rng: ReturnType<typeof createRng>,
  x: number,
  z: number,
  rot: number,
  width: number,
  depth: number,
  solid: boolean,
): Building {
  return {
    x,
    z,
    rot,
    width,
    depth,
    height: GROUND_FLOOR_H + rng.int(2, 4) * FLOOR_H,
    ridgeAlong: rng.next() < 0.7,
    roofPitch: rng.range(0.75, 1.0),
    color: rng.pick(PALETTE),
    seed: rng.next(),
    solid,
    chimney: rng.next() < 0.5,
  };
}
