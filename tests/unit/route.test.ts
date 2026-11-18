import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/core/rng';
import { planRoute, routeLength } from '../../src/core/route';

function matrix(pts: [number, number][], van: [number, number]) {
  const d = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  return { fromVan: pts.map((p) => d(van, p)), between: pts.map((a) => pts.map((b) => d(a, b))) };
}

function greedy(fromVan: number[], between: number[][]): number[] {
  const left = new Set(fromVan.map((_, i) => i));
  const out: number[] = [];
  let cur = -1;
  while (left.size) {
    let best = -1;
    for (const i of left) if (best < 0 || (cur < 0 ? fromVan[i]! < fromVan[best]! : between[cur]![i]! < between[cur]![best]!)) best = i;
    out.push(best);
    left.delete(best);
    cur = best;
  }
  return out;
}

describe('planned route', () => {
  it('visits every stop once', () => {
    const { fromVan, between } = matrix([[1, 0], [5, 5], [-3, 2], [8, -1]], [0, 0]);
    expect([...planRoute(fromVan, between)].sort()).toEqual([0, 1, 2, 3]);
    expect(planRoute([], [])).toEqual([]);
  });

  it('does not leave a straggler behind to drive back for (nearest-first does)', () => {
    // A street running east with one door just west of the van: nearest-first heads east,
    // then has to come all the way back. The plan picks it up first.
    const pts: [number, number][] = [[-6, 0], [5, 0], [15, 0], [25, 0], [35, 0], [45, 0]];
    const { fromVan, between } = matrix(pts, [0, 0]);
    const g = greedy(fromVan, between);
    const p = planRoute(fromVan, between);
    expect(routeLength(p, fromVan, between)).toBeLessThan(routeLength(g, fromVan, between));
    expect(p[0]).toBe(0);
  });

  it('is never longer than nearest-first on random towns', () => {
    const rng = createRng('route');
    for (let t = 0; t < 40; t++) {
      const pts: [number, number][] = Array.from({ length: 16 }, () => [rng.range(-300, 300), rng.range(-300, 300)]);
      const { fromVan, between } = matrix(pts, [0, 0]);
      expect(routeLength(planRoute(fromVan, between), fromVan, between)).toBeLessThanOrEqual(routeLength(greedy(fromVan, between), fromVan, between) + 1e-6);
    }
  });
});
