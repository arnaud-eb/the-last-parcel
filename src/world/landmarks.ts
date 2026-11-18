/**
 * Landmarks (SPEC §3), as recognisable blocking volumes for M2. The main
 * block of each one is a regular Building (so it gets windows, relief and a
 * collider); the silhouette pieces that make it recognisable are built here.
 */
import * as THREE from 'three/webgpu';
import { abs, atan, attribute, float, floor, fract, hash, length, mix, normalWorld, positionWorld, pow, smoothstep, step, uv, vec2, vec3, vertexColor } from 'three/tsl';
import { GeoBuilder } from './geo';
import { box, wallBuilders, wallMeshes } from './buildings';
import type { Landmark } from './town';
import { U, fogFactor, lampLight } from '../render/materials';
import { buildTree } from './props';
import { GARE_TOWER, landmarkBuildings, lm } from './landmarkBlocks';

type N = any;
type Rgb = [number, number, number];

const SANDSTONE: Rgb = [0.66, 0.56, 0.4];
const GREY_STONE: Rgb = [0.6, 0.58, 0.54];
const PALE: Rgb = [0.72, 0.62, 0.46];
const CREAM: Rgb = [0.9, 0.86, 0.74];
const SLATE: Rgb = [0.09, 0.095, 0.11];
const COPPER: Rgb = [0.16, 0.36, 0.3];
const BRONZE: Rgb = [0.16, 0.3, 0.26];
const BLUE: Rgb = [0.1, 0.18, 0.34];
const IRON: Rgb = [0.05, 0.055, 0.06];


/**
 * Floodlit stone: lit warm from below, and only half-fogged so the spires
 * and towers read across the whole town (the player's compass).
 */
function floodlitMaterial(base: number, top: number, strength = 1): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.7 });
  const albedo = vertexColor().rgb as N;
  const lit = smoothstep(top, base, (positionWorld as N).y).mul(0.65).add(0.35);
  const glow = albedo.mul(vec3(1.0, 0.86, 0.62)).mul(lit.mul(strength * 0.9));
  const f = fogFactor().mul(0.5);
  m.colorNode = albedo;
  m.emissiveNode = mix(glow.add(lampLight(positionWorld, normalWorld, albedo, float(0.1), float(10))), U.horizon as N, f);
  m.fog = false;
  return m;
}

function glowMat(): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial();
  m.colorNode = attribute('aTint', 'vec3') as N;
  return m;
}

/** Instanced glowing panels (stained glass, clock faces, door lights). */
class Glows {
  private readonly items: { m: THREE.Matrix4; c: Rgb }[] = [];
  add(m: THREE.Matrix4, c: Rgb): void {
    this.items.push({ m, c });
  }
  build(geo: THREE.BufferGeometry, name: string): THREE.InstancedMesh {
    const g = geo.clone();
    g.setAttribute('aTint', new THREE.InstancedBufferAttribute(new Float32Array(this.items.flatMap((i) => i.c)), 3));
    const mesh = new THREE.InstancedMesh(g, glowMat(), this.items.length);
    this.items.forEach((it, i) => mesh.setMatrixAt(i, it.m));
    mesh.computeBoundingSphere();
    mesh.name = name;
    return mesh;
  }
}

/**
 * Stained glass, lit from inside: lead-lined mosaic of blue, ruby and gold.
 * aShape 0 = pointed Gothic lancet (two lights and a mullion), 1 = rose window.
 */
