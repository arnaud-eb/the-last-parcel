import { describe, expect, it } from 'vitest';
import { Game } from '../../src/core/game';
import { Handover, HOLD_SECONDS } from '../../src/core/handover';
import type { Stop } from '../../src/core/parcels';

const stop = (id: string, x: number, z: number): Stop => ({ id, address: `${id} Rue`, zone: { x, z, radius: 3 }, y: 0, district: 'old' });
const stops: Stop[] = [stop('a', 10, 0), stop('b', -10, 5), stop('c', 0, 40)];

function stepFor(game: Game, seconds: number, van: { x: number; z: number; speed: number }) {
  const events = [];
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) events.push(...game.update(dt, van));
  return events;
}

describe('parcel generation', () => {
  it('is the same for the same seed and picks distinct stops', () => {
    const a = new Game({ seed: 's1', stops, parcelCount: 3 });
    const b = new Game({ seed: 's1', stops, parcelCount: 3 });
    expect(a.parcels.map((p) => p.stop.id)).toEqual(b.parcels.map((p) => p.stop.id));
    expect(new Set(a.parcels.map((p) => p.stop.id)).size).toBe(3);
  });

  it('never makes more parcels than stops', () => {
    expect(new Game({ seed: 'x', stops, parcelCount: 10 }).parcels).toHaveLength(3);
  });
});

describe('handover', () => {
  it('completes after holding still in the zone', () => {
    const h = new Handover();
    const zone = { x: 0, z: 0, radius: 2 };
    let done = false;
    for (let t = 0; t < HOLD_SECONDS + 0.05 && !done; t += 1 / 60) done = h.update(1 / 60, zone, 0.5, 0, 0);
    expect(done).toBe(true);
  });

  it('does not count while moving fast or outside', () => {
    const h = new Handover();
    const zone = { x: 0, z: 0, radius: 2 };
    for (let i = 0; i < 120; i++) expect(h.update(1 / 60, zone, 0, 0, 8)).toBe(false);
    for (let i = 0; i < 120; i++) expect(h.update(1 / 60, zone, 5, 0, 0)).toBe(false);
  });
});

describe('game', () => {
  it('does not run the clock before start', () => {
    const g = new Game({ seed: 's', stops, parcelCount: 1 });
    stepFor(g, 2, { x: 0, z: 0, speed: 0 });
    expect(g.clock.elapsed).toBe(0);
  });

  it('delivers the target by stopping in its zone, and ends when all are delivered', () => {
    const g = new Game({ seed: 's', stops, parcelCount: 1 });
    g.start();
    const z = g.target!.stop.zone;
    const events = stepFor(g, 1.5, { x: z.x, z: z.z, speed: 0 });
    expect(events.map((e) => e.type)).toEqual(['delivered', 'allDelivered']);
    expect(g.parcelsLeft).toBe(0);
    expect(g.score).toBeGreaterThanOrEqual(g.parcels[0]!.value);
    expect(g.phase).toBe('ended');
  });

  it('ends the shift at 6pm', () => {
    const g = new Game({ seed: 's', stops, parcelCount: 1 });
    g.start();
    const events = stepFor(g, 301, { x: 999, z: 999, speed: 10 });
    expect(events.at(-1)?.type).toBe('shiftEnded');
    expect(g.phase).toBe('ended');
    expect(g.score).toBe(0);
  });

  it('reset with a new seed restarts the shift', () => {
    const g = new Game({ seed: 's', stops, parcelCount: 1 });
    g.start();
    g.deliver(g.targetId!);
    g.reset('t');
    expect(g.phase).toBe('ready');
    expect(g.parcelsLeft).toBe(1);
  });
});

// A town-sized grid of stops, a few of them down in Grund.
const town: Stop[] = [];
for (let i = 0; i < 12; i++)
  for (let j = 0; j < 8; j++) town.push({ ...stop(`t${i}-${j}`, i * 30, j * 30), y: i > 9 ? -34 : 0, district: i > 9 ? 'grund' : 'old' });

