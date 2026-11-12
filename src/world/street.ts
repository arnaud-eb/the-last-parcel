import * as THREE from 'three/webgpu';
import { GeoBuilder } from './geo';
import {
  CURB_HEIGHT, FACADE_OFFSET, ROAD_HALF, SQUARE, STREET_Z_END, STREET_Z_START, centerX, frameAt,
} from './layout';
import { createRng } from '../core/rng';
import { cobbleMaterial, snowMaterial } from '../render/materials';

const UP = new THREE.Vector3(0, 1, 0);
const WHITE = [1, 1, 1];
const CURB = [0.55, 0.58, 0.66];

/** Point at lateral offset `lat` (right of centreline when facing the square) at street z. */
function at(z: number, lat: number, y = 0): THREE.Vector3 {
  const f = frameAt(z);
  return new THREE.Vector3(centerX(z) + f.nx * lat, y, z + f.nz * lat);
}

/** Road (cobbles) and all snow surfaces: ground, sidewalks, curbs, snowbanks. */
export function buildStreet(): THREE.Group {
  const road = new GeoBuilder();
  const snow = new GeoBuilder();
  const rng = createRng('street-snowbanks');
  const z0 = STREET_Z_START + 12;
  const z1 = STREET_Z_END;
  const step = 1;

  for (let z = z0; z > z1 + 1e-6; z -= step) {
    const za = z;
    const zb = Math.max(z1, z - step);
    // Road surface.
    road.quad(at(za, -ROAD_HALF), at(za, ROAD_HALF), at(zb, ROAD_HALF), at(zb, -ROAD_HALF),
      [-ROAD_HALF, -za, ROAD_HALF, -za, ROAD_HALF, -zb, -ROAD_HALF, -zb], WHITE, [], UP);

    for (const s of [-1, 1]) {
      const inner = s * ROAD_HALF;
      const outer = s * (FACADE_OFFSET + 0.6);
      // Curb face (vertical), sidewalk top.
      snow.quad(at(za, inner, 0), at(zb, inner, 0), at(zb, inner, CURB_HEIGHT), at(za, inner, CURB_HEIGHT),
        [0, 0, 1, 0, 1, 1, 0, 1], CURB, [], at(za, -s, 0).sub(at(za, 0, 0)));
      snow.quad(at(za, inner, CURB_HEIGHT), at(za, outer, CURB_HEIGHT), at(zb, outer, CURB_HEIGHT), at(zb, inner, CURB_HEIGHT),
        [0, 0, 1, 0, 1, 1, 0, 1], WHITE, [], UP);
    }
  }

  // Snowbanks: lumpy humps along both curbs, ploughed off the road.
  for (const s of [-1, 1]) {
    const profile = [0, 0.15, 0.45, 0.8, 1.0];
    const heights = [0, 0.22, 0.34, 0.2, 0];
    for (let z = z0; z > z1 + 2; z -= step) {
      const za = z;
      const zb = z - step;
      const ha = 0.6 + 0.6 * noise1(za * 0.35 + s * 10) + (rng.next() < 0.05 ? 0.3 : 0);
      const hb = 0.6 + 0.6 * noise1(zb * 0.35 + s * 10);
      for (let i = 0; i < profile.length - 1; i++) {
        const la = s * (ROAD_HALF + 0.05 + profile[i]! * 0.95);
        const lb = s * (ROAD_HALF + 0.05 + profile[i + 1]! * 0.95);
        snow.quad(
          at(za, la, CURB_HEIGHT + heights[i]! * ha), at(za, lb, CURB_HEIGHT + heights[i + 1]! * ha),
          at(zb, lb, CURB_HEIGHT + heights[i + 1]! * hb), at(zb, la, CURB_HEIGHT + heights[i]! * hb),
          [0, 0, 1, 0, 1, 1, 0, 1], WHITE, [], UP,
        );
      }
    }
  }

  // Square: cobbles with a ploughed lane; edges are snow (handled by the shader).
  const { zMin, zMax, xHalf } = SQUARE;
  const cxs = centerX(STREET_Z_END);
  for (let z = zMax; z > zMin; z -= 2) {
    for (let x = -xHalf; x < xHalf; x += 2) {
      road.quad(
        new THREE.Vector3(x, 0, z), new THREE.Vector3(x + 2, 0, z), new THREE.Vector3(x + 2, 0, z - 2), new THREE.Vector3(x, 0, z - 2),
        [x - cxs, -z, x + 2 - cxs, -z, x + 2 - cxs, -z + 2, x - cxs, -z + 2], WHITE, [], UP,
      );
    }
  }

  // Ground everywhere else (under buildings, beyond the square).
  const G = 220;
  snow.quad(new THREE.Vector3(-G, -0.02, G), new THREE.Vector3(G, -0.02, G), new THREE.Vector3(G, -0.02, -G), new THREE.Vector3(-G, -0.02, -G),
    [0, 0, 1, 0, 1, 1, 0, 1], WHITE, [], UP);

  const group = new THREE.Group();
  group.name = 'street';
  const roadMesh = new THREE.Mesh(road.build(), cobbleMaterial(ROAD_HALF));
  roadMesh.name = 'road';
  const snowMesh = new THREE.Mesh(snow.build(), snowMaterial());
  snowMesh.name = 'snow-surfaces';
  roadMesh.position.y = 0.005;
  group.add(roadMesh, snowMesh);
  return group;
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