function stainedMat(): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial();
  const p = uv() as N;
  const shape = attribute('aShape', 'float') as N;
  const tint = attribute('aTint', 'vec3') as N;
  // Lancet: straight sides, pointed top from 78% up.
  const top = smoothstep(0.78, 1.0, p.y);
  const halfW = float(0.5).mul(pow(float(1).sub(top), 0.6));
  const lancet = step(abs(p.x.sub(0.5)), halfW.sub(0.02));
  const mullion = step(0.035, abs(p.x.sub(0.5)));
  const lCell = floor(vec2(p.x.mul(4), p.y.mul(11)));
  const lLead = step(0.1, fract(p.x.mul(4))).mul(step(0.07, fract(p.y.mul(11))));
  // Rose: circle with radial petals and rings.
  const q = p.sub(0.5).mul(2);
  const r = length(q);
  const ang = atan(q.y, q.x).div(6.2832).add(0.5);
  const rose = step(r, 0.97);
  const rCell = floor(vec2(ang.mul(16), r.mul(4)));
  const rLead = step(0.08, fract(ang.mul(16))).mul(step(0.1, fract(r.mul(4)))).mul(step(0.1, r));
  const isRose = step(0.5, shape);
  const cell = mix(lCell, rCell, isRose);
  const lead = mix(lLead.mul(mullion), rLead, isRose);
  const mask = mix(lancet, rose, isRose);
  const h = hash(cell.x.add(cell.y.mul(37.1)));
  const col = mix(mix(vec3(0.12, 0.25, 1.0), vec3(1.0, 0.12, 0.16), step(0.55, h)), vec3(1.0, 0.72, 0.22), step(0.85, h));
  m.colorNode = col.mul(lead.mul(0.85).add(0.15)).mul(tint);
  m.opacityNode = mask;
  m.alphaTest = 0.5;
  return m;
}

/** Instanced stained-glass windows (cathedral lancets, rose windows). */
class StainedGlass {
  private readonly items: { m: THREE.Matrix4; shape: number; tint: number }[] = [];
  add(m: THREE.Matrix4, shape: 0 | 1, tint = 1.6): void {
    this.items.push({ m, shape, tint });
  }
  build(): THREE.InstancedMesh {
    const g = new THREE.PlaneGeometry(1, 1);
    g.setAttribute('aShape', new THREE.InstancedBufferAttribute(new Float32Array(this.items.map((i) => i.shape)), 1));
    g.setAttribute('aTint', new THREE.InstancedBufferAttribute(new Float32Array(this.items.flatMap((i) => [i.tint, i.tint, i.tint])), 3));
    const mesh = new THREE.InstancedMesh(g, stainedMat(), this.items.length);
    this.items.forEach((it, i) => mesh.setMatrixAt(i, it.m));
    mesh.computeBoundingSphere();
    mesh.name = 'stained-glass';
    return mesh;
  }
}

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Local → world transform helper for a landmark. */
function frame(l: Landmark) {
  const m = new THREE.Matrix4().makeRotationY(l.rot).setPosition(l.x, l.y, l.z);
  const P = (x: number, y: number, z: number) => v3(x, y, z).applyMatrix4(m);
  const M = (x: number, y: number, z: number, rotY = 0, s: [number, number, number] = [1, 1, 1]) =>
    new THREE.Matrix4().multiplyMatrices(m, new THREE.Matrix4().compose(v3(x, y, z), new THREE.Quaternion().setFromAxisAngle(v3(0, 1, 0), rotY), v3(...s)));
  return { P, M };
}

/** Pyramid / needle spire on a square or octagonal base. */
// Extras for the shared builders: plain wall (no windows) / bare roof (no snow on steep spires).
const PLAIN_WALL = [1, 99, 0.5, 1, 0, -1, -1, 0];
const BARE_ROOF = [1];

function needle(g: GeoBuilder, P: (x: number, y: number, z: number) => THREE.Vector3, cx: number, cz: number, r: number, y0: number, y1: number, sides: number, col: Rgb, extra: number[] = BARE_ROOF): void {
  const apex = P(cx, y1, cz);
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2 + Math.PI / sides;
    const a1 = ((i + 1) / sides) * Math.PI * 2 + Math.PI / sides;
    g.tri(P(cx + Math.cos(a1) * r, y0, cz + Math.sin(a1) * r), P(cx + Math.cos(a0) * r, y0, cz + Math.sin(a0) * r), apex, [0, 0, 1, 0, 0.5, 1], col, extra);
  }
}

