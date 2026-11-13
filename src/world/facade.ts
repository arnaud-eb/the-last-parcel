/**
 * The facade window grid, shared by the shader (painted glass and glow) and
 * the instanced relief (frames, sills, shutters, steps, awnings). Keep the
 * numbers here in sync with facadeMaterial() in src/render/materials.ts.
 */
export const GROUND_FLOOR_H = 3.6;
export const FLOOR_H = 3.0;
export const WIN_SPACING = 2.6;

/** Window rectangles as fractions of a cell: [x0, x1, y0, y1]. */
export const RECT = {
  upper: [0.3, 0.7, 0.22, 0.8],
  groundWindow: [0.3, 0.7, 0.3, 0.75],
  shop: [0.1, 0.9, 0.1, 0.72],
  door: [0.34, 0.66, 0.0, 0.66],
} as const;

export type SlotKind = keyof typeof RECT;

export type Slot = {
  kind: SlotKind;
  col: number;
  floor: number;
  /** Centre along the wall, metres from the wall's u = 0 corner. */
  u: number;
  /** Bottom and top, metres above the ground. */
  y0: number;
  y1: number;
  /** Width in metres. */
  width: number;
};

export type FacadeSpec = { width: number; height: number; shop: boolean; doorCol: number };

export function facadeCols(width: number): number {
  return Math.max(1, Math.floor(width / WIN_SPACING));
}

/** Number of upper floors that fit under the eaves (same rule as the shader). */
export function upperFloors(height: number): number {
  let k = 0;
  while (GROUND_FLOOR_H + (k + 1) * FLOOR_H <= height + 0.1) k++;
  return k;
}

/** Every window/door/shop slot on a windowed wall. */
export function facadeSlots(f: FacadeSpec): Slot[] {
  const cols = facadeCols(f.width);
  const cellW = f.width / cols;
  const slots: Slot[] = [];
  const push = (kind: SlotKind, col: number, floor: number, base: number, cellH: number) => {
    const [x0, x1, y0, y1] = RECT[kind];
    slots.push({ kind, col, floor, u: (col + (x0 + x1) / 2) * cellW, y0: base + y0 * cellH, y1: base + y1 * cellH, width: (x1 - x0) * cellW });
  };
  for (let c = 0; c < cols; c++) {
    if (c === f.doorCol) push('door', c, 0, 0, GROUND_FLOOR_H);
    else push(f.shop ? 'shop' : 'groundWindow', c, 0, 0, GROUND_FLOOR_H);
    for (let k = 1; k <= upperFloors(f.height); k++) push('upper', c, k, GROUND_FLOOR_H + (k - 1) * FLOOR_H, FLOOR_H);
  }
  return slots;
}
