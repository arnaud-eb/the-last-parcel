/**
 * Market-goers: they stroll between random spots in their walk area, stop to
 * look at a stall now and then, and step out of the van's way. Pure logic
 * (seeded), no three.js; the market view draws them.
 */
import { createRng, type Rng } from '../core/rng';
import { inStall, WALK_AREAS, type WalkArea } from './market';

export type Person = {
  x: number;
  z: number;
  heading: number;
  /** Current walking speed (m/s), for the walk cycle. */
  speed: number;
  /** Walk-cycle phase (radians). */
  phase: number;
  area: WalkArea;
  tx: number;
  tz: number;
  /** Seconds left standing still. */
  wait: number;
  /** 0..1 appearance seed. */
  look: number;
};

export const CROWD = {
  walk: [0.6, 1.2] as [number, number],
  /** Closer than this to the van (m), people hurry aside. */
  avoid: 5,
  hurry: 2.6,
};

export class Crowd {
  readonly people: Person[] = [];
  private readonly rng: Rng;

  constructor(areas: readonly WalkArea[] = WALK_AREAS, seed = 'crowd') {
    this.rng = createRng(seed);
    for (const area of areas) {
      for (let i = 0; i < area.people; i++) {
        const [x, z] = this.spot(area);
        const p: Person = { x, z, heading: this.rng.range(0, Math.PI * 2), speed: 0, phase: this.rng.range(0, 6.3), area, tx: x, tz: z, wait: this.rng.range(0, 3), look: this.rng.next() };
        this.people.push(p);
      }
    }
  }

  private spot(a: WalkArea): [number, number] {
    for (let k = 0; k < 8; k++) {
      const x = a.x + this.rng.range(-a.hx, a.hx);
      const z = a.z + this.rng.range(-a.hz, a.hz);
      if (!inStall(x, z, 0.4)) return [x, z];
    }
    return [a.x, a.z];
  }

  /** Advance by dt seconds; `van` is the van's position (and speed, m/s). */
  update(dt: number, van: { x: number; z: number; speed: number }): void {
    const r = this.rng;
    for (const p of this.people) {
      let vx = 0;
      let vz = 0;
      const dvx = p.x - van.x;
      const dvz = p.z - van.z;
      const dv = Math.hypot(dvx, dvz);
      if (dv < CROWD.avoid && (Math.abs(van.speed) > 0.3 || dv < 2.5)) {
        // Out of the way: straight away from the van, faster the closer it is.
        const k = (CROWD.hurry * (1 - dv / CROWD.avoid)) / Math.max(dv, 0.01);
        vx = dvx * k;
        vz = dvz * k;
        p.wait = 0.5 + r.next();
      } else if (p.wait > 0) {
        p.wait -= dt;
        if (p.wait <= 0) [p.tx, p.tz] = this.spot(p.area);
      } else {
        const dx = p.tx - p.x;
        const dz = p.tz - p.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.3) {
          p.wait = r.range(1, 5);
        } else {
          const s = CROWD.walk[0] + p.look * (CROWD.walk[1] - CROWD.walk[0]);
          vx = (dx / d) * s;
          vz = (dz / d) * s;
        }
      }
      const nx = p.x + vx * dt;
      const nz = p.z + vz * dt;
      // Never walk into a stall.
      if (!inStall(nx, nz, 0.3)) {
        p.x = nx;
        p.z = nz;
      }
      p.speed = Math.hypot(vx, vz);
      if (p.speed > 0.05) {
        const want = Math.atan2(vx, vz);
        let d = want - p.heading;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        p.heading += d * Math.min(1, dt * 6);
      }
      p.phase += p.speed * dt * 5.5;
    }
  }
}
