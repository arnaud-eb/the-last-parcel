import { describe, expect, it } from 'vitest';
import { Game } from '../../src/core/game';
import { Handover, HOLD_SECONDS } from '../../src/core/handover';
import type { Stop } from '../../src/core/parcels';

const stops: Stop[] = [
  { id: 'a', address: '1 Rue A', zone: { x: 10, z: 0, radius: 3 } },
  { id: 'b', address: '2 Rue B', zone: { x: -10, z: 5, radius: 3 } },
  { id: 'c', address: '3 Rue C', zone: { x: 0, z: 40, radius: 3 } },
];

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
    expect(g.score).toBe(g.parcels[0]!.value);
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
