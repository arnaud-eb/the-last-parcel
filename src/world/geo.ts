import * as THREE from 'three/webgpu';

/**
 * Accumulates quads/triangles into one merged BufferGeometry so a whole class
 * of scenery (all walls, all roofs…) is a single draw call.
 */
export class GeoBuilder {
  private pos: number[] = [];
  private nrm: number[] = [];
  private uvs: number[] = [];
  private col: number[] = [];
  private extra: number[] = [];
  private idx: number[] = [];

  private readonly extraSize: number;

  /** `extras`: custom per-vertex attributes, e.g. [['aWall', 4]]. Pass their values concatenated. */
  constructor(private readonly extras: readonly [name: string, size: number][] = []) {
    this.extraSize = extras.reduce((n, [, s]) => n + s, 0);
  }

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  vertex(p: THREE.Vector3, n: THREE.Vector3, u: number, v: number, c: readonly number[], extra: readonly number[] = []): number {
    this.pos.push(p.x, p.y, p.z);
    this.nrm.push(n.x, n.y, n.z);
    this.uvs.push(u, v);
    this.col.push(c[0]!, c[1]!, c[2]!);
    for (let i = 0; i < this.extraSize; i++) this.extra.push(extra[i] ?? 0);
    return this.vertexCount - 1;
  }

  /** Raw triangle indices (for vertices added with vertex()). */
  indices(...ids: number[]): void {
    this.idx.push(...ids);
  }

  /** Quad a,b,c,d counter-clockwise seen from the front, normal computed. */
  quad(
    a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3,
    uv: [number, number, number, number, number, number, number, number],
    color: readonly number[], extra: readonly number[] = [],
    /** If given, winding is flipped so the normal faces this way. */
    facing?: THREE.Vector3,
  ): void {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
    if (facing && n.dot(facing) < 0) {
      this.quad(a, d, c, b, [uv[0], uv[1], uv[6], uv[7], uv[4], uv[5], uv[2], uv[3]], color, extra);
      return;
    }
    const i0 = this.vertex(a, n, uv[0], uv[1], color, extra);
    const i1 = this.vertex(b, n, uv[2], uv[3], color, extra);
    const i2 = this.vertex(c, n, uv[4], uv[5], color, extra);
    const i3 = this.vertex(d, n, uv[6], uv[7], color, extra);
    this.idx.push(i0, i1, i2, i0, i2, i3);
  }

  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, uv: [number, number, number, number, number, number], color: readonly number[], extra: readonly number[] = []): void {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    const i0 = this.vertex(a, n, uv[0], uv[1], color, extra);
    const i1 = this.vertex(b, n, uv[2], uv[3], color, extra);
    const i2 = this.vertex(c, n, uv[4], uv[5], color, extra);
    this.idx.push(i0, i1, i2);
  }

  /** Append a geometry transformed by m. Uses its own `color` attribute if it has one. */
  merge(geo: THREE.BufferGeometry, m: THREE.Matrix4, color: readonly number[], extra: readonly number[] = []): void {
    const g = geo;
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const uv = g.getAttribute('uv');
    const vc = g.getAttribute('color');
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const base = this.vertexCount;
    const v = new THREE.Vector3();
    const nv = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m);
      nv.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
      const c = vc ? [vc.getX(i), vc.getY(i), vc.getZ(i)] : color;
      this.vertex(v, nv, uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0, c, extra);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) this.idx.push(base + g.index.getX(i));
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    let offset = 0;
    for (const [name, size] of this.extras) {
      const n = this.vertexCount;
      const data = new Float32Array(n * size);
      for (let v = 0; v < n; v++) for (let k = 0; k < size; k++) data[v * size + k] = this.extra[v * this.extraSize + offset + k]!;
      g.setAttribute(name, new THREE.BufferAttribute(data, size));
      offset += size;
    }
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}
