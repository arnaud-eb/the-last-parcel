import * as THREE from 'three/webgpu';
import { cameraPosition, dot, float, max, mix, mx_noise_float, normalWorld, normalize, positionWorld, pow, vec3, vertexColor } from 'three/tsl';
import { GeoBuilder } from './geo';
import { chunkKey } from './chunks';
import { CURB_HEIGHT, SIDEWALK, SEGMENTS, frameAt, inPlaza, onRoad, roadLength } from './roads';
import { terrainHeight, valleyAmount } from './terrain';
import { TERRAIN, parapetSegments } from './parapets';
import { PLAZAS, RIVER, ROADS, VALLEYS, VALLEY_Y, type Road } from './town';
import { box, wallBuilders, wallMeshes } from './buildings';
import { createRng } from '../core/rng';
import { U, cobbleMaterial, lampLight, snowMaterial } from '../render/materials';

type N = any;

const UP = new THREE.Vector3(0, 1, 0);
const WHITE = [1, 1, 1];
const CURB = [0.55, 0.58, 0.66];
const ROCK = [0.32, 0.31, 0.32];
const SANDSTONE = [0.58, 0.5, 0.38];

/** One GeoBuilder per map chunk, keyed by where each quad lands. */
class Chunked {
  private readonly map = new Map<string, GeoBuilder>();
  constructor(private readonly make: () => GeoBuilder) {}
  at(x: number, z: number): GeoBuilder {
    const k = chunkKey(x, z);
    let g = this.map.get(k);
    if (!g) this.map.set(k, (g = this.make()));
    return g;
  }
  meshes(material: THREE.Material, name: string): THREE.Mesh[] {
    return [...this.map].map(([k, g]) => Object.assign(new THREE.Mesh(g.build(), material), { name: `${name} ${k}` }));
  }
}

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Roads, squares, sidewalks, snowbanks, terrain, bridge, parapets, river and valley trees. */
export function buildStreet(): THREE.Group {
  const road = new Chunked(() => new GeoBuilder());
  const snow = new Chunked(() => new GeoBuilder());
  const stone = wallBuilders();

  ROADS.forEach((r, i) => addRoad(r, i, road, snow));
  for (const p of PLAZAS) addPlaza(p.x, p.z, p.hx, p.hz, p.y, road);
  addTerrain(snow);
  addBridge(stone.walls, stone.roofs);
  addParapets(stone.walls, stone.roofs);

  const group = new THREE.Group();
  group.name = 'street';
  group.add(...road.meshes(cobbleMaterial(), 'road'));
  group.add(...snow.meshes(snowMaterial(), 'snow'));
  group.add(...wallMeshes(stone.walls, stone.roofs, 'stonework'));
  group.add(buildRiver(), buildValleyTrees());
  return group;
}

// ---------- roads ----------

