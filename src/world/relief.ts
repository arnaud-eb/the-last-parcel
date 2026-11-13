import * as THREE from 'three/webgpu';
import { attribute, float, fract, mix, normalWorld, positionWorld, smoothstep, step, uv, vec3 } from 'three/tsl';
import { facadeCols, facadeSlots } from './facade';
import type { Building } from './layout';
import { lampLight, U } from '../render/materials';
import { hashString } from '../core/rng';

type N = any;

/** Colours (linear). */
const STONE: Rgb = [0.62, 0.52, 0.38];
const FRAME: Rgb = [0.8, 0.77, 0.7];
const SNOW: Rgb = [0.74, 0.8, 0.92];
const SHUTTERS: Rgb[] = [[0.18, 0.3, 0.2], [0.16, 0.24, 0.38], [0.4, 0.14, 0.12]];
const AWNINGS: Rgb[] = [[0.45, 0.06, 0.05], [0.08, 0.26, 0.16], [0.1, 0.14, 0.3], [0.5, 0.32, 0.08]];
type Rgb = [number, number, number];

/** Out from the wall (local -Z) by this much so trim sits proud of the plaster. */
const PROUD = 0.001;

/**
 * One instanced mesh per part type. Parts are unit boxes (or a prism) placed
 * with a per-instance matrix and tint, scaled along their long axis only.
 */
class Parts {
  private readonly matrices: THREE.Matrix4[] = [];
  private readonly tints: number[] = [];
  constructor(readonly name: string, private readonly geo: THREE.BufferGeometry) {}

  add(m: THREE.Matrix4, tint: Rgb): void {
    this.matrices.push(m);
    this.tints.push(...tint);
  }

  build(material: THREE.Material): THREE.InstancedMesh | null {
    if (this.matrices.length === 0) return null;
    const geo = this.geo.clone();
    geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(new Float32Array(this.tints), 3));
    const mesh = new THREE.InstancedMesh(geo, material, this.matrices.length);
    this.matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.name = this.name;
    mesh.computeBoundingSphere();
    return mesh;
  }
}

/** Triangular prism, unit size: ridge along X at y = 1, base from z = -0.5..0.5 at y = 0. */
function prismGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.5, 0);
  s.lineTo(0.5, 0);
  s.lineTo(0, 1);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
  g.translate(0, 0, -0.5);
  g.rotateY(Math.PI / 2); // ridge along X
  return g;
}

function reliefMaterial(): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.85 });
  const albedo = attribute('aTint', 'vec3') as N;
  m.colorNode = albedo;
  m.emissiveNode = lampLight(positionWorld, normalWorld, albedo, float(0.06), float(12));
  return m;
}

/** Striped canvas awnings, lit warm from underneath by the shop window. */
function awningMaterial(): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9 });
  const tint = attribute('aTint', 'vec3') as N;
  const stripes = step(0.5, fract((uv() as N).x.mul(7)));
  const albedo = mix(tint, vec3(0.85, 0.8, 0.7), stripes.mul(0.85));
  const below = smoothstep(-0.2, -0.8, (normalWorld as N).y);
  m.colorNode = albedo;
  m.emissiveNode = lampLight(positionWorld, normalWorld, albedo, float(0.05), float(10)).add(albedo.mul(vec3(1.0, 0.55, 0.22)).mul(below.mul(0.9)));
  return m;
}

function dormerGlassMaterial(): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial();
  // aTint carries lit (warm, > 1 so it blooms) or unlit (dark glass) colour.
  m.colorNode = (attribute('aTint', 'vec3') as N).add((U.horizon as N).mul(0.04));
  return m;
}

/**
 * 3D facade relief for every street-facing front: window surrounds and sills,
 * snow on every ledge, shutters, door steps, shop awnings, roof dormers.
 */
