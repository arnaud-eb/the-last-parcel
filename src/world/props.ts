import * as THREE from 'three/webgpu';
import { attribute } from 'three/tsl';
import { GeoBuilder } from './geo';
import type { Lamp, StringLight } from './layout';
import { createRng } from '../core/rng';
import { glowMaterial, propMaterial } from '../render/materials';

const IRON = [0.05, 0.055, 0.065];
const SNOWCAP = [0.85, 0.9, 1.0];
const LAMP_HEIGHT = 4.1;
const ARM = 0.75;

/** World position of a lamp's lantern (where its light comes from). */
export function lanternPosition(l: Lamp): THREE.Vector3 {
  return new THREE.Vector3(l.x + Math.sin(l.rot) * ARM, l.y + LAMP_HEIGHT - 0.35, l.z + Math.cos(l.rot) * ARM);
}

/** The Place d'Armes tree. */
export const TREE_SIZE = { height: 13, radius: 4.2 };

/** Street lamps: one instanced iron mesh + one instanced glowing lantern mesh. */
export function buildLamps(lamps: readonly Lamp[]): THREE.Group {
  const g = new GeoBuilder();
  const at = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);
  g.merge(new THREE.CylinderGeometry(0.16, 0.2, 0.6, 8), at(0, 0.3, 0), IRON);
  g.merge(new THREE.CylinderGeometry(0.06, 0.08, LAMP_HEIGHT, 8), at(0, LAMP_HEIGHT / 2, 0), IRON);
  g.merge(new THREE.BoxGeometry(0.06, 0.06, ARM + 0.1), at(0, LAMP_HEIGHT - 0.05, ARM / 2), IRON);
  g.merge(new THREE.CylinderGeometry(0.02, 0.22, 0.18, 6), at(0, LAMP_HEIGHT - 0.12, ARM), IRON);
  g.merge(new THREE.CylinderGeometry(0.02, 0.2, 0.08, 6), at(0, LAMP_HEIGHT - 0.0, ARM), SNOWCAP);
  g.merge(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 6), at(0, LAMP_HEIGHT - 0.6, ARM), IRON);

  const posts = new THREE.InstancedMesh(g.build(), propMaterial(0.5, 0.3), lamps.length);
  const glass = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.17, 0.1, 0.36, 6),
    glowMaterial(new THREE.Color(1.0, 0.66, 0.36), 9),
    lamps.length,
  );
  const m = new THREE.Matrix4();
  lamps.forEach((l, i) => {
    m.makeRotationY(l.rot).setPosition(l.x, l.y, l.z);
    posts.setMatrixAt(i, m);
    const p = lanternPosition(l);
    glass.setMatrixAt(i, new THREE.Matrix4().makeRotationY(l.rot).setPosition(p.x, p.y, p.z));
  });
  posts.name = 'lamp-posts';
  glass.name = 'lamp-glass';
  const group = new THREE.Group();
  group.add(posts, glass);
  return group;
}