function addRoad(r: Road, index: number, road: Chunked, snow: Chunked): void {
  const len = roadLength(r);
  const step = 1.5;
  const hw = r.halfWidth;
  // Tiny per-road lift so overlapping ribbons at junctions don't z-fight.
  const lift = 0.004 + index * 0.0015;
  const P = (s: number, lat: number, dy = 0) => {
    const f = frameAt(r, s);
    return v3(f.x + f.nx * lat, f.y + dy, f.z + f.nz * lat);
  };
  // Vertex colour .r carries the half-width to the cobble shader (snow piles toward the curbs).
  const col = [hw / 10, 0, 0];
  for (let s = 0; s < len - 1e-6; s += step) {
    const s1 = Math.min(len, s + step);
    const a0 = P(s, -hw, lift);
    const a1 = P(s, hw, lift);
    const b1 = P(s1, hw, lift);
    const b0 = P(s1, -hw, lift);
    road.at(a0.x, a0.z).quad(a0, a1, b1, b0, [-hw, s, hw, s, hw, s1, -hw, s1], col, [], UP);

    if (r.bridge) continue;
    for (const side of [-1, 1] as const) {
      // Skip sidewalk where it would cross another street or a square.
      const mid = P((s + s1) / 2, side * (hw + SIDEWALK / 2));
      if (onRoad(mid.x, mid.z, 0.2, r) || inPlaza(mid.x, mid.z, 0.3)) continue;
      const inner = side * hw;
      const outer = side * (hw + SIDEWALK + 0.6);
      const g = snow.at(mid.x, mid.z);
      const toRoad = P(s, -side).sub(P(s, 0));
      g.quad(P(s, inner), P(s1, inner), P(s1, inner, CURB_HEIGHT), P(s, inner, CURB_HEIGHT), [0, 0, 1, 0, 1, 1, 0, 1], CURB, [], toRoad);
      g.quad(P(s, inner, CURB_HEIGHT), P(s, outer, CURB_HEIGHT), P(s1, outer, CURB_HEIGHT), P(s1, inner, CURB_HEIGHT), [0, 0, 1, 0, 1, 1, 0, 1], WHITE, [], UP);
      // Snowbank: a lumpy hump ploughed against the curb.
      const ha = 0.6 + 0.6 * noise1(s * 0.35 + side * 10 + index * 7);
      const hb = 0.6 + 0.6 * noise1(s1 * 0.35 + side * 10 + index * 7);
      const prof = [0, 0.15, 0.45, 0.8, 1.0];
      const hts = [0, 0.22, 0.34, 0.2, 0];
      for (let i = 0; i < prof.length - 1; i++) {
        const la = side * (hw + 0.05 + prof[i]! * 0.95);
        const lb = side * (hw + 0.05 + prof[i + 1]! * 0.95);
        g.quad(
          P(s, la, CURB_HEIGHT + hts[i]! * ha), P(s, lb, CURB_HEIGHT + hts[i + 1]! * ha),
          P(s1, lb, CURB_HEIGHT + hts[i + 1]! * hb), P(s1, la, CURB_HEIGHT + hts[i]! * hb),
          [0, 0, 1, 0, 1, 1, 0, 1], WHITE, [], UP,
        );
      }
    }
  }
}

function addPlaza(cx: number, cz: number, hx: number, hz: number, y: number, road: Chunked): void {
  const col = [0.99, 0, 0]; // huge "half-width": no curb snow, just patchy
  const step = 4;
  for (let z = cz - hz; z < cz + hz - 1e-6; z += step) {
    for (let x = cx - hx; x < cx + hx - 1e-6; x += step) {
      const x1 = Math.min(cx + hx, x + step);
      const z1 = Math.min(cz + hz, z + step);
      road.at(x, z).quad(v3(x, y + 0.003, z1), v3(x1, y + 0.003, z1), v3(x1, y + 0.003, z), v3(x, y + 0.003, z), [x, z1, x1, z1, x1, z, x, z], col, [], UP);
    }
  }
}

// ---------- terrain ----------

const TERRAIN_STEP = 4;

/** Snow-covered ground everywhere, dark rock where the cliffs are steep. */
function addTerrain(snow: Chunked): void {
  const { x0, x1, z0, z1 } = TERRAIN;
  const step = TERRAIN_STEP;
  const nx = Math.round((x1 - x0) / step);
  const nz = Math.round((z1 - z0) / step);
  const h = new Float32Array((nx + 1) * (nz + 1));
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) h[j * (nx + 1) + i] = terrainHeight(x0 + i * step, z0 + j * step) - 0.02;
  const H = (i: number, j: number) => h[Math.min(nz, Math.max(0, j)) * (nx + 1) + Math.min(nx, Math.max(0, i))]!;
  const colorAt = (i: number, j: number) => {
    const slope = Math.hypot(H(i + 1, j) - H(i - 1, j), H(i, j + 1) - H(i, j - 1)) / (2 * step);
    const k = Math.min(1, Math.max(0, (slope - 0.6) * 1.5));
    return [1 + (ROCK[0]! - 1) * k, 1 + (ROCK[1]! - 1) * k, 1 + (ROCK[2]! - 1) * k];
  };
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const xa = x0 + i * step;
      const za = z0 + j * step;
      const g = snow.at(xa + step / 2, za + step / 2);
      const verts = [[i, j + 1], [i + 1, j + 1], [i + 1, j], [i, j]] as const;
      const idx = verts.map(([a, b]) => {
        const p = v3(x0 + a * step, H(a, b), z0 + b * step);
        const n = v3(H(a - 1, b) - H(a + 1, b), 2 * step, H(a, b - 1) - H(a, b + 1)).normalize();
        return g.vertex(p, n, p.x, p.z, colorAt(a, b));
      });
      g.indices(idx[0]!, idx[1]!, idx[2]!, idx[0]!, idx[2]!, idx[3]!);
    }
  }
}

