/**
 * The Christmas markets drawn: wooden stalls with snowy roofs and fir garlands,
 * lit counters of goods, bulbs along the eaves, warm light pooling on the
 * cobbles, steam rising from the mulled-wine stalls, and the crowd.
 * Everything is instanced: about seven draw calls for both markets.
 */
import * as THREE from 'three/webgpu';
import {
  abs, float, floor, fract, hash, instanceIndex, instancedArray, length, max, mix, normalWorld, positionWorld, pow, sin, smoothstep, step, uv, vec2,
  vec3, vec4, vertexColor,
} from 'three/tsl';
import { GeoBuilder } from './geo';
import { STALL, STALLS, type Stall } from './market';
import { Crowd } from './crowd';
import { lampLight, propMaterial, U } from '../render/materials';

type N = any;

const WOOD = [0.5, 0.33, 0.2];
const WOOD_LIGHT = [0.68, 0.5, 0.31];
const WOOD_DARK = [0.28, 0.17, 0.1];
const SIGN = [0.55, 0.09, 0.07];
const SNOW = [0.82, 0.87, 0.98];
const FIR = [0.04, 0.12, 0.06];
const SKIN = [0.78, 0.58, 0.46];
const LEGS = [0.06, 0.06, 0.08];
const COATS: [number, number, number][] = [
  [0.55, 0.08, 0.07], [0.1, 0.14, 0.3], [0.08, 0.24, 0.14], [0.55, 0.4, 0.24], [0.16, 0.16, 0.18],
  [0.38, 0.06, 0.12], [0.62, 0.48, 0.12], [0.75, 0.72, 0.64], [0.2, 0.32, 0.45],
];
/** Hue of each stall's lit interior (warm, a few redder). */
const GLOW: [number, number, number][] = [[1.0, 0.62, 0.3], [1.0, 0.5, 0.24], [1.0, 0.7, 0.42], [0.95, 0.42, 0.22]];

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function stallMatrix(s: Stall): THREE.Matrix4 {
  return new THREE.Matrix4().makeRotationY(s.rot).setPosition(s.x, s.y, s.z);
}

/** Front overhang of the roof over the counter (m). */
const EAVE = 0.6;

/**
 * One chalet in local space (counter facing -Z), as a single merged geometry:
 * gable to the front, ridge running front to back, snow on both slopes.
 */
function stallGeometry(): THREE.BufferGeometry {
  const { width: w, depth: d, wall, ridge } = STALL;
  const g = new GeoBuilder();
  const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number, c: readonly number[], rz = 0) =>
    g.merge(new THREE.BoxGeometry(sx, sy, sz), new THREE.Matrix4().makeRotationZ(rz).setPosition(x, y, z), c);

  box(w, 0.15, d, 0, 0.075, 0, WOOD_DARK);
  box(w, wall, 0.1, 0, wall / 2, d / 2 - 0.05, WOOD);
  for (const sx of [-1, 1]) {
    box(0.1, wall, d, sx * (w / 2 - 0.05), wall / 2, 0, WOOD);
    // Corner posts in lighter wood.
    for (const sz of [-1, 1]) box(0.16, wall, 0.16, sx * (w / 2 - 0.06), wall / 2, sz * (d / 2 - 0.06), WOOD_LIGHT);
  }
  // Counter and its top board, lintel over the opening.
  box(w, 1.0, 0.35, 0, 0.5, -d / 2 + 0.175, WOOD);
  box(w + 0.1, 0.08, 0.6, 0, 1.04, -d / 2 + 0.2, WOOD_LIGHT);
  box(w, 0.3, 0.1, 0, wall - 0.15, -d / 2 + 0.05, WOOD_LIGHT);

  // Gable roof: ridge along Z, overhanging the counter.
  const run = w / 2 + 0.18;
  const rise = ridge - wall;
  const len = Math.hypot(run, rise);
  const tilt = Math.atan2(rise, run);
  const rl = d + EAVE + 0.2;
  const rz = -(EAVE - 0.2) / 2;
  for (const s of [-1, 1]) {
    const cx = (s * run) / 2;
    const cy = wall + rise / 2;
    box(len, 0.1, rl, cx, cy, rz, WOOD_DARK, -s * tilt);
    // Snow lies on top: offset along the slope's normal.
    box(len - 0.06, 0.12, rl - 0.08, cx + s * Math.sin(tilt) * 0.1, cy + Math.cos(tilt) * 0.1, rz, SNOW, -s * tilt);
  }
  // Gable triangles front and back, and a painted board under the front peak.
  for (const sz of [-1, 1]) {
    const z = sz * (d / 2 - 0.02);
    const a = v3(-w / 2, wall, z);
    const b = v3(w / 2, wall, z);
    const c = v3(0, ridge, z);
    const uv6: [number, number, number, number, number, number] = [0, 0, 1, 0, 0.5, 1];
    if (sz < 0) g.tri(a, c, b, uv6, WOOD);
    else g.tri(a, b, c, uv6, WOOD);
  }
  box(1.3, 0.42, 0.06, 0, wall + 0.42, -d / 2 - 0.05, SIGN);
  // Fir garland along the lintel.
  box(w + 0.1, 0.18, 0.18, 0, wall - 0.04, -d / 2 - 0.08, FIR);
  return g.build();
}

