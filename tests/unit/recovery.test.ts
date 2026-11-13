import { describe, expect, it } from 'vitest';
import { RECOVERY, RecoveryWatch } from '../../src/vehicle/recovery';
import { nearestRoad, recoveryPoint } from '../../src/world/roads';
import { terrainHeight } from '../../src/world/terrain';

const run = (w: RecoveryWatch, seconds: number, s: { upY: number; speed: number; wheelsOnGround: number }) => {
  for (let t = 0; t < seconds; t += 1 / 60) if (w.update(1 / 60, s)) return true;
  return false;
};

describe('RecoveryWatch', () => {
  it('resets a van lying on its side once it has stopped', () => {
    const w = new RecoveryWatch();
    expect(run(w, RECOVERY.tiltSeconds - 0.1, { upY: 0.1, speed: 0, wheelsOnGround: 0 })).toBe(false);
    expect(run(w, 0.2, { upY: 0.1, speed: 0, wheelsOnGround: 0 })).toBe(true);
  });

  it('leaves a van that is still sliding or upright alone', () => {
    const w = new RecoveryWatch();
    expect(run(w, 5, { upY: 0.1, speed: 6, wheelsOnGround: 0 })).toBe(false); // still moving
    expect(run(w, 5, { upY: 0.95, speed: 0, wheelsOnGround: 4 })).toBe(false); // parked
    expect(run(w, 5, { upY: 0.8, speed: 0.5, wheelsOnGround: 2 })).toBe(false); // on a slope, two wheels down
  });

  it('resets a van stranded with no wheel on the ground', () => {
    const w = new RecoveryWatch();
    expect(run(w, RECOVERY.strandedSeconds + 0.1, { upY: 0.9, speed: 0, wheelsOnGround: 0 })).toBe(true);
  });

  it('starts counting again after the van rights itself', () => {
    const w = new RecoveryWatch();
    run(w, RECOVERY.tiltSeconds - 0.2, { upY: 0.1, speed: 0, wheelsOnGround: 0 });
    run(w, 0.1, { upY: 1, speed: 0, wheelsOnGround: 4 });
    expect(run(w, RECOVERY.tiltSeconds - 0.2, { upY: 0.1, speed: 0, wheelsOnGround: 0 })).toBe(false);
  });
});

describe('recoveryPoint', () => {
  it('puts a van off the switchbacks back on the road at its own level', () => {
    const x = 247;
    const z = 10;
    const y = terrainHeight(x, z);
    const r = recoveryPoint(x, y, z, 0);
    const n = nearestRoad(r.x, r.z)!;
    expect(n.dist).toBeLessThan(0.01);
    expect(Math.abs(r.y - y)).toBeLessThan(8);
  });

  it('faces along the road, the way the van was going', () => {
    // Avenue de la Liberté runs north-south; a van heading roughly north keeps heading north.
    const north = recoveryPoint(14, 0, 250, Math.PI - 0.4);
    expect(Math.cos(north.heading - Math.PI)).toBeGreaterThan(0.99);
    const south = recoveryPoint(14, 0, 250, 0.3);
    expect(Math.cos(south.heading)).toBeGreaterThan(0.99);
  });

  it('a van that fell into the Pétrusse valley goes back up onto Pont Adolphe', () => {
    const r = recoveryPoint(0, -34, 110, 0);
    expect(r.y).toBe(0);
    expect(Math.abs(r.x)).toBeLessThan(0.01);
  });
});
