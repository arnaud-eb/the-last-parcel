import * as THREE from 'three/webgpu';
import { GeoBuilder } from './geo';
import type { Building } from './layout';
import { byChunk } from './chunks';
import { GROUND_FLOOR_H } from './facade';
import { facadeMaterial, roofMaterial } from '../render/materials';

const UP = new THREE.Vector3(0, 1, 0);
const OVERHANG = 0.35;
const SLATE = [0.08, 0.085, 0.1];
const FASCIA = [0.13, 0.085, 0.06];
const BRICK = [0.4, 0.22, 0.17];

/** New builders for walls (facade material) and roofs (snowy roof material). */
export function wallBuilders(): { walls: GeoBuilder; roofs: GeoBuilder } {
  return { walls: new GeoBuilder([['aWall', 4], ['aFacade', 4]]), roofs: new GeoBuilder([['aRoof', 1]]) };
}

const FACADE = facadeMaterial();
const ROOF = roofMaterial();

/** Turn wall/roof builders into meshes with the shared facade and roof materials. */
export function wallMeshes(walls: GeoBuilder, roofs: GeoBuilder, name: string): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  if (walls.vertexCount) out.push(Object.assign(new THREE.Mesh(walls.build(), FACADE), { name: `${name}-walls` }));
  if (roofs.vertexCount) out.push(Object.assign(new THREE.Mesh(roofs.build(), ROOF), { name: `${name}-roofs` }));
  return out;
}

/** All buildings, merged per map chunk: two draw calls (walls, roofs) per visible chunk. */
export function buildBuildings(buildings: readonly Building[]): THREE.Group {
  const group = new THREE.Group();
  group.name = 'buildings';
  for (const [key, list] of byChunk(buildings, (b) => b)) {
    const { walls, roofs } = wallBuilders();
    for (const b of list) addBuilding(walls, roofs, b);
    group.add(...wallMeshes(walls, roofs, `chunk ${key}`));
  }
  return group;
}

export function addBuilding(walls: GeoBuilder, roofs: GeoBuilder, b: Building): void {
  const m = new THREE.Matrix4().makeRotationY(b.rot).setPosition(b.x, b.y, b.z);
  const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(m);
  const w = b.width / 2;
  const d = b.depth / 2;
  const H = b.height;
  const col = b.color;

  // Four walls, outward normals. Front (-Z) faces the street.
  const corners: [number, number][] = [[w, -d], [-w, -d], [-w, d], [w, d]];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i]!;
    const [bx, bz] = corners[(i + 1) % 4]!;
    const len = Math.hypot(bx - ax, bz - az);
    const isFront = i === 0;
    const kind = b.plain ? 1 : isFront || b.solid ? 0 : 1;
    // aFacade = (shop, doorCol, shutters, relief). Only the front has a door, shop and 3D relief.
    const facade = isFront ? [b.shop ? 1 : 0, b.doorCol, b.shutters, b.relief ? 1 : 0] : [0, -1, b.shutters, 0];
    wallQuad(walls, P(ax, 0, az), P(bx, 0, bz), H, len, col, [len, H, b.seed + i * 0.13, i === 2 ? 1 : kind, ...facade]);
  }

  if (b.relief) stoneBands(walls, roofs, P, w, d, H, b.seed);

  // Roof.
  if (b.ridgeAlong) {
    const rise = b.roofPitch * d;
    gableRoof(walls, roofs, P, w, d, H, rise, col, b.seed, false);
  } else {
    const rise = b.roofPitch * w;
    gableRoof(walls, roofs, P, w, d, H, rise, col, b.seed, true);
  }

  if (b.chimney) {
    const cx = (b.seed - 0.5) * b.width * 0.6;
    const cz = b.ridgeAlong ? d * 0.25 : 0;
    const top = H + (b.ridgeAlong ? b.roofPitch * d : b.roofPitch * w) * 0.75 + 1.0;
    box(walls, roofs, P, cx, cz, 0.38, 0.38, top - 2.5, top, BRICK, b.seed);
  }
}