/**
 * Chalet wood: vertical planks, and a warm glow from the bulbs and the lit
 * counters bouncing off the boards, stronger up under the eaves.
 */
function stallMaterial(): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.85 });
  const P = positionWorld as N;
  const Nw = normalWorld as N;
  // Plank seams run vertically; pick the horizontal coordinate along the wall.
  const along = mix(P.z, P.x, step(0.5, abs(Nw.z)));
  // 1 on a plank, dark in the seam every 28 cm; no seams on floors and roofs.
  const seam = smoothstep(0.42, 0.47, abs(fract(along.mul(3.6)).sub(0.5)));
  const planks = mix(float(1).sub(seam.mul(0.4)), float(1), step(0.5, abs(Nw.y)));
  const albedo = (vertexColor() as N).rgb.mul(planks);
  const bounce = vec3(1.0, 0.58, 0.3).mul(smoothstep(0.3, 3.0, P.y).mul(0.22).add(0.05));
  m.colorNode = albedo;
  m.emissiveNode = albedo.mul(bounce).add(lampLight(P, Nw, albedo, float(0.1), float(12)));
  return m;
}

/** Shelves of goods behind the counter: rows of coloured blobs, lit warm. Tinted per stall. */
function goodsMaterial(): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial();
  const p = uv() as N;
  const shelf = floor(p.y.mul(3));
  const f = fract(vec2(p.x.mul(9), p.y.mul(3)));
  const id = hash(floor(p.x.mul(9)).add(shelf.mul(17)));
  const blob = smoothstep(0.32, 0.22, length(f.sub(vec2(0.5, 0.42))));
  const goods = mix(vec3(1, 0.5, 0.2), mix(vec3(0.9, 0.2, 0.15), vec3(1, 0.85, 0.5), hash(id.mul(7))), id);
  const board = smoothstep(0.08, 0.0, f.y);
  const back = vec3(0.55, 0.32, 0.16);
  m.colorNode = mix(back.mul(0.9), goods.mul(1.6), blob.mul(step(0.2, id))).add(vec3(0.3, 0.18, 0.08).mul(board)).mul(1.5);
  return m;
}

/** Warm light pooled on the cobbles in front of a counter (additive decal). */
function poolMaterial(): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const p = (uv() as N).sub(vec2(0.5, 1)).mul(vec2(2, 1.25));
  const fall = pow(max(float(1).sub(length(p)), 0), 2);
  m.colorNode = vec4(vec3(1.0, 0.6, 0.3).mul(fall.mul(0.45)), 1);
  return m;
}

