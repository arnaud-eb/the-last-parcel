/**
 * Suggested delivery order: a short open path from the van through every stop left.
 * Nearest-neighbour start, then 2-opt. Distances are driving distances when the app
 * supplies them, so the plan sweeps the upper town before going down to Grund
 * instead of leaving stragglers to drive back for.
 */

/**
 * @param fromVan driving distance from the van to stop i
 * @param between between[i][j], driving distance from stop i to stop j
 * @returns stop indices in visiting order
 */
export function planRoute(fromVan: readonly number[], between: readonly (readonly number[])[]): number[] {
  const n = fromVan.length;
  if (n === 0) return [];
  // Nearest neighbour.
  const order: number[] = [];
  const used = new Uint8Array(n);
  let cur = -1;
  for (let k = 0; k < n; k++) {
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      const d = cur < 0 ? fromVan[i]! : between[cur]![i]!;
      if (d < bd || best < 0) {
        bd = d;
        best = i;
      }
    }
    used[best] = 1;
    order.push(best);
    cur = best;
  }
  // Improve: 2-opt (reverse a stretch) and or-opt (move 1 to 3 stops elsewhere, e.g. a
  // straggler left at the end to where the route passes it). The van is a fixed start.
  const d = (a: number, b: number) => (a < 0 ? fromVan[b]! : between[a]![b]!);
  for (let improved = true, pass = 0; improved && pass < 50; pass++) {
    improved = false;
    if (orOpt(order, d)) improved = true;
    for (let i = 0; i < n - 1; i++) {
      const a = i === 0 ? -1 : order[i - 1]!;
      for (let j = i + 1; j < n; j++) {
        const b = order[i]!;
        const c = order[j]!;
        const e = j + 1 < n ? order[j + 1]! : null;
        // Reverse order[i..j]: edges a→b and c→e become a→c and b→e.
        const before = d(a, b) + (e === null ? 0 : d(c, e));
        const after = d(a, c) + (e === null ? 0 : d(b, e));
        if (after < before - 1e-6) {
          order.splice(i, j - i + 1, ...order.slice(i, j + 1).reverse());
          improved = true;
        }
      }
    }
  }
  return order;
}

/** Move one stretch of 1..3 stops to its best place if that shortens the path. True if it did. */
function orOpt(order: number[], d: (a: number, b: number) => number): boolean {
  const n = order.length;
  const len = (o: number[]) => o.reduce((s, x, k) => s + d(k === 0 ? -1 : o[k - 1]!, x), 0);
  let base = len(order);
  let moved = false;
  for (let seg = 1; seg <= 3; seg++) {
    for (let i = 0; i + seg <= n; i++) {
      const piece = order.slice(i, i + seg);
      const rest = [...order.slice(0, i), ...order.slice(i + seg)];
      for (let k = 0; k <= rest.length; k++) {
        if (k === i) continue;
        for (const p of [piece, [...piece].reverse()]) {
          const cand = [...rest.slice(0, k), ...p, ...rest.slice(k)];
          const l = len(cand);
          if (l < base - 1e-6) {
            order.splice(0, n, ...cand);
            base = l;
            moved = true;
          }
        }
      }
    }
  }
  return moved;
}

/** Length of a visiting order. */
export function routeLength(order: readonly number[], fromVan: readonly number[], between: readonly (readonly number[])[]): number {
  let len = 0;
  order.forEach((s, k) => (len += k === 0 ? fromVan[s]! : between[order[k - 1]!]![s]!));
  return len;
}
