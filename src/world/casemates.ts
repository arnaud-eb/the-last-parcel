/**
 * The Bock casemates: rows of small lit openings cut into the Alzette cliff
 * below the Bock, with a warm floodlight wash on the rock around them.
 * Seen from Grund and from the switchbacks. Two instanced draws.
 */
import * as THREE from 'three/webgpu';
import { float, length, max, pow, smoothstep, uv, vec2, vec3, vec4 } from 'three/tsl';
import { createRng } from '../core/rng';
import { baseHeight } from './terrain';
import { VALLEYS } from './town';

type N = any;

/** The cliff face under the Bock, north of where the switchbacks go down. */
const Z_RANGE: [number, number] = [-150, -62];
/** Heights of the gallery rows (m, below the plateau). */
const ROWS = [-9, -15, -21];

/** x on the Alzette cliff where the ground is at height y, for this z. */
function cliffX(y: number, z: number): number {
  const a = VALLEYS.alzette;
  let lo = a.xRim - 2;
  let hi = a.xRim + a.cliff + 2;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (baseHeight(mid, z) > y) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function onCliff(y: number, z: number, out = 0.25): THREE.Matrix4 {
  const x = cliffX(y, z);
  const e = 0.5;
  const dx = (baseHeight(x + e, z) - baseHeight(x - e, z)) / (2 * e);
  const dz = (baseHeight(x, z + e) - baseHeight(x, z - e)) / (2 * e);
  const n = new THREE.Vector3(-dx, 1, -dz).normalize();
  // Openings are cut back into the rock: face out horizontally, a little up the slope.
  const face = new THREE.Vector3(n.x, n.y * 0.35, n.z).normalize();
  const p = new THREE.Vector3(x, y, z).addScaledVector(face, out);
  // Matrix4.lookAt points +Z from target to eye: the plane's front then faces out of the rock.
  return new THREE.Matrix4().lookAt(p.clone().add(face), p, new THREE.Vector3(0, 1, 0)).setPosition(p);
}

/** Small arched window: lit warm inside, soft edges. */
function openingMaterial(): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  const p = (uv() as N).sub(vec2(0.5, 0.0));
  // Rectangle below, half-circle on top (arch).
  const arch = length(vec2(p.x.mul(2), p.y.sub(0.62).mul(2.6).max(0)));
  const inside = float(1).sub(smoothstep(0.82, 1.0, arch)).mul(smoothstep(0.0, 0.05, p.y));
  const depth = float(1).sub(p.y.mul(0.5));
  m.colorNode = vec4(vec3(1.0, 0.62, 0.3).mul(depth.mul(3.2)), inside);
  // Lit openings shine through the valley mist rather than fading into it.
  m.fog = false;
  return m;
}

/** Floodlight wash on the rock: additive soft ellipse. */
function washMaterial(): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const p = (uv() as N).sub(0.5).mul(2);
  const fall = pow(max(float(1).sub(length(p.mul(vec2(1, 1.3)))), 0), 2.2);
  m.colorNode = vec4(vec3(1.0, 0.7, 0.4).mul(fall.mul(0.12)), 1);
  m.fog = false;
  return m;
}

export function buildCasemates(): THREE.Group {
  const rng = createRng('casemates');
  const windows: THREE.Matrix4[] = [];
  const washes: THREE.Matrix4[] = [];
  for (const y of ROWS) {
    // Galleries come in runs of a few openings, with rock between runs.
    let z = Z_RANGE[0] + rng.range(0, 8);
    while (z < Z_RANGE[1]) {
      const run = rng.int(3, 6);
      for (let k = 0; k < run && z < Z_RANGE[1]; k++, z += rng.range(2.4, 3.2)) {
        windows.push(onCliff(y + rng.range(-0.4, 0.4), z).multiply(new THREE.Matrix4().makeScale(0.9, 1.4, 1)));
      }
      z += rng.range(6, 14);
    }
  }
  for (let z = Z_RANGE[0] + 10; z < Z_RANGE[1]; z += 22) washes.push(onCliff(-15, z + rng.range(-4, 4), 0.6).multiply(new THREE.Matrix4().makeScale(26, 22, 1)));

  const group = new THREE.Group();
  group.name = 'casemates';
  const plane = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  for (const [list, mat, name, geo] of [
    [windows, openingMaterial(), 'casemate-openings', plane],
    [washes, washMaterial(), 'casemate-floodlight', new THREE.PlaneGeometry(1, 1)],
  ] as const) {
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((m, i) => im.setMatrixAt(i, m));
    im.computeBoundingSphere();
    im.name = name;
    im.renderOrder = 2;
    group.add(im);
  }
  return group;
}
