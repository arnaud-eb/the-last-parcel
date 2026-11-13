/**
 * Landmarks (SPEC §3), as recognisable blocking volumes for M2. The main
 * block of each one is a regular Building (so it gets windows, relief and a
 * collider); the silhouette pieces that make it recognisable are built here.
 */
import * as THREE from 'three/webgpu';
import { attribute, float, mix, normalWorld, positionWorld, smoothstep, vec3, vertexColor } from 'three/tsl';
import { GeoBuilder } from './geo';
import { box, wallBuilders, wallMeshes } from './buildings';
import type { Landmark } from './town';
import { U, fogFactor, lampLight } from '../render/materials';
import { buildTree } from './props';
import { landmarkBuildings, lm } from './landmarkBlocks';

type N = any;
type Rgb = [number, number, number];

const SANDSTONE: Rgb = [0.66, 0.56, 0.4];
const GREY_STONE: Rgb = [0.6, 0.58, 0.54];
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
    // Tall stained-glass lancets along both sides of the nave, and a rose window at the front.
    for (const sx of [-1, 1]) {
      for (let z = front + 10; z < 24; z += 6) glows.add(M(sx * 12.02, 8, z, sx * Math.PI / 2, [1.6, 7, 1]), [1.4, 0.7, 0.35]);
    }
    glows.add(M(0, 11, front - 0.02, Math.PI, [4.5, 4.5, 1]), [1.6, 0.8, 0.4]);
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

  // --- Hôtel de Ville: wide front staircase, two green bronze lions on plinths, chimneys, wall lanterns.
  {
    const l = lm('hotelDeVille');
    const { P, M } = frame(l);
    const d = 8;
    // Four steps, each shallower and higher than the one below.
    for (let i = 0; i < 4; i++) {
      const out = (4 - i) * 0.45;
      box(stone.walls, stone.roofs, P, 0, -d - out / 2, 11 - i * 0.3, out / 2, 0, 0.15 * (i + 1), SANDSTONE, 0.21);
    }
    for (const s of [-1, 1]) {
      box(stone.walls, stone.roofs, P, s * 12.5, -d - 1.6, 1, 1.4, 0, 1.4, SANDSTONE, 0.21);
      // Lion: body, chest, head, mane, crouched on the plinth.
      box(props, props, P, s * 12.5, -d - 1.6, 0.42, 1.0, 1.4, 2.1, BRONZE, 0.21);
      box(props, props, P, s * 12.5, -d - 2.3, 0.45, 0.35, 1.4, 2.6, BRONZE, 0.21);
      box(props, props, P, s * 12.5, -d - 2.55, 0.38, 0.32, 2.3, 2.95, BRONZE, 0.21);
      box(props, props, P, s * 6, 4, 0.5, 0.5, 9.5, 12, [0.5, 0.42, 0.32], 0.21); // chimneys
    }
    for (let x = -15; x <= 15; x += 6) glows.add(M(x, 2.8, -d - 0.25, Math.PI, [0.35, 0.5, 1]), [3, 1.6, 0.6]);
  }

  // --- Gare: clock tower with a floodlit green copper cupola, glowing clock faces, big arched glass window.
  {
    const l = lm('gare');
    const { P, M } = frame(l);
    const tx = 16;
    const tz = -6;
    column(flood, P, tx, tz, 4.2, 0, 30, 4, SANDSTONE);
    column(flood, P, tx, tz, 3.4, 30, 34, 8, COPPER);
    column(flood, P, tx, tz, 2.6, 34, 37.5, 8, COPPER);
    column(flood, P, tx, tz, 1.4, 37.5, 40, 8, COPPER);
    needle(flood, P, tx, tz, 1.5, 40, 45, 8, COPPER);
    for (let side = 0; side < 4; side++) {
      const a = (side * Math.PI) / 2;
      glows.add(M(tx + Math.sin(a) * 4.22, 26, tz + Math.cos(a) * 4.22, a, [2.4, 2.4, 1]), [2.2, 2.0, 1.6]);
    }
    // Arched glass gable of the hall.
    glows.add(M(-16, 6.5, -10.04, Math.PI, [9, 7, 1]), [1.8, 1.2, 0.6]);
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
    glows.add(M(0, 22.6, 0, 0, [0.7, 1.9, 0.7]), [3.2, 2.1, 0.6]);
    glows.add(M(0, 24.2, 0, 0, [1.4, 0.18, 0.18]), [3.2, 2.1, 0.6]); // arms raising the wreath
  }

  // --- Ferris wheel at Place de la Constitution.
  const wheel = new THREE.Group();
  {
    const l = lm('ferrisWheel');
    const { P, M } = frame(l);
    const R = 9;
    const hub = 11;
    for (const s of [-1, 1]) {
      // A-frame legs.
      for (const k of [-1, 1]) {
        const foot = P(s * 1.4, 0, k * 5);
        const top = P(s * 1.4, hub, 0);
        const dir = top.clone().sub(foot);
        const len = dir.length();
        const mm = new THREE.Matrix4().lookAt(foot, top, v3(0, 1, 0));
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, len), new THREE.MeshStandardNodeMaterial({ color: 0x1a1d24, roughness: 0.6 }));
        mesh.position.copy(foot.clone().add(top).multiplyScalar(0.5));
        mesh.quaternion.setFromRotationMatrix(mm);
        wheel.add(mesh);
      }
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.12, 6, 64), new THREE.MeshStandardNodeMaterial({ color: 0xd8d2c4, roughness: 0.5 }));
    ring.position.copy(P(0, hub, 0));
    ring.rotation.y = l.rot + Math.PI / 2;
    wheel.add(ring);
    const n = 64;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      glows.add(M(0, hub + Math.sin(a) * R, Math.cos(a) * R, 0, [0.18, 0.18, 0.18]), i % 4 === 0 ? [3, 0.5, 0.3] : [3.2, 2.0, 0.9]);
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      for (let k = 1; k < 6; k++) glows.add(M(0, hub + Math.sin(a) * R * (k / 6), Math.cos(a) * R * (k / 6), 0, [0.1, 0.1, 0.1]), [2.4, 1.5, 0.7]);
      box(props, props, P, 0, Math.cos(a) * R, 0.5, 0.6, hub + Math.sin(a) * R - 1.6, hub + Math.sin(a) * R - 0.4, [0.5, 0.08, 0.06], 0.5);
    }
  }

  // --- Neumünster Abbey: a small bell tower with a slate spire.
  {
    const l = lm('neumunster');
    const { P } = frame(l);
    column(stone.walls, P, 12, 0, 2.2, 9, 17, 4, GREY_STONE);
    needle(stone.roofs, P, 12, 0, 2.6, 17, 25, 4, SLATE);
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
  group.add(wheel, buildTree(lm('tree')));
  return group;
}
