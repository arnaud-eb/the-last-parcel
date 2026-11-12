import * as THREE from 'three/webgpu';
import { GeoBuilder } from './geo';
import type { Building, Spire } from './layout';
import { facadeMaterial, roofMaterial } from '../render/materials';

const UP = new THREE.Vector3(0, 1, 0);
const OVERHANG = 0.35;
const SLATE = [0.08, 0.085, 0.1];
const FASCIA = [0.13, 0.085, 0.06];
const BRICK = [0.4, 0.22, 0.17];
const STONE = [0.42, 0.42, 0.44];
const COPPER = [0.14, 0.22, 0.2];

/** All buildings as two merged meshes: walls (facade material) and roofs (snowy roof material). */
export function buildBuildings(buildings: readonly Building[], spires: readonly Spire[]): THREE.Group {
  const walls = new GeoBuilder('aWall', 4);
  const roofs = new GeoBuilder('aRoof', 1);
  for (const b of buildings) addBuilding(walls, roofs, b);
  for (const s of spires) addSpire(walls, roofs, s);

  const group = new THREE.Group();
  group.name = 'buildings';
  const wallMesh = new THREE.Mesh(walls.build(), facadeMaterial());
  const roofMesh = new THREE.Mesh(roofs.build(), roofMaterial());
  wallMesh.name = 'walls';
  roofMesh.name = 'roofs';
  group.add(wallMesh, roofMesh);
  return group;
}

function addBuilding(walls: GeoBuilder, roofs: GeoBuilder, b: Building): void {
  const m = new THREE.Matrix4().makeRotationY(b.rot).setPosition(b.x, 0, b.z);
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
    const kind = isFront || b.solid ? 0 : 1;
    wallQuad(walls, P(ax, 0, az), P(bx, 0, bz), H, len, col, [len, H, b.seed + i * 0.13, i === 2 ? 1 : kind]);
  }

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

function wallQuad(g: GeoBuilder, a: THREE.Vector3, b: THREE.Vector3, H: number, len: number, col: readonly number[], extra: number[]): void {
  const c = b.clone().addScaledVector(UP, H);
  const d = a.clone().addScaledVector(UP, H);
  g.quad(a, b, c, d, [0, 0, len, 0, len, H, 0, H], col, extra);
}

/**
 * Gable roof over a w×d footprint (half extents). If `acrossX`, the ridge runs
 * along local Z (gable faces the street); otherwise along local X.
 */
function gableRoof(
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
function box(
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

function addSpire(walls: GeoBuilder, roofs: GeoBuilder, s: Spire): void {
  const m = new THREE.Matrix4().makeTranslation(s.x, 0, s.z);
  const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(m);
  const hw = s.width / 2;
  const towerTop = s.height * 0.55;
  box(walls, roofs, P, 0, 0, hw, hw, 0, towerTop, STONE, 0.5);
  // Slender four-sided needle.
  const apex = P(0, s.height, 0);
  const cs: [number, number][] = [[hw, -hw], [-hw, -hw], [-hw, hw], [hw, hw]];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = cs[i]!;
    const [bx, bz] = cs[(i + 1) % 4]!;
    roofs.tri(P(ax, towerTop, az), P(bx, towerTop, bz), apex, [0, 0, 1, 0, 0.5, 1], COPPER, [1]);
  }
}
