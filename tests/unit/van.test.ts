import { beforeAll, describe, expect, it } from 'vitest';
import { loadRapier, type Rapier } from '../../src/vehicle/rapier';
import { VanPhysics, type DriveInput } from '../../src/vehicle/van';
import { buildColliders } from '../../src/world/colliders';
import { buildLayout } from '../../src/world/layout';

let R: Rapier;
beforeAll(async () => {
  R = await loadRapier();
});

function setup() {
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 60;
  const layout = buildLayout();
  buildColliders(R, world, layout);
  const van = new VanPhysics(R, world, layout.start.x, layout.start.z, layout.start.heading);
  const run = (seconds: number, input: DriveInput) => {
    for (let i = 0; i < seconds * 60; i++) {
      van.update(1 / 60, input);
      world.step();
      van.afterStep();
    }
  };
  return { world, van, run, layout };
}

const idle: DriveInput = { steer: 0, throttle: 0, brake: 0 };

describe('van physics', () => {
  it('settles on its wheels at the start', () => {
    const { van, run } = setup();
    run(1, idle);
    const p = van.body.translation();
    expect(p.y).toBeGreaterThan(0.4);
    expect(p.y).toBeLessThan(1.2);
    expect(Math.abs(van.speed)).toBeLessThan(0.3);
  });

  it('accelerates forward (toward the square, -z) and stays upright', () => {
    const { van, run } = setup();
    run(0.5, idle);
    const z0 = van.body.translation().z;
    run(3, { steer: 0, throttle: 1, brake: 0 });
    expect(van.speed).toBeGreaterThan(7);
    expect(van.speed).toBeLessThan(17);
    expect(van.body.translation().z).toBeLessThan(z0 - 10);
    const q = van.body.rotation();
    const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
    expect(upY).toBeGreaterThan(0.95);
  });

  it('steers right with positive steer input', () => {
    const { van, run } = setup();
    run(0.5, idle);
    run(1.5, { steer: 0, throttle: 0.6, brake: 0 });
    const h0 = van.heading;
    run(1, { steer: 1, throttle: 0.4, brake: 0 });
    // Facing -z, the driver's right is +x.
    expect(Math.sin(h0)).toBeCloseTo(0, 0);
    expect(Math.sin(van.heading)).toBeGreaterThan(0.2);
  });

  it('brakes to a stop, then reverses', () => {
    const { van, world } = setup();
    const step = (input: DriveInput) => {
      van.update(1 / 60, input);
      world.step();
    };
    for (let i = 0; i < 150; i++) step({ steer: 0, throttle: 1, brake: 0 });
    const v0 = van.speed;
    let stopFrames = -1;
    for (let i = 0; i < 300 && stopFrames < 0; i++) {
      step({ steer: 0, throttle: 0, brake: 1 });
      if (van.speed < 0.6) stopFrames = i;
    }
    // Stops within ~2 s from ~7 m/s, but not instantly.
    expect(v0).toBeGreaterThan(6);
    expect(stopFrames).toBeGreaterThan(20);
    expect(stopFrames).toBeLessThan(120);
    for (let i = 0; i < 120; i++) step({ steer: 0, throttle: 0, brake: 1 });
    expect(van.speed).toBeLessThan(-1);
  });
});