/** Soft steam puffs rising, fading and spreading (GPU-animated sprites, one draw). */
function buildSteam(emitters: THREE.Vector3[]): THREE.Sprite | null {
  const PER = 7;
  const n = emitters.length * PER;
  if (!n) return null;
  const data = new Float32Array(n * 4);
  emitters.forEach((e, k) => {
    for (let j = 0; j < PER; j++) data.set([e.x, e.y, e.z, j / PER + k * 0.137], (k * PER + j) * 4);
  });
  const buf = instancedArray(data, 'vec4') as N;
  const i = instanceIndex as N;
  const e = buf.element(i);
  const t = fract((U.time as N).mul(0.22).add(e.w));
  const r = hash(i.add(11));
  const drift = vec3(sin(t.mul(5).add(r.mul(30))).mul(0.25).add(t.mul(0.6)), t.mul(3.4), sin(t.mul(4).add(r.mul(13))).mul(0.2));
  const m = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false });
  m.positionNode = e.xyz.add(drift);
  m.scaleNode = mix(0.35, 1.7, t).mul(mix(0.8, 1.2, r)) as N;
  const d = length((uv() as N).sub(vec2(0.5)));
  const soft = pow(max(float(1).sub(d.mul(2)), 0), 1.6);
  const life = smoothstep(0.0, 0.12, t).mul(float(1).sub(t));
  // Lit from below by the stall: warm at the base, cooling as it rises.
  m.colorNode = vec4(mix(vec3(1.0, 0.75, 0.55), vec3(0.6, 0.66, 0.78), t).mul(0.9), soft.mul(life).mul(0.3));
  const sprite = new THREE.Sprite(m);
  sprite.count = n;
  sprite.frustumCulled = false;
  sprite.name = 'market-steam';
  return sprite;
}

function personGeometry(): { body: THREE.BufferGeometry; head: THREE.BufferGeometry } {
  const g = new GeoBuilder();
  const at = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);
  for (const sx of [-1, 1]) g.merge(new THREE.BoxGeometry(0.13, 0.62, 0.16), at(sx * 0.1, 0.31, 0), LEGS);
  g.merge(new THREE.CylinderGeometry(0.2, 0.29, 0.9, 8), at(0, 1.05, 0), [1, 1, 1]);
  g.merge(new THREE.CylinderGeometry(0.1, 0.12, 0.12, 8), at(0, 1.52, 0), [0.92, 0.9, 0.86]); // scarf
  g.merge(new THREE.CylinderGeometry(0.03, 0.14, 0.2, 8), at(0, 1.86, 0), [1, 1, 1]); // bobble hat
  g.merge(new THREE.SphereGeometry(0.045, 6, 4), at(0, 1.98, 0), [1.4, 1.4, 1.4]);
  const h = new GeoBuilder();
  h.merge(new THREE.SphereGeometry(0.14, 10, 8), at(0, 1.68, 0), SKIN);
  return { body: g.build(), head: h.build() };
}

export type MarketView = { group: THREE.Group; update(dt: number, van: { x: number; z: number; speed: number }): void };