const SANDSTONE = [0.6, 0.5, 0.36];
const PLAIN = (seed: number) => [1, 99, seed, 1, 0, -1, -1, 0];

/**
 * Sandstone trim on a street front: plinth, string course, cornice and corner
 * quoins, all proud of the plaster. Their tops carry a line of snow.
 */
function stoneBands(walls: GeoBuilder, roofs: GeoBuilder, P: (x: number, y: number, z: number) => THREE.Vector3, w: number, d: number, H: number, seed: number): void {
  const z = -d;
  const slab = (x0: number, x1: number, y0: number, y1: number, out: number, snowTop: boolean) => {
    const zf = z - out;
    const ex = PLAIN(seed);
    const facing = (x: number, y: number, zz: number) => P(x, y, zz).sub(P(0, 0, 0));
    walls.quad(P(x1, y0, zf), P(x0, y0, zf), P(x0, y1, zf), P(x1, y1, zf), [0, y0, x1 - x0, y0, x1 - x0, y1, 0, y1], SANDSTONE, ex, facing(0, 0, -1));
    walls.quad(P(x0, y1, z), P(x0, y1, zf), P(x0, y0, zf), P(x0, y0, z), [0, y1, out, y1, out, y0, 0, y0], SANDSTONE, ex, facing(-1, 0, 0));
    walls.quad(P(x1, y0, z), P(x1, y0, zf), P(x1, y1, zf), P(x1, y1, z), [0, y0, out, y0, out, y1, 0, y1], SANDSTONE, ex, facing(1, 0, 0));
    walls.quad(P(x0, y0, z), P(x1, y0, z), P(x1, y0, zf), P(x0, y0, zf), [0, y0, 1, y0, 1, y0, 0, y0], SANDSTONE, ex, facing(0, -1, 0));
    const top = [P(x0, y1, zf), P(x1, y1, zf), P(x1, y1, z), P(x0, y1, z)] as const;
    if (snowTop) roofs.quad(top[0], top[1], top[2], top[3], [0, 1, 0, 1, 0, 1, 0, 1], SANDSTONE, [2], UP);
    else walls.quad(top[0], top[1], top[2], top[3], [0, y1, 1, y1, 1, y1, 0, y1], SANDSTONE, ex, UP);
  };
  slab(-w, w, 0, 0.55, 0.07, true); // plinth
  slab(-w, w, GROUND_FLOOR_H - 0.06, GROUND_FLOOR_H + 0.1, 0.07, true); // string course
  slab(-w - 0.05, w + 0.05, H - 0.38, H - 0.02, 0.24, false); // cornice (under the eaves)
  // Quoins: alternating long/short blocks up both corners.
  for (const side of [-1, 1]) {
    for (let y = 0.55, i = 0; y < H - 0.45; y += 0.62, i++) {
      const len = i % 2 ? 0.34 : 0.56;
      const x0 = side > 0 ? w - len : -w;
      const x1 = side > 0 ? w : -w + len;
      slab(x0, x1, y, Math.min(y + 0.56, H - 0.4), 0.04, false);
    }
  }
}

function wallQuad(g: GeoBuilder, a: THREE.Vector3, b: THREE.Vector3, H: number, len: number, col: readonly number[], extra: number[]): void {
  const c = b.clone().addScaledVector(UP, H);
  const d = a.clone().addScaledVector(UP, H);
  g.quad(a, b, c, d, [0, 0, len, 0, len, H, 0, H], col, extra);
}

/**
 * Gable roof over a w×d footprint (half extents). If `acrossX`, the ridge runs
 * along local Z (gable faces the street); otherwise along local X.
 */