// ---------- bridge, parapets ----------

/**
 * Pont Adolphe: deck, the great stone arch over the Pétrusse, and above it the
 * open spandrels: piers joined by small arches on both faces. The stone is
 * floodlit warm from below, as at night in the real city.
 */
function addBridge(walls: GeoBuilder, roofs: GeoBuilder): void {
  const r = ROADS.find((x) => x.bridge)!;
  const [ax, , az] = r.points[0]!;
  const [bx, , bz] = r.points[r.points.length - 1]!;
  const rot = Math.atan2(bx - ax, bz - az);
  const len = Math.hypot(bx - ax, bz - az);
  const mx = (ax + bx) / 2;
  const mz = (az + bz) / 2;
  const m = new THREE.Matrix4().makeRotationY(rot).setPosition(mx, 0, mz);
  const P = (x: number, y: number, z: number) => v3(x, y, z).applyMatrix4(m);
  const N = (x: number, y: number, z: number) => P(x, y, z).sub(P(0, 0, 0));
  const hw = r.halfWidth + 0.7;
  // Floodlit plain stone (aWall kind 1 = plain; aFacade.w 2 = floodlit).
  const ex = [1, 99, 0.31, 1, 0, -1, -1, 2];
  // Deck slab under the road.
  box(walls, roofs, P, 0, 0, hw, len / 2 + 2, -1.4, -0.02, SANDSTONE, 0.31, true);

  /** A stone arch from z0 to z1: `y(t)` is the intrados line, `thick` the ring depth, both faces and the soffit. */
  const arch = (za: number, zb: number, y: (t: number) => number, thick: number, steps: number, x0 = -hw, x1 = hw) => {
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const z0 = za + (zb - za) * t0;
      const z1 = za + (zb - za) * t1;
      const y0 = y(t0);
      const y1 = y(t1);
      walls.quad(P(x0, y0 + thick, z0), P(x1, y0 + thick, z0), P(x1, y1 + thick, z1), P(x0, y1 + thick, z1), [0, y0, 1, y0, 1, y1, 0, y1], SANDSTONE, ex, N(0, 1, 0));
      walls.quad(P(x0, y0, z0), P(x0, y1, z1), P(x1, y1, z1), P(x1, y0, z0), [0, y0, 0, y1, 1, y1, 1, y0], SANDSTONE, ex, N(0, -1, 0));
      for (const [x, s] of [[x0, -1], [x1, 1]] as const) {
        walls.quad(P(x, y0, z0), P(x, y0 + thick, z0), P(x, y1 + thick, z1), P(x, y1, z1), [z0, y0, z0, y0 + thick, z1, y1 + thick, z1, y1], SANDSTONE, ex, N(s, 0, 0));
      }
    }
  };

  // The great arch: springs from the valley sides, crown just under the deck.
  const { zNorth, zSouth } = VALLEYS.petrusse;
  const span = zSouth - zNorth - 10;
  const top = -2.2;
  const thick = 3.2;
  const archY = (t: number) => VALLEY_Y + 2 + (top - VALLEY_Y - 2) * Math.sin(Math.PI * t);
  arch(-span / 2, span / 2, (t) => archY(t) - thick, thick, 40);

  // Open spandrels: piers standing on the arch, joined under the deck by small round arches.
  const piers: number[] = [];
  for (let z = -span / 2 + 6; z < span / 2 - 4; z += 7) {
    const t = (z + span / 2) / span;
    const y0 = archY(t) - 0.5;
    if (-1.4 - y0 < 1.5) continue;
    box(walls, roofs, P, 0, z, hw - 0.4, 0.9, y0, -1.4, SANDSTONE, 0.31, true);
    piers.push(z);
  }
  for (let i = 0; i + 1 < piers.length; i++) {
    const za = piers[i]! + 0.9;
    const zb = piers[i + 1]! - 0.9;
    const rise = Math.min(2.4, (zb - za) / 2);
    const spring = -1.4 - rise - 0.6;
    // Only where the gap under the deck is tall enough to read as an arch.
    const t = ((za + zb) / 2 + span / 2) / span;
    if (spring - archY(t) < 1.2) continue;
    // Fill between the round arch and the deck: both faces and the soffit underneath.
    const curve = (u: number) => spring + rise * Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2));
    const x0 = -hw + 0.4;
    const x1 = hw - 0.4;
    const steps = 12;
    for (let k = 0; k < steps; k++) {
      const u0 = k / steps;
      const u1 = (k + 1) / steps;
      const z0 = za + (zb - za) * u0;
      const z1 = za + (zb - za) * u1;
      const y0 = curve(u0);
      const y1 = curve(u1);
      walls.quad(P(x0, y0, z0), P(x0, y1, z1), P(x1, y1, z1), P(x1, y0, z0), [0, y0, 0, y1, 1, y1, 1, y0], SANDSTONE, ex, N(0, -1, 0));
      for (const [x, sd] of [[x0, -1], [x1, 1]] as const) {
        walls.quad(P(x, y0, z0), P(x, -1.4, z0), P(x, -1.4, z1), P(x, y1, z1), [z0, y0, z0, -1.4, z1, -1.4, z1, y1], SANDSTONE, ex, N(sd, 0, 0));
      }
    }
  }

  // Abutment piers down to the valley floor at both ends.
  for (const s of [-1, 1]) box(walls, roofs, P, 0, s * (span / 2 + 2), hw, 4, VALLEY_Y - 1, -1.4, SANDSTONE, 0.31, true);
  // Parapets on the deck, over the valley only (rim to rim) so the junctions at both ends stay open.
  const plen = zSouth - zNorth + 4;
  for (const s of [-1, 1]) {
    for (let z = -plen / 2; z < plen / 2 - 1e-6; z += 6) {
      const z1 = Math.min(plen / 2, z + 6);
      box(walls, roofs, P, s * (hw - 0.2), (z + z1) / 2, 0.2, (z1 - z) / 2, 0, 0.95, SANDSTONE, 0.31);
    }
  }
}