/** Prism (n-sided column) from y0 to y1. */
function column(g: GeoBuilder, P: (x: number, y: number, z: number) => THREE.Vector3, cx: number, cz: number, r: number, y0: number, y1: number, sides: number, col: Rgb, extra: number[] = PLAIN_WALL): void {
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2 + Math.PI / sides;
    const a1 = ((i + 1) / sides) * Math.PI * 2 + Math.PI / sides;
    const p0 = P(cx + Math.cos(a0) * r, y0, cz + Math.sin(a0) * r);
    const p1 = P(cx + Math.cos(a1) * r, y0, cz + Math.sin(a1) * r);
    g.quad(p1, p0, P(cx + Math.cos(a0) * r, y1, cz + Math.sin(a0) * r), P(cx + Math.cos(a1) * r, y1, cz + Math.sin(a1) * r), [0, y0, 1, y0, 1, y1, 0, y1], col, extra);
  }
}

/** Everything that makes the landmarks recognisable beyond their main block. */
export function buildLandmarkExtras(): THREE.Group {
  const stone = wallBuilders(); // plain stone walls + snow caps, facade/roof materials
  const flood = new GeoBuilder(); // floodlit towers and spires
  const props = new GeoBuilder(); // vertex-coloured props (lions, sentry boxes, wheel frame)
  const glows = new Glows();
  const stained = new StainedGlass();

  // --- Cathedral: two dark slate needle spires on the front towers, a green copper spire over the crossing.
  {
    const l = lm('cathedral');
    const { P, M } = frame(l);
    const front = -26; // local -Z end faces the square
    for (const sx of [-7.5, 7.5]) {
      column(flood, P, sx, front + 3, 3.6, 0, 34, 4, SANDSTONE);
      column(flood, P, sx, front + 3, 3.0, 34, 38, 8, SANDSTONE);
      needle(flood, P, sx, front + 3, 3.1, 38, 74, 8, SLATE);
      // Belfry openings glow faintly.
      for (const side of [0, 1, 2, 3]) {
        const a = (side * Math.PI) / 2;
        glows.add(M(sx + Math.sin(a) * 3.62, 30, front + 3 + Math.cos(a) * 3.62, a, [1.1, 3, 1]), [0.9, 0.55, 0.22]);
      }
    }
    column(flood, P, 0, 8, 3.2, 20, 27, 8, COPPER);
    needle(flood, P, 0, 8, 3.2, 27, 60, 8, COPPER);
    // Tall stained-glass lancets along both sides of the nave between stepped buttresses with pinnacles,
    // and a rose window over the front door.
    for (const sx of [-1, 1]) {
      for (let z = front + 10; z < 24; z += 6) stained.add(M(sx * 12.03, 8.2, z, sx * Math.PI / 2, [1.9, 7.6, 1]), 0);
      for (let z = front + 7; z < 27; z += 6) {
        box(flood, flood, P, sx * 12.6, z, 0.6, 0.45, 0, 10, SANDSTONE, 0.4);
        box(flood, flood, P, sx * 12.4, z, 0.4, 0.38, 10, 13.5, SANDSTONE, 0.4);
        needle(flood, P, sx * 12.4, z, 0.42, 13.5, 16.5, 4, SANDSTONE);
      }
    }
    stained.add(M(0, 11, front - 0.03, Math.PI, [4.6, 4.6, 1]), 1, 1.8);
    glows.add(M(0, 2.8, front - 0.02, Math.PI, [3, 5, 1]), [2.0, 1.0, 0.45]);
  }

  // --- Palais Grand-Ducal: corner oriel towers with pointed slate turrets, balcony, blue door, sentry boxes.
  {
    const l = lm('palais');
    const { P, M } = frame(l);
    const b = landmarkBuildings().find((x) => x.x === l.x && x.z === l.z)!;
    const w = b.width / 2;
    const d = b.depth / 2;
    for (const sx of [-w + 2, w - 2, -w / 3, w / 3]) {
      const big = Math.abs(sx) > w / 2;
      const r = big ? 2.1 : 1.3;
      const y0 = big ? 3.4 : b.height - 1;
      column(stone.walls, P, sx, -d - (big ? 0.9 : 0.2), r, y0, b.height + (big ? 1.2 : 0.4), 8, SANDSTONE);
      needle(stone.roofs, P, sx, -d - (big ? 0.9 : 0.2), r + 0.25, b.height + (big ? 1.2 : 0.4), b.height + (big ? 9 : 6), 8, SLATE);
    }
    // First-floor balcony on corbels with an iron railing.
    box(stone.walls, stone.roofs, P, 0, -d - 0.5, w - 4, 0.5, 3.55, 3.75, SANDSTONE, 0.62);
    box(props, props, P, 0, -d - 0.98, w - 4, 0.03, 3.75, 4.6, IRON, 0.62);
    // Blue arched door and the two blue sentry boxes either side.
    const doorX = w - (b.doorCol + 0.5) * (b.width / Math.max(1, Math.floor(b.width / 2.6)));
    glows.add(M(doorX, 1.6, -d - 0.04, Math.PI, [1.5, 3, 1]), [0.25, 0.38, 0.6]);
    for (const s of [-1, 1]) {
      box(props, props, P, doorX + s * 2.4, -d - 1.4, 0.55, 0.55, 0, 2.3, BLUE, 0.1);
      needle(props, P, doorX + s * 2.4, -d - 1.4, 0.85, 2.3, 3.1, 4, BLUE);
      glows.add(M(doorX + s * 2.4, 1.7, -d - 1.96, Math.PI, [0.5, 0.7, 1]), [1.6, 0.9, 0.4]);
    }
  }

  // --- Hôtel de Ville: wide front steps, two green bronze lions, roof balustrade and flag, chimneys, lanterns.
  {
    const l = lm('hotelDeVille');
    const { P, M } = frame(l);
    const b = landmarkBuildings().find((x) => x.x === l.x && x.z === l.z)!;
    const d = b.depth / 2;
    const H = b.height;
    // Wide front steps straight up to the doors (no portico: the real facade is flat).
    const pd = 0;
    for (let i = 0; i < 4; i++) {
      const out = (4 - i) * 0.45;
      box(stone.walls, stone.roofs, P, 0, -d - out / 2, 9 - i * 0.3, out / 2, 0, 0.15 * (i + 1), CREAM, 0.21);
    }
    // Balustrade and flagpole along the roof line.
    box(stone.walls, stone.roofs, P, 0, -d - 0.1, b.width / 2, 0.2, H, H + 0.9, CREAM, 0.21);
    box(props, props, P, 0, -d + 1, 0.06, 0.06, H, H + 7, IRON, 0.21);
    glows.add(M(0.9, H + 6.2, -d + 1, Math.PI, [1.7, 1.1, 1]), [2.4, 0.3, 0.25]); // red-white-blue flag, lit
    for (const s of [-1, 1]) {
      box(stone.walls, stone.roofs, P, s * 12.5, -d - pd - 1.6, 1, 1.4, 0, 1.4, SANDSTONE, 0.21);
      // Lion: body, chest, head, mane, crouched on the plinth.
      box(props, props, P, s * 12.5, -d - pd - 1.6, 0.42, 1.0, 1.4, 2.1, BRONZE, 0.21);
      box(props, props, P, s * 12.5, -d - pd - 2.3, 0.45, 0.35, 1.4, 2.6, BRONZE, 0.21);
      box(props, props, P, s * 12.5, -d - pd - 2.55, 0.38, 0.32, 2.3, 2.95, BRONZE, 0.21);
      box(props, props, P, s * 9, 3, 0.5, 0.5, H, H + 4.5, [0.5, 0.42, 0.32], 0.21); // chimneys
    }
    for (let x = -15; x <= 15; x += 6) if (Math.abs(x) > 10) glows.add(M(x, 2.8, -d - 0.25, Math.PI, [0.35, 0.5, 1]), [3, 1.6, 0.6]);
  }

  // --- Gare: copper cupola and lit clock faces on the stone tower, the arched glass of the hall, lit doors.
  {
    const l = lm('gare');
    const { P, M } = frame(l);
    const t = GARE_TOWER;
    const top = t.height;
    box(stone.walls, stone.roofs, P, t.x, t.z, t.half + 0.35, t.half + 0.35, top - 0.2, top + 0.9, PALE, 0.83); // cornice
    column(flood, P, t.x, t.z, 3.9, top + 0.9, top + 6, 8, COPPER);
    column(flood, P, t.x, t.z, 2.9, top + 6, top + 10, 8, COPPER);
    column(flood, P, t.x, t.z, 1.6, top + 10, top + 13, 8, COPPER);
    needle(flood, P, t.x, t.z, 1.7, top + 13, top + 20, 8, COPPER);
    for (let side = 0; side < 4; side++) {
      const a = (side * Math.PI) / 2;
      const r = t.half + 0.03;
      glows.add(M(t.x + Math.sin(a) * r, top - 5, t.z + Math.cos(a) * r, a, [3.6, 3.6, 1]), [2.6, 2.3, 1.7]);
      // A slit window lower down each face.
      glows.add(M(t.x + Math.sin(a) * r, top - 15, t.z + Math.cos(a) * r, a, [0.9, 3.2, 1]), [1.4, 0.8, 0.35]);
    }
    // Hall front: tall arched window in a stone surround (stepped glass for the arch), lit doors below.
    const fz = -10.6 - 0.06; // hall front (depth 20.6, centred 0.3 forward)
    box(stone.walls, stone.roofs, P, 0, fz + 0.2, 6.2, 0.3, 4.2, 4.6, PALE, 0.9); // sill
    for (let i = 0; i < 6; i++) {
      const hw = 5 * Math.sqrt(1 - (i / 6) ** 2);
      glows.add(M(0, 13.2 + i * 0.75, fz, Math.PI, [hw * 2, 0.8, 1]), [1.8, 1.2, 0.55]);
    }
    glows.add(M(0, 8.8, fz, Math.PI, [10, 8.8, 1]), [1.8, 1.2, 0.55]);
    for (let x = -3.75; x <= 3.75; x += 2.5) box(props, props, P, x, fz - 0.05, 0.12, 0.05, 4.6, 18, IRON, 0.9); // mullions
    box(props, props, P, 0, fz - 0.05, 5, 0.05, 8.7, 8.95, IRON, 0.9); // transom
    for (const x of [-4, 0, 4]) glows.add(M(x, 1.7, fz, Math.PI, [2.4, 3.2, 1]), [2.2, 1.5, 0.7]);
  }

  // --- Gëlle Fra: tall obelisk on a pedestal, the golden figure on top.
  {
    const l = lm('gelleFra');
    const { P, M } = frame(l);
    box(stone.walls, stone.roofs, P, 0, 0, 1.8, 1.8, 0, 3.2, SANDSTONE, 0.5);
    for (let i = 0; i < 6; i++) {
      const r = 0.95 - i * 0.07;
      box(flood, flood, P, 0, 0, r, r, 3.2 + i * 3, 3.2 + (i + 1) * 3, [0.64, 0.6, 0.54], 0.5);
    }
    // The gilded figure on top, arms raised holding the laurel wreath out over the square.
    const GOLD: Rgb = [1.0, 0.74, 0.26];
    const top = 3.2 + 6 * 3;
    const at = (x: number, y: number, z: number, rx = 0, rz = 0) => new THREE.Matrix4().multiplyMatrices(M(x, y, z), new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, 0, rz)));
    flood.merge(new THREE.CylinderGeometry(0.62, 0.62, 0.25, 10), at(0, top + 0.12, 0), GOLD); // gilded base
    flood.merge(new THREE.ConeGeometry(0.42, 1.7, 10), at(0, top + 1.1, 0), GOLD); // robe
    flood.merge(new THREE.CylinderGeometry(0.15, 0.24, 0.6, 8), at(0, top + 2.05, 0), GOLD); // torso
    flood.merge(new THREE.SphereGeometry(0.17, 10, 8), at(0, top + 2.52, -0.04), GOLD); // head
    // Both arms reach up and forward to the wreath held high over the square (local -Z is the front).
    const wreath = v3(0, top + 3.25, -0.45);
    for (const s of [-1, 1]) {
      const shoulder = v3(s * 0.2, top + 2.3, 0);
      const hand = v3(s * 0.26, wreath.y - 0.3, wreath.z);
      const dir = hand.clone().sub(shoulder);
      const q = new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), dir.clone().normalize());
      const mid = shoulder.clone().addScaledVector(dir, 0.5);
      flood.merge(new THREE.CylinderGeometry(0.055, 0.065, dir.length(), 6), new THREE.Matrix4().multiplyMatrices(M(mid.x, mid.y, mid.z), new THREE.Matrix4().makeRotationFromQuaternion(q)), GOLD);
    }
    flood.merge(new THREE.TorusGeometry(0.34, 0.065, 6, 18), at(wreath.x, wreath.y, wreath.z), GOLD); // wreath
  }

  // --- Ferris wheel at Place de la Constitution (turns slowly, see FerrisWheel).
  const wheel = new FerrisWheel(lm('ferrisWheel'));

  // --- Neumünster Abbey: a small bell tower with a slate spire.
  {
    const l = lm('neumunster');
    const { P, M } = frame(l);
    column(flood, P, 12, 0, 2.2, 9, 17, 4, GREY_STONE);
    needle(flood, P, 12, 0, 2.6, 17, 25, 4, SLATE);
    // Lit belfry openings and the abbey church's tall windows facing the river path.
    for (const side of [0, 1, 2, 3]) {
      const a = (side * Math.PI) / 2;
      glows.add(M(12 + Math.sin(a) * 2.22, 14.5, Math.cos(a) * 2.22, a, [0.8, 1.8, 1]), [1.2, 0.7, 0.3]);
    }
    for (const x of [4, 7, 17, 20]) stained.add(M(x, 4.2, -5.53, Math.PI, [1.3, 4.2, 1]), 0, 1.3);
  }

  const group = new THREE.Group();
  group.name = 'landmarks';
  group.add(...wallMeshes(stone.walls, stone.roofs, 'landmark-stone'));
  group.add(Object.assign(new THREE.Mesh(flood.build(), floodlitMaterial(0, 75, 1.0)), { name: 'landmark-floodlit' }));
  const propMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.55, metalness: 0.2 });
  propMat.colorNode = vertexColor().rgb;
  propMat.emissiveNode = lampLight(positionWorld, normalWorld, vertexColor().rgb, float(0.3), float(20));
  group.add(Object.assign(new THREE.Mesh(props.build(), propMat), { name: 'landmark-props' }));
  group.add(glows.build(new THREE.PlaneGeometry(1, 1), 'landmark-glows'));
  group.add(stained.build());
  group.add(wheel.group, buildTree(lm('tree')));
  group.userData.update = (time: number) => wheel.update(time);
  return group;
}