export function gableRoof(
  walls: GeoBuilder,
  roofs: GeoBuilder,
  P: (x: number, y: number, z: number) => THREE.Vector3,
  w: number,
  d: number,
  H: number,
  rise: number,
  col: readonly number[],
  seed: number,
  acrossX: boolean,
): void {
  const o = OVERHANG;
  // Work in a frame where the ridge runs along "a" (half-length A) and slopes span "b" (half-width B).
  const A = acrossX ? d : w;
  const B = acrossX ? w : d;
  const map = (a: number, y: number, bb: number) => (acrossX ? P(bb, y, a) : P(a, y, bb));
  const pitch = rise / B;
  const eaveY = H - o * pitch;
  const slopeLen = Math.hypot(B + o, rise + o * pitch);
  const ridgeY = H + rise;

  for (const s of [-1, 1]) {
    // Slope quad from eave (b = s*(B+o)) to ridge (b = 0), extending o past the gables.
    const e0 = map(-(A + o), eaveY, s * (B + o));
    const e1 = map(A + o, eaveY, s * (B + o));
    const r1 = map(A + o, ridgeY + 0.16, 0);
    const r0 = map(-(A + o), ridgeY + 0.16, 0);
    const len = 2 * (A + o);
    const s0 = map(-(A + o), eaveY + 0.16, s * (B + o));
    const s1 = map(A + o, eaveY + 0.16, s * (B + o));
    roofs.quad(s0, s1, r1, r0, [0, 0, len, 0, len, slopeLen, 0, slopeLen], SLATE, [0], UP);

    // Snow lip and dark fascia along the eave, facing outward.
    const out = map(0, 0, s).sub(map(0, 0, 0));
    const f0 = map(-(A + o), eaveY - 0.22, s * (B + o));
    const f1 = map(A + o, eaveY - 0.22, s * (B + o));
    const l0 = map(-(A + o), eaveY + 0.16, s * (B + o));
    const l1 = map(A + o, eaveY + 0.16, s * (B + o));
    roofs.quad(f0, f1, e1, e0, [0, 0, len, 0, len, 1, 0, 1], FASCIA, [1], out);
    roofs.quad(e0, e1, l1, l0, [0, 0, len, 0, len, 1, 0, 1], SLATE, [2], out);
  }

  // Gable triangles (plain plaster) at both ends of the ridge.
  for (const s of [-1, 1]) {
    const a = map(s * A, H, -B);
    const b = map(s * A, H, B);
    const c = map(s * A, ridgeY, 0);
    // Outward normal along ±ridge axis.
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const outward = map(s * (A + 1), H, 0).sub(map(s * A, H, 0));
    const extra = [2 * B, ridgeY, seed, 1];
    if (n.dot(outward) > 0) walls.tri(a, b, c, [0, H, 2 * B, H, B, ridgeY], col, extra);
    else walls.tri(b, a, c, [2 * B, H, 0, H, B, ridgeY], col, extra);
  }
}

/** Axis-aligned (in local frame) box with plain walls and a snow cap. */
export function box(
  walls: GeoBuilder,
  roofs: GeoBuilder,
  P: (x: number, y: number, z: number) => THREE.Vector3,
  cx: number,
  cz: number,
  hx: number,
  hz: number,
  y0: number,
  y1: number,
  col: readonly number[],
  seed: number,
): void {
  const cs: [number, number][] = [[cx + hx, cz - hz], [cx - hx, cz - hz], [cx - hx, cz + hz], [cx + hx, cz + hz]];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = cs[i]!;
    const [bx, bz] = cs[(i + 1) % 4]!;
    const len = Math.hypot(bx - ax, bz - az);
    const a = P(ax, y0, az);
    const b = P(bx, y0, bz);
    const h = y1 - y0;
    walls.quad(a, b, b.clone().addScaledVector(UP, h), a.clone().addScaledVector(UP, h), [0, y0, len, y0, len, y1, 0, y1], col, [len, y1, seed, 1]);
  }
  const t = y1 + 0.12;
  const e = 0.06;
  roofs.quad(P(cx - hx - e, t, cz - hz - e), P(cx - hx - e, t, cz + hz + e), P(cx + hx + e, t, cz + hz + e), P(cx + hx + e, t, cz - hz - e), [0, 1, 0, 1, 0, 1, 0, 1], SLATE, [2], UP);
}
