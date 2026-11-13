import { describe, expect, it } from 'vitest';
import { baseHeight, terrainHeight } from '../../src/world/terrain';
import { frameAt, nearestRoad, roadLength } from '../../src/world/roads';
import { ROADS, VALLEY_Y } from '../../src/world/town';

const road = (name: string) => ROADS.find((r) => r.name === name)!;

describe('terrain', () => {
  it('upper town is on the plateau, Grund and the Pétrusse floor are in the valley', () => {
    expect(baseHeight(30, -95)).toBeCloseTo(0); // Place d'Armes
    expect(baseHeight(300, 0)).toBeCloseTo(VALLEY_Y); // Grund
    expect(baseHeight(0, 112)).toBeCloseTo(VALLEY_Y); // under Pont Adolphe
  });

  it('streets are graded to their surface, even down the switchbacks', () => {
    const r = road('Montée du Grund');
    const len = roadLength(r);
    for (let s = 0; s <= len; s += 7) {
      const f = frameAt(r, s);
      expect(Math.abs(terrainHeight(f.x, f.z) - f.y)).toBeLessThan(0.6);
    }
  });

  it('the valley stays open under the bridge', () => {
    expect(terrainHeight(0, 112)).toBeLessThan(VALLEY_Y + 1);
  });

  it('switchback gradients are steep but drivable (< 25%)', () => {
    const r = road('Montée du Grund');
    for (let i = 0; i < r.points.length - 1; i++) {
      const [ax, ay, az] = r.points[i]!;
      const [bx, by, bz] = r.points[i + 1]!;
      expect(Math.abs(by - ay) / Math.hypot(bx - ax, bz - az)).toBeLessThan(0.25);
    }
  });
});

describe('roads', () => {
  it('nearestRoad finds the avenue from the depot', () => {
    expect(nearestRoad(1, 300)!.seg.road.name).toBe('Avenue de la Liberté');
  });
});