/** Low stone walls along cliff-edge streets and the Constitution / Bock viewpoints. */
function addParapets(walls: GeoBuilder, roofs: GeoBuilder): void {
  for (const w of parapetSegments()) {
    const len = Math.hypot(w.bx - w.ax, w.bz - w.az);
    if (len < 0.5) continue;
    const m = new THREE.Matrix4().makeRotationY(Math.atan2(w.bx - w.ax, w.bz - w.az)).setPosition((w.ax + w.bx) / 2, w.y, (w.az + w.bz) / 2);
    const P = (x: number, y: number, z: number) => v3(x, y, z).applyMatrix4(m);
    box(walls, roofs, P, 0, 0, 0.22, len / 2, -0.4, 0.95, SANDSTONE, 0.42);
  }
}

// ---------- river, trees ----------

function buildRiver(): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(RIVER.halfWidth * 2, 560, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.08, metalness: 0.2 });
  const V = normalize(cameraPosition.sub(positionWorld));
  const fres = pow(float(1).sub(max(dot(normalWorld, V), 0)), 3);
  const ripple = mx_noise_float((positionWorld as N).xz.mul(vec3(0.3, 0.08, 0).xy).add((U.time as N).mul(0.15))).mul(0.5).add(0.5);
  const albedo = vec3(0.015, 0.025, 0.04);
  m.colorNode = albedo;
  m.emissiveNode = mix((U.horizon as N).mul(0.6), (U.horizon as N).mul(1.1), ripple).mul(fres).add(lampLight(positionWorld, normalWorld, albedo, float(3), float(90)));
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(RIVER.x, RIVER.y, 0);
  mesh.name = 'river';
  return mesh;
}

