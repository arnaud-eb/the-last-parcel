import { describe, expect, it } from 'vitest';
import { Crowd } from '../../src/world/crowd';
import { inStall, STALLS } from '../../src/world/market';
import { buildLayout } from '../../src/world/layout';
import { NavGraph } from '../../src/world/navgraph';
import { onRoad } from '../../src/world/roads';

describe('christmas markets', () => {
  const layout = buildLayout();

  it('keep stalls clear of every delivery zone, the streets and each other', () => {
    expect(STALLS.length).toBeGreaterThanOrEqual(18);
    for (const s of layout.stops) expect(inStall(s.zone.x, s.zone.z, s.zone.radius + 1.5), s.address).toBe(false);
    for (const st of STALLS) {
      expect(onRoad(st.x, st.z, 3)).toBe(false);
      for (const o of STALLS) if (o !== st) expect(Math.hypot(o.x - st.x, o.z - st.z)).toBeGreaterThan(st.width);
    }
  });

  it('leave every stop reachable by road', () => {
    const g = new NavGraph();
    for (const s of layout.stops) expect(g.path(layout.start.x, layout.start.z, s.zone.x, s.zone.z), s.address).not.toBeNull();
  });
});

describe('crowd', () => {
  it('wanders, never inside a stall, and steps away from an approaching van', () => {
    const c = new Crowd();
    const p = c.people[0]!;
    const start = { x: p.x, z: p.z };
    for (let i = 0; i < 600; i++) c.update(1 / 30, { x: 999, z: 999, speed: 0 });
    expect(c.people.some((q) => q.speed > 0) || Math.hypot(p.x - start.x, p.z - start.z) > 0).toBe(true);
    for (const q of c.people) expect(inStall(q.x, q.z, 0.2)).toBe(false);
    // Drive at someone: they move away.
    const before = Math.hypot(p.x - (p.x - 3), 0);
    const van = { x: p.x - 3, z: p.z, speed: 5 };
    for (let i = 0; i < 30; i++) c.update(1 / 30, van);
    expect(Math.hypot(p.x - van.x, p.z - van.z)).toBeGreaterThan(before);
  });

  it('is the same every run', () => {
    const a = new Crowd();
    const b = new Crowd();
    for (let i = 0; i < 100; i++) {
      a.update(1 / 30, { x: 0, z: 0, speed: 0 });
      b.update(1 / 30, { x: 0, z: 0, speed: 0 });
    }
    expect(a.people.map((p) => p.x)).toEqual(b.people.map((p) => p.x));
  });
});