export function buildRelief(buildings: readonly Building[]): THREE.Group {
  const box = new THREE.BoxGeometry(1, 1, 1);
  const lintel = new Parts('relief-lintels', box);
  const jamb = new Parts('relief-jambs', box);
  const sill = new Parts('relief-sills', box);
  const snow = new Parts('relief-snow', box);
  const shutter = new Parts('relief-shutters', box);
  const doorStep = new Parts('relief-steps', box);
  const awning = new Parts('relief-awnings', box);
  const dormer = new Parts('relief-dormers', box);
  const dormerRoof = new Parts('relief-dormer-roofs', prismGeometry());
  const glass = new Parts('relief-dormer-glass', new THREE.PlaneGeometry(1, 1));

  const local = new THREE.Matrix4();
  const tmp = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();

  for (const b of buildings) {
    if (!b.relief) continue;
    const world = new THREE.Matrix4().makeRotationY(b.rot).setPosition(b.x, 0, b.z);
    const w = b.width / 2;
    const d = b.depth / 2;
    const zWall = -d - PROUD;
    /** Place a unit part: centre (x, y, z) in building-local space, size (sx, sy, sz), optional tilt about X. */
    const put = (parts: Parts, x: number, y: number, z: number, sx: number, sy: number, sz: number, tint: Rgb, tiltX = 0) => {
      q.setFromEuler(e.set(tiltX, 0, 0));
      local.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
      parts.add(tmp.multiplyMatrices(world, local).clone(), tint);
    };
    // Front wall runs from local x = +w (u = 0) to x = -w.
    const xOf = (u: number) => w - u;
    const cellW = b.width / facadeCols(b.width);
    const slots = facadeSlots({ width: b.width, height: b.height, shop: b.shop, doorCol: b.doorCol });
    const h = hashString(`${b.seed}`);

    for (const s of slots) {
      const x = xOf(s.u);
      const hgt = s.y1 - s.y0;
      const yc = (s.y0 + s.y1) / 2;
      if (s.kind === 'upper' || s.kind === 'groundWindow') {
        // Lintel, two jambs, a sill, and snow on the sill and lintel.
        put(lintel, x, s.y1 + 0.07, zWall - 0.05, s.width + 0.22, 0.14, 0.1, FRAME);
        put(snow, x, s.y1 + 0.16, zWall - 0.055, s.width + 0.2, 0.04, 0.09, SNOW);
        put(jamb, x - s.width / 2 - 0.045, yc, zWall - 0.04, 0.09, hgt, 0.08, FRAME);
        put(jamb, x + s.width / 2 + 0.045, yc, zWall - 0.04, 0.09, hgt, 0.08, FRAME);
        put(sill, x, s.y0 - 0.04, zWall - 0.1, s.width + 0.3, 0.08, 0.2, STONE);
        put(snow, x, s.y0 + 0.02, zWall - 0.1, s.width + 0.26, 0.05, 0.18, SNOW);
        if (b.shutters >= 0 && s.kind === 'upper') {
          const sw = 0.15 * cellW;
          for (const side of [-1, 1]) {
            put(shutter, x + side * (s.width / 2 + sw / 2 + 0.06), yc, zWall - 0.05, sw, hgt + 0.06, 0.05, SHUTTERS[b.shutters]!);
          }
        }
      } else if (s.kind === 'door') {
        // Stone surround, a step with snow on it.
        put(jamb, x - s.width / 2 - 0.1, hgt / 2, zWall - 0.06, 0.2, hgt, 0.12, STONE);
        put(jamb, x + s.width / 2 + 0.1, hgt / 2, zWall - 0.06, 0.2, hgt, 0.12, STONE);
        put(lintel, x, s.y1 + 0.12, zWall - 0.08, s.width + 0.6, 0.24, 0.16, STONE);
        put(snow, x, s.y1 + 0.26, zWall - 0.09, s.width + 0.56, 0.05, 0.15, SNOW);
        put(doorStep, x, 0.09, zWall - 0.3, s.width + 0.7, 0.18, 0.6, STONE);
        put(snow, x, 0.19, zWall - 0.32, s.width + 0.6, 0.03, 0.5, SNOW);
      } else {
        // Shop front: awning tilted down toward the street, snow on top, fascia board.
        const aw = s.width + 0.3;
        const tint = AWNINGS[(h + s.col) % AWNINGS.length]!;
        const tilt = 0.42;
        const depth = 1.0;
        const ay = s.y1 + 0.35;
        const az = zWall - (depth / 2) * Math.cos(tilt);
        put(awning, x, ay, az, aw, 0.05, depth, tint, -tilt);
        put(snow, x, ay + 0.05, az, aw - 0.05, 0.05, depth - 0.05, SNOW, -tilt);
        put(awning, x, ay - Math.sin(tilt) * depth / 2 - 0.12, zWall - depth * Math.cos(tilt), aw, 0.24, 0.03, tint);
        put(lintel, x, s.y1 + 0.08, zWall - 0.04, s.width + 0.2, 0.16, 0.08, FRAME);
        put(sill, x, s.y0 - 0.04, zWall - 0.08, s.width + 0.16, 0.08, 0.16, STONE);
      }
    }

    // Dormers on the street-side slope of the roof.
    if (b.dormers > 0) {
      const rise = b.roofPitch * d;
      const zc = -d * 0.62; // dormer front face, down the slope toward the eave
      const ySlope = b.height + 0.16 + rise * (1 - (-zc) / d); // roof surface (incl. snow) at the front face
      const xs = b.dormers === 1 ? [0] : [-w * 0.45, w * 0.45];
      xs.forEach((dx, i) => {
        const dw = 1.4;
        const dh = 1.9; // wall height above the roof surface at the front
        const dd = 2.4; // runs back into the slope
        const tint: Rgb = [b.color[0] * 0.8, b.color[1] * 0.8, b.color[2] * 0.8];
        const bottom = ySlope - 0.2;
        put(dormer, dx, bottom + (dh + 0.2) / 2, zc + dd / 2, dw, dh + 0.2, dd, tint);
        // Little gable roof, snow on top, slight overhang at the front.
        put(dormerRoof, dx, ySlope + dh, zc + dd / 2 - 0.15, dw + 0.35, 0.8, dd + 0.3, SNOW);
        const lit = ((h >> (i * 3)) & 7) < 6;
        const g: Rgb = lit ? [2.2, 0.75, 0.2] : [0.02, 0.03, 0.05];
        q.setFromEuler(e.set(0, Math.PI, 0));
        local.compose(new THREE.Vector3(dx, ySlope + dh * 0.5, zc - 0.005), q, new THREE.Vector3(0.7, 0.95, 1));
        glass.add(tmp.multiplyMatrices(world, local).clone(), g);
        put(lintel, dx, ySlope + dh * 0.5 + 0.55, zc - 0.04, 0.9, 0.1, 0.08, FRAME);
        put(sill, dx, ySlope + dh * 0.5 - 0.52, zc - 0.07, 0.95, 0.07, 0.16, FRAME);
        put(snow, dx, ySlope + dh * 0.5 - 0.47, zc - 0.07, 0.9, 0.04, 0.14, SNOW);
      });
    }
  }

  const mat = reliefMaterial();
  const group = new THREE.Group();
  group.name = 'facade-relief';
  for (const p of [lintel, jamb, sill, snow, shutter, doorStep, dormer, dormerRoof]) {
    const mesh = p.build(mat);
    if (mesh) group.add(mesh);
  }
  const aw = awning.build(awningMaterial());
  if (aw) group.add(aw);
  const g = glass.build(dormerGlassMaterial());
  if (g) group.add(g);
  return group;
}