export function buildMarkets(): MarketView {
  const group = new THREE.Group();
  group.name = 'markets';
  const n = STALLS.length;
  const m = new THREE.Matrix4();
  const col = new THREE.Color();

  const stalls = new THREE.InstancedMesh(stallGeometry(), stallMaterial(), n);
  const goods = new THREE.InstancedMesh(new THREE.PlaneGeometry(STALL.width - 0.3, 1.15).rotateY(Math.PI), goodsMaterial(), n);
  const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(5, 3.6).rotateX(-Math.PI / 2), poolMaterial(), n);
  const BULBS = 11;
  const bulbs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.07, 0), new THREE.MeshBasicNodeMaterial(), n * BULBS * 2);
  const steamAt: THREE.Vector3[] = [];

  STALLS.forEach((s, i) => {
    const base = stallMatrix(s);
    stalls.setMatrixAt(i, base);
    const tone = 0.8 + s.seed * 0.35;
    stalls.setColorAt(i, col.setRGB(tone, tone * (0.95 + s.seed * 0.05), tone * 0.95));
    // Goods panel just inside the back wall, facing the counter.
    goods.setMatrixAt(i, m.multiplyMatrices(base, new THREE.Matrix4().makeTranslation(0, 1.72, STALL.depth / 2 - 0.12)));
    const gl = GLOW[Math.floor(s.seed * GLOW.length)]!;
    goods.setColorAt(i, col.setRGB(...gl));
    // Pool of light in front of the counter (plane's far edge at the counter).
    pools.setMatrixAt(i, m.multiplyMatrices(base, new THREE.Matrix4().makeTranslation(0, 0.03, -STALL.depth / 2 - 1.8 + 0.1)));
    // Bulbs along the two front edges of the roof, an inverted V over the counter.
    for (let b = 0; b < BULBS; b++) {
      const k = b / (BULBS - 1); // 0 left eave → 1 right eave
      const x = (k - 0.5) * (STALL.width + 0.36);
      const y = STALL.ridge - Math.abs(k - 0.5) * 2 * (STALL.ridge - STALL.wall) - 0.12;
      const red = (b + Math.floor(s.seed * 10)) % 4 === 0;
      // Front gable, and the back one (so a row seen from behind still sparkles).
      for (const [k2, z] of [[0, -STALL.depth / 2 - EAVE + 0.05], [1, STALL.depth / 2 + 0.25]] as const) {
        const j = (i * 2 + k2) * BULBS + b;
        bulbs.setMatrixAt(j, m.multiplyMatrices(base, new THREE.Matrix4().makeTranslation(x, y, z)));
        bulbs.setColorAt(j, red ? col.setRGB(9, 1.6, 1.0) : col.setRGB(9, 5.2, 2.2));
      }
    }
    if (s.steam) steamAt.push(v3(0, STALL.wall + 0.1, -STALL.depth / 2 + 0.5).applyMatrix4(base));
  });
  stalls.name = 'stalls';
  goods.name = 'stall-goods';
  pools.name = 'stall-light';
  pools.renderOrder = 2;
  bulbs.name = 'stall-bulbs';
  for (const im of [stalls, goods, pools, bulbs]) {
    im.computeBoundingSphere();
    group.add(im);
  }
  const steam = buildSteam(steamAt);
  if (steam) group.add(steam);

  // The crowd: coat-and-hat bodies tinted per person, heads with skin tones.
  const crowd = new Crowd();
  const geo = personGeometry();
  const bodies = new THREE.InstancedMesh(geo.body, propMaterial(0.85), crowd.people.length);
  const heads = new THREE.InstancedMesh(geo.head, propMaterial(0.7), crowd.people.length);
  crowd.people.forEach((p, i) => {
    bodies.setColorAt(i, col.setRGB(...COATS[Math.floor(p.look * 97) % COATS.length]!));
    const s = 0.75 + ((p.look * 7.3) % 1) * 0.5;
    heads.setColorAt(i, col.setRGB(s, s * 0.95, s * 0.92));
  });
  bodies.name = 'crowd';
  heads.name = 'crowd-heads';
  bodies.frustumCulled = heads.frustumCulled = false;
  group.add(bodies, heads);

  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const place = () => {
    crowd.people.forEach((p, i) => {
      const walk = Math.min(1, p.speed);
      const bob = Math.abs(Math.sin(p.phase)) * 0.05 * walk;
      e.set(0, p.heading, Math.sin(p.phase) * 0.05 * walk);
      q.setFromEuler(e);
      const s = 0.86 + p.look * 0.2;
      m.compose(pos.set(p.x, bob, p.z), q, scl.set(s, s, s));
      bodies.setMatrixAt(i, m);
      heads.setMatrixAt(i, m);
    });
    bodies.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
  };
  place();

  return {
    group,
    update(dt, van) {
      if (dt <= 0) return;
      crowd.update(Math.min(dt, 0.1), van);
      place();
    },
  };
}
