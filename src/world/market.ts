/**
 * Christmas markets (SPEC §3, §4): wooden stalls in Place Guillaume II (the
 * Knuedler, in front of the Hôtel de Ville) and Place de la Constitution (by the
 * Gëlle Fra and the Ferris wheel). Pure data, no three.js.
 *
 * Stalls stand in rows in the middle of each square, at least 8 m from the
 * building fronts so delivery zones and the driving lanes round the square stay open.
 */
import { createRng } from '../core/rng';

export type Stall = {
  x: number;
  y: number;
  z: number;
  /** Rotation about Y; local -Z is the open counter side (same convention as buildings). */
  rot: number;
  width: number;
  depth: number;
  /** 0..1, picks wood tone, roof trim and goods colour. */
  seed: number;
  /** Mulled wine / food stall: steam rises from it. */
  steam: boolean;
};

/** Rectangles where market-goers wander (aisles between the stall rows, round the landmarks). */
export type WalkArea = { x: number; z: number; hx: number; hz: number; people: number };

export const STALL = { width: 3.0, depth: 2.6, wall: 2.2, ridge: 3.5 };

const SPACING = 3.9;

/**
 * A row of `n` stalls centred on (cx, cz), along X or Z. `face` is the world
 * direction the counters look: +1 or -1 along the other axis.
 */
function row(cx: number, cz: number, n: number, along: 'x' | 'z', face: 1 | -1, out: Stall[], rng: ReturnType<typeof createRng>): void {
  // Local -Z is the counter. rot 0 → faces -Z, π → +Z, -π/2 → +X, π/2 → -X.
  const rot = along === 'x' ? (face === 1 ? Math.PI : 0) : face === 1 ? -Math.PI / 2 : Math.PI / 2;
  for (let i = 0; i < n; i++) {
    const o = (i - (n - 1) / 2) * SPACING;
    out.push({
      x: along === 'x' ? cx + o : cx,
      y: 0,
      z: along === 'z' ? cz + o : cz,
      rot,
      width: STALL.width,
      depth: STALL.depth,
      seed: rng.next(),
      steam: rng.next() < 0.4,
    });
  }
}

function build(): Stall[] {
  const rng = createRng('markets');
  const s: Stall[] = [];
  // Knuedler: two rows facing each other across a 3.4 m aisle.
  row(95, -47, 6, 'x', 1, s, rng);
  row(95, -41, 6, 'x', -1, s, rng);
  // Constitution: a pair of rows running north-south in the west half, lanes clear all round
  // (to the north doors, east to the Gëlle Fra and the wheel, south along the valley view).
  row(92, 47, 3, 'z', 1, s, rng);
  row(98, 47, 3, 'z', -1, s, rng);
  return s;
}

export const STALLS: Stall[] = build();

export const WALK_AREAS: WalkArea[] = [
  { x: 95, z: -44, hx: 10.5, hz: 1.4, people: 22 },
  { x: 95, z: 47, hx: 1.4, hz: 5.5, people: 12 },
  // Round the Gëlle Fra and under the Ferris wheel.
  { x: 116, z: 47, hx: 6, hz: 6, people: 10 },
  // Round the Place d'Armes tree.
  { x: 25, z: -95, hx: 9, hz: 6.5, people: 12 },
];

/** Is (x, z) within `margin` of a stall's footprint? */
export function inStall(x: number, z: number, margin = 0): boolean {
  return STALLS.some((st) => {
    const c = Math.cos(st.rot);
    const s = Math.sin(st.rot);
    const dx = x - st.x;
    const dz = z - st.z;
    return Math.abs(dx * c - dz * s) < st.width / 2 + margin && Math.abs(dx * s + dz * c) < st.depth / 2 + margin;
  });
}
