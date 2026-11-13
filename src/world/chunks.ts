/** Scenery is split into square map chunks so off-screen parts get frustum-culled. */
export const CHUNK = 96;

export function chunkKey(x: number, z: number): string {
  return `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`;
}

/** Group items by the chunk their (x, z) falls in. */
export function byChunk<T>(items: readonly T[], pos: (t: T) => { x: number; z: number }): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const p = pos(it);
    const k = chunkKey(p.x, p.z);
    let list = m.get(k);
    if (!list) m.set(k, (list = []));
    list.push(it);
  }
  return m;
}