describe('the day\'s load', () => {
  it('has 14 to 18 parcels with all five types, on distinct, spread-out stops', () => {
    for (const seed of ['2026-12-24', '2026-12-01', 'free-1', 'free-2', 'x']) {
      const g = new Game({ seed, stops: town });
      expect(g.parcels.length).toBeGreaterThanOrEqual(14);
      expect(g.parcels.length).toBeLessThanOrEqual(18);
      expect(new Set(g.parcels.map((p) => p.type))).toEqual(new Set(['standard', 'express', 'fragile', 'heavy', 'grandma']));
      expect(new Set(g.parcels.map((p) => p.stop.id)).size).toBe(g.parcels.length);
      for (const p of g.parcels) {
        for (const q of g.parcels) if (p !== q) expect(Math.hypot(p.stop.zone.x - q.stop.zone.x, p.stop.zone.z - q.stop.zone.z)).toBeGreaterThanOrEqual(18);
        if (p.type === 'grandma') expect(p.stop.district).toBe('grund');
      }
    }
  });

  it('is the same for the same seed and differs between seeds', () => {
    const key = (s: string) => new Game({ seed: s, stops: town }).parcels.map((p) => `${p.type}@${p.stop.id}=${p.value}+${p.tip}`).join();
    expect(key('a')).toBe(key('a'));
    expect(key('a')).not.toBe(key('b'));
  });

  it('heavy parcels weigh the van down until delivered', () => {
    const g = new Game({ seed: 'w', stops: town });
    g.start();
    const before = g.loadKg;
    const heavy = g.parcels.find((p) => p.type === 'heavy')!;
    g.deliver(heavy.id);
    expect(before - g.loadKg).toBe(150);
  });
});

describe('stop picker', () => {
  it('targets the nearest parcel by default, and the next nearest after each delivery', () => {
    const g = new Game({ seed: 'n', stops: town, start: { x: 0, z: 0 } });
    const d = (p: { stop: Stop }) => Math.hypot(p.stop.zone.x, p.stop.zone.z);
    const nearest = Math.min(...g.parcels.map(d));
    expect(d(g.target!)).toBe(nearest);
    g.start();
    const z = g.target!.stop.zone;
    stepFor(g, 1.2, { x: z.x, z: z.z, speed: 0 });
    expect(g.target!.delivered).toBe(false);
    const fromHere = (p: { stop: Stop }) => Math.hypot(p.stop.zone.x - z.x, p.stop.zone.z - z.z);
    expect(fromHere(g.target!)).toBe(Math.min(...g.remaining.map(fromHere)));
  });

  it('keeps the picked stop as target, and uses the supplied driving distance', () => {
    // A distance function that prefers the stop farthest away in a straight line.
    const g = new Game({ seed: 'n', stops: town, start: { x: 0, z: 0 }, distance: (x, z, ss) => ss.map((s) => -Math.hypot(s.zone.x - x, s.zone.z - z)) });
    const far = Math.max(...g.parcels.map((p) => Math.hypot(p.stop.zone.x, p.stop.zone.z)));
    expect(Math.hypot(g.target!.stop.zone.x, g.target!.stop.zone.z)).toBe(far);
    const pick = g.parcels.find((p) => p.id !== g.targetId)!;
    expect(g.select(pick.id)).toBe(true);
    g.start();
    const other = g.parcels.find((p) => p.id !== pick.id)!;
    g.deliver(other.id);
    expect(g.targetId).toBe(pick.id);
  });

  it('hands over any parcel whose zone the van stops in, not only the target', () => {
    const g = new Game({ seed: 'n', stops: town, start: { x: 0, z: 0 } });
    g.start();
    const other = g.parcels.find((p) => p.id !== g.targetId)!;
    const events = stepFor(g, 1.2, { x: other.stop.zone.x, z: other.stop.zone.z, speed: 0 });
    expect(events.find((e) => e.type === 'delivered')).toMatchObject({ parcel: { id: other.id } });
  });
});

describe('hits', () => {
  it('cost damage points and chip fragile parcels still in the van; one crash counts once', () => {
    const g = new Game({ seed: 'h', stops: town });
    g.start();
    const fragile = g.parcels.filter((p) => p.type === 'fragile');
    g.deliver(fragile[0]!.id);
    expect(g.hit(2)).toEqual([]); // a bump
    // One crash: several samples within a few frames.
    g.hit(6);
    g.clock.advance(1 / 60);
    g.hit(5);
    g.clock.advance(1 / 60);
    g.hit(8);
    expect(g.damage).toBe(24);
    expect(fragile[0]!.hits).toBe(0);
    expect(fragile[1]!.hits).toBe(1);
    g.clock.advance(2);
    g.hit(5);
    expect(fragile[1]!.hits).toBe(2);
    expect(g.damage).toBe(39);
  });
});

describe('depot', () => {
  it('puts no parcel within 60 m of the van start', () => {
    const g = new Game({ seed: 'd', stops: town, start: { x: 0, z: 0 } });
    for (const p of g.parcels) expect(Math.hypot(p.stop.zone.x, p.stop.zone.z)).toBeGreaterThanOrEqual(60);
  });
});
