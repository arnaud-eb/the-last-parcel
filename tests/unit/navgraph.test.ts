import { describe, expect, it } from 'vitest';
import { NavGraph } from '../../src/world/navgraph';
import { buildLayout } from '../../src/world/layout';

const graph = new NavGraph();
const layout = buildLayout();

describe('navigation graph', () => {
  it('every delivery address can be driven to from the depot', () => {
    const { x, z } = layout.start;
    const unreachable = layout.stops.filter((s) => graph.path(x, z, s.zone.x, s.zone.z) === null).map((s) => s.address);
    expect(unreachable).toEqual([]);
  });

  it('every stop is close to the street network', () => {
    for (const s of layout.stops) {
      const n = graph.nodes[graph.nearest(s.zone.x, s.zone.z)]!;
      expect(Math.hypot(n.x - s.zone.x, n.z - s.zone.z), s.address).toBeLessThan(12);
    }
  });

  it('the route to Grund goes over Pont Adolphe and down the switchbacks', () => {
    const p = graph.path(layout.start.x, layout.start.z, 300, -20)!;
    expect(p).not.toBeNull();
    expect(p.some((n) => Math.abs(n.x) < 1 && n.z > 60 && n.z < 166)).toBe(true); // on the bridge
    expect(p.at(-1)!.y).toBeLessThan(-30); // down in the valley
  });
});

describe('driving distances', () => {
  it('to Grund are much longer than the straight line from the Corniche above it', () => {
    const g = new NavGraph();
    // From the Corniche (upper town) to Rue Münster, about 75 m away but 34 m below.
    const [d] = g.distances(231, 0, -22, [{ x: 298, y: -34, z: 6 }]);
    expect(d).toBeGreaterThan(200);
    const [near] = g.distances(231, 0, -22, [{ x: 228, y: 0, z: -62 }]);
    expect(near).toBeLessThan(60);
  });
});