/**
 * The Ferris wheel: static A-frame legs, a rotor (rim, spokes of bulbs) turning
 * about the axle, and gondolas that stay hanging level. ~3 draw calls.
 */
class FerrisWheel {
  readonly group = new THREE.Group();
  private readonly rotor = new THREE.Group();
  private readonly gondolas: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  static readonly R = 15;
  static readonly HUB = 18; // top at ~33 m, well above the Gëlle Fra (~24 m)
  static readonly CARS = 20;
  /** Radians per second: one turn in about a minute and a half. */
  static readonly SPEED = 0.07;

  constructor(l: Landmark) {
    const { R, HUB, CARS } = FerrisWheel;
    // Wheel frame: origin at the hub, axle along local X, wheel in the local YZ plane.
    this.group.position.set(l.x, l.y + HUB, l.z);
    this.group.rotation.y = l.rot;
    this.group.name = 'ferris-wheel';

    const legs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.45, 0.45, 1), new THREE.MeshStandardNodeMaterial({ color: 0x1a1d24, roughness: 0.6 }), 4);
    let i = 0;
    for (const s of [-1, 1]) {
      for (const k of [-1, 1]) {
        const foot = v3(s * 2, -HUB, k * 8);
        const top = v3(s * 2, 0, 0);
        const len = foot.distanceTo(top);
        const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(foot, top, v3(0, 1, 0)));
        legs.setMatrixAt(i++, new THREE.Matrix4().compose(foot.clone().add(top).multiplyScalar(0.5), q, v3(1, 1, len)));
      }
    }
    legs.name = 'ferris-legs';

    const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.2, 6, 96), new THREE.MeshStandardNodeMaterial({ color: 0xd8d2c4, roughness: 0.5 }));
    ring.rotation.y = Math.PI / 2;
    const bulbs = new Glows();
    const n = 96;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      bulbs.add(new THREE.Matrix4().compose(v3(0, Math.sin(a) * R, Math.cos(a) * R), new THREE.Quaternion(), v3(0.34, 0.34, 0.34)), k % 4 === 0 ? [3.4, 0.6, 0.35] : [3.6, 2.3, 1.0]);
    }
    for (let k = 0; k < CARS; k++) {
      const a = (k / CARS) * Math.PI * 2;
      for (let j = 1; j < 8; j++) bulbs.add(new THREE.Matrix4().compose(v3(0, Math.sin(a) * R * (j / 8), Math.cos(a) * R * (j / 8)), new THREE.Quaternion(), v3(0.18, 0.18, 0.18)), [2.8, 1.8, 0.8]);
    }
    // Glow quads face local +Z; turn them to face out along the axle (±X) so they read from the square.
    const bulbMesh = bulbs.build(new THREE.PlaneGeometry(1, 1).rotateY(Math.PI / 2), 'ferris-bulbs');
    (bulbMesh.material as THREE.Material).side = THREE.DoubleSide;
    this.rotor.add(ring, bulbMesh);

    const car = new THREE.MeshStandardNodeMaterial({ roughness: 0.6 });
    car.colorNode = vec3(0.5, 0.08, 0.06);
    car.emissiveNode = vec3(0.16, 0.05, 0.02); // lit cabins
    this.gondolas = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 1.7, 1.7), car, CARS);
    this.gondolas.name = 'ferris-cars';
    this.gondolas.frustumCulled = false; // it moves; its bounds are the whole wheel anyway

    this.group.add(legs, this.rotor, this.gondolas);
    this.update(0);
  }

  update(time: number): void {
    const { R, CARS, SPEED } = FerrisWheel;
    const turn = time * SPEED;
    this.rotor.rotation.x = -turn;
    for (let k = 0; k < CARS; k++) {
      const a = (k / CARS) * Math.PI * 2 + turn;
      // Hang below the rim point, level whatever the rotor angle.
      this.m.makeTranslation(0, Math.sin(a) * R - 1.3, Math.cos(a) * R);
      this.gondolas.setMatrixAt(k, this.m);
    }
    this.gondolas.instanceMatrix.needsUpdate = true;
  }
}