/** Snowy fir trees in the Pétrusse and Alzette valleys, one instanced mesh. */
function buildValleyTrees(): THREE.InstancedMesh {
  const rng = createRng('valley-trees');
  const g = new GeoBuilder();
  g.merge(new THREE.CylinderGeometry(0.12, 0.18, 1.2, 6), new THREE.Matrix4().makeTranslation(0, 0.6, 0), [0.14, 0.09, 0.06]);
  for (let t = 0; t < 3; t++) {
    const r = 1.4 - t * 0.38;
    const h = 1.9 - t * 0.35;
    const cone = new THREE.ConeGeometry(r, h, 8, 2, true);
    const pos = cone.getAttribute('position');
    const col = new Float32Array(pos.count * 3);
    for (let v = 0; v < pos.count; v++) {
      const k = (pos.getY(v) + h / 2) / h;
      const snowy = Math.min(1, Math.max(0, (k - 0.25) * 2)) * (0.4 + 0.6 * Math.abs(Math.sin(v * 7.1 + t)));
      col.set([0.03 + snowy * 0.72, 0.08 + snowy * 0.72, 0.05 + snowy * 0.84], v * 3);
    }
    cone.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.merge(cone, new THREE.Matrix4().makeTranslation(0, 1.0 + t * 1.0 + h / 2, 0), [1, 1, 1]);
  }
  const mats: THREE.Matrix4[] = [];
  for (let i = 0; i < 3000 && mats.length < 420; i++) {
    const x = rng.range(-200, 440);
    const z = rng.range(-260, 260);
    const v = valleyAmount(x, z);
    if (v < 0.15) continue; // valleys and their slopes only
    if (Math.abs(x - RIVER.x) < RIVER.halfWidth + 2) continue;
    if (onRoad(x, z, 3.5) || inPlaza(x, z, 2)) continue;
    // Not under the bridge deck line.
    const near = SEGMENTS.find((s) => s.road.bridge);
    if (near && Math.abs(x - near.ax) < 8 && z > near.bz && z < near.az) continue;
    const y = terrainHeight(x, z);
    const s = rng.range(1.6, 3.4);
    mats.push(new THREE.Matrix4().compose(v3(x, y - 0.2, z), new THREE.Quaternion().setFromAxisAngle(UP, rng.range(0, 6.28)), v3(s, s * rng.range(0.9, 1.3), s)));
  }
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.85 });
  const albedo = vertexColor().rgb;
  m.colorNode = albedo;
  m.emissiveNode = lampLight(positionWorld, normalWorld, albedo, float(0.05), float(10));
  const mesh = new THREE.InstancedMesh(g.build(), m, mats.length);
  mats.forEach((mm, i) => mesh.setMatrixAt(i, mm));
  mesh.computeBoundingSphere();
  mesh.name = 'valley-trees';
  return mesh;
}

/** Smooth 1D value noise in [0,1]. */
function noise1(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const h = (n: number) => {
    const s = Math.sin(n * 127.1) * 43758.5453;
    return s - Math.floor(s);
  };
  const t = f * f * (3 - 2 * f);
  return h(i) * (1 - t) + h(i + 1) * t;
}