/** Catenary string lights + the tree's bulbs, all in one instanced bulb mesh. */
export function buildLights(strings: readonly StringLight[], tree: { x: number; y: number; z: number }): THREE.Group {
  const rng = createRng('bulbs');
  const bulbs: { p: THREE.Vector3; c: THREE.Color }[] = [];
  const wire: number[] = [];

  const bulbColor = (): THREE.Color => {
    const r = rng.next();
    if (r < 0.7) return new THREE.Color(1.0, 0.6, 0.24).multiplyScalar(7 + rng.next() * 3);
    if (r < 0.85) return new THREE.Color(1.0, 0.85, 0.6).multiplyScalar(6);
    if (r < 0.93) return new THREE.Color(1.0, 0.15, 0.1).multiplyScalar(6);
    return new THREE.Color(0.2, 1.0, 0.35).multiplyScalar(5);
  };

  for (const s of strings) {
    const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
    const n = Math.max(4, Math.round(len / 0.55));
    const yA = s.ay;
    const yB = s.by;
    let prev: THREE.Vector3 | null = null;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = new THREE.Vector3(
        s.ax + (s.bx - s.ax) * t,
        yA + (yB - yA) * t - s.sag * 4 * t * (1 - t),
        s.az + (s.bz - s.az) * t,
      );
      if (prev) wire.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
      prev = p;
      if (i > 0 && i < n) bulbs.push({ p: p.clone().add(new THREE.Vector3(0, -0.06, 0)), c: bulbColor() });
    }
  }

  // Spiral of bulbs around the tree.
  const turns = 6;
  const count = 170;
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const y = 1.3 + t * (TREE_SIZE.height - 2.2);
    const r = TREE_SIZE.radius * (1 - (y - 0.8) / TREE_SIZE.height) + 0.15;
    const a = t * turns * Math.PI * 2;
    bulbs.push({ p: new THREE.Vector3(tree.x + Math.cos(a) * r, tree.y + y, tree.z + Math.sin(a) * r), c: bulbColor() });
  }

  const geo = new THREE.IcosahedronGeometry(0.075, 0);
  const colors = new Float32Array(bulbs.length * 3);
  bulbs.forEach((b, i) => b.c.toArray(colors, i * 3));
  geo.setAttribute('aBulb', new THREE.InstancedBufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicNodeMaterial();
  mat.colorNode = attribute('aBulb', 'vec3');
  const mesh = new THREE.InstancedMesh(geo, mat, bulbs.length);
  const m = new THREE.Matrix4();
  bulbs.forEach((b, i) => mesh.setMatrixAt(i, m.makeTranslation(b.p.x, b.p.y, b.p.z)));
  mesh.name = 'bulbs';

  const wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
  const wireMat = new THREE.LineBasicNodeMaterial({ color: 0x0a0b10 });
  const wires = new THREE.LineSegments(wireGeo, wireMat);
  wires.name = 'wires';

  const group = new THREE.Group();
  group.add(mesh, wires);
  return group;
}

/** The square's Christmas tree: stacked snowy cones, trunk, star. */
export function buildTree(at: { x: number; y: number; z: number }): THREE.Group {
  const TREE = { ...TREE_SIZE, ...at };
  const g = new GeoBuilder();
  const tiers = 6;
  g.merge(new THREE.CylinderGeometry(0.35, 0.45, 1.6, 8), new THREE.Matrix4().makeTranslation(TREE.x, TREE.y + 0.8, TREE.z), [0.16, 0.1, 0.07]);
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const r = TREE.radius * (1 - t * 0.82);
    const h = 3.4 - t * 1.2;
    const y = 1.2 + t * (TREE.height - 3.4);
    const cone = new THREE.ConeGeometry(r, h, 16, 4, true);
    // Dark needles at the bottom of each tier, snow lying on the upper part.
    const pos = cone.getAttribute('position');
    const col = new Float32Array(pos.count * 3);
    for (let v = 0; v < pos.count; v++) {
      const k = (pos.getY(v) + h / 2) / h; // 0 bottom → 1 tip
      const flick = 0.5 + 0.5 * Math.sin(v * 12.9898 + i * 4.1);
      const snow = Math.min(1, Math.max(0, (k - 0.3) * 2.2)) * (0.35 + 0.65 * flick);
      col.set([0.03 + snow * 0.72, 0.09 + snow * 0.72, 0.05 + snow * 0.84], v * 3);
    }
    cone.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.merge(cone, new THREE.Matrix4().makeRotationY(i * 0.7).setPosition(TREE.x, TREE.y + y + h / 2, TREE.z), [1, 1, 1]);
  }
  const geo = g.build();
  const tree = new THREE.Mesh(geo, propMaterial(0.8));
  tree.name = 'tree';

  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), glowMaterial(new THREE.Color(1.0, 0.8, 0.45), 10));
  star.position.set(TREE.x, TREE.y + TREE.height + 0.4, TREE.z);
  star.scale.set(1, 1.3, 0.35);
  star.name = 'star';

  const group = new THREE.Group();
  group.add(tree, star);
  return group;
}
