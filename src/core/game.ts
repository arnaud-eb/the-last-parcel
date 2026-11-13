import { ShiftClock } from './clock';
import { Handover, isInZone, type Zone } from './handover';
import { generateParcels, PARCEL_RULES, type Parcel, type Stop } from './parcels';
import { createRng } from './rng';
import { hitPenalty, SCORING, tally, type Tally } from './scoring';

export type Phase = 'ready' | 'driving' | 'ended';

export type GameEvent =
  | { type: 'started' }
  | { type: 'delivered'; parcel: Parcel }
  | { type: 'damaged'; penalty: number; fragile: number }
  | { type: 'allDelivered' }
  | { type: 'shiftEnded' };

export type VanSample = { x: number; z: number; speed: number };

/** Driving distance from (x, z) to each stop, in the same order. Straight line when not given. */
export type DistanceFn = (x: number, z: number, stops: readonly Stop[]) => number[];

export type GameOptions = {
  seed: string;
  stops: readonly Stop[];
  /** Fixed parcel count (tests); by default 14 to 18 from the seed. */
  parcelCount?: number;
  /** Van start, for picking the nearest first stop. */
  start?: { x: number; z: number };
  distance?: DistanceFn;
};

/** Stops closer than this to the depot (m) get no parcels. */
const MIN_FROM_DEPOT = 60;

/** Seconds within which hit samples count as the same crash. */
const HIT_MERGE = 0.6;

const straight: DistanceFn = (x, z, stops) => stops.map((s) => Math.hypot(s.zone.x - x, s.zone.z - z));

/** Gameplay state. Pure logic: no three.js, no DOM. */
export class Game {
  phase: Phase = 'ready';
  readonly clock = new ShiftClock();
  readonly handover = new Handover();
  parcels: Parcel[] = [];
  targetId: string | null = null;
  /** True until the player picks a stop; then the target stays theirs until it's delivered. */
  autoTarget = true;
  /** Damage penalty points so far. */
  damage = 0;
  seed: string;
  private readonly opts: GameOptions;
  private van = { x: 0, z: 0 };
  /** Clock time and strength of the last hard hit, to merge one crash's samples. */
  private lastHit = { at: -Infinity, strength: 0 };
  private holdZone: Zone | null = null;

  constructor(opts: GameOptions) {
    this.opts = opts;
    this.seed = opts.seed;
    this.reset(opts.seed);
  }

  reset(seed: string): void {
    this.seed = seed;
    this.phase = 'ready';
    this.clock.elapsed = 0;
    this.handover.progress = 0;
    this.damage = 0;
    this.lastHit = { at: -Infinity, strength: 0 };
    this.holdZone = null;
    // No doorstep deliveries at the depot: the first stop is a real drive away.
    const st = this.opts.start;
    const stops = st ? this.opts.stops.filter((s) => Math.hypot(s.zone.x - st.x, s.zone.z - st.z) >= MIN_FROM_DEPOT) : this.opts.stops;
    this.parcels = generateParcels(createRng(seed), stops, this.opts.parcelCount);
    this.van = { ...(this.opts.start ?? { x: 0, z: 0 }) };
    this.autoTarget = true;
    this.targetId = null;
    this.retarget();
  }

  start(): GameEvent[] {
    if (this.phase !== 'ready') return [];
    this.phase = 'driving';
    return [{ type: 'started' }];
  }

  get target(): Parcel | null {
    return this.parcels.find((p) => p.id === this.targetId) ?? null;
  }

  get remaining(): Parcel[] {
    return this.parcels.filter((p) => !p.delivered);
  }

  get parcelsLeft(): number {
    return this.remaining.length;
  }

  /** Weight on board (kg): heavy parcels make the van slower until they're delivered. */
  get loadKg(): number {
    return this.remaining.reduce((s, p) => s + PARCEL_RULES.weight[p.type], 0);
  }

  get tally(): Tally {
    return tally(this.parcels, this.damage);
  }

  get score(): number {
    return this.tally.score;
  }

  /** Stop picker: make this parcel the current target. */
  select(id: string): boolean {
    const p = this.parcels.find((q) => q.id === id);
    if (!p || p.delivered) return false;
    this.targetId = id;
    this.autoTarget = false;
    return true;
  }

  /** Point at the nearest undelivered parcel (by driving distance when the app supplies it). */
  retarget(): void {
    const left = this.remaining;
    if (!left.length) {
      this.targetId = null;
      return;
    }
    const d = (this.opts.distance ?? straight)(this.van.x, this.van.z, left.map((p) => p.stop));
    let best = 0;
    for (let i = 1; i < left.length; i++) if (d[i]! < d[best]!) best = i;
    this.targetId = left[best]!.id;
  }

  update(dt: number, van: VanSample): GameEvent[] {
    if (this.phase !== 'driving') return [];
    this.van.x = van.x;
    this.van.z = van.z;
    const events: GameEvent[] = [];
    this.clock.advance(dt);
    // Any parcel's zone works; the target's first if zones touch.
    const target = this.target;
    const here =
      target && isInZone(target.stop.zone, van.x, van.z) ? target : this.remaining.find((p) => isInZone(p.stop.zone, van.x, van.z)) ?? null;
    const zone = here?.stop.zone ?? null;
    if (zone !== this.holdZone) {
      this.handover.progress = 0;
      this.holdZone = zone;
    }
    if (this.handover.update(dt, zone, van.x, van.z, van.speed) && here) events.push(...this.deliver(here.id));
    if (this.phase === 'driving' && this.clock.isOver) {
      this.phase = 'ended';
      events.push({ type: 'shiftEnded' });
    }
    return events;
  }

  /**
   * A collision with this speed loss (m/s). Hard hits cost damage points and
   * chip fragile parcels still in the van. Samples of one crash are merged.
   */
  hit(strength: number): GameEvent[] {
    if (this.phase !== 'driving' || strength < SCORING.hardHit) return [];
    const now = this.clock.elapsed;
    if (now - this.lastHit.at < HIT_MERGE) {
      this.lastHit.at = now;
      if (strength <= this.lastHit.strength) return [];
      // Same crash, harder than its first sample: top up the penalty only.
      const extra = hitPenalty(strength) - hitPenalty(this.lastHit.strength);
      this.lastHit.strength = strength;
      this.damage += extra;
      return extra > 0 ? [{ type: 'damaged', penalty: extra, fragile: 0 }] : [];
    }
    this.lastHit = { at: now, strength };
    const penalty = hitPenalty(strength);
    this.damage += penalty;
    const fragile = this.remaining.filter((p) => p.type === 'fragile');
    for (const p of fragile) p.hits++;
    return [{ type: 'damaged', penalty, fragile: fragile.length }];
  }

  /** Mark a parcel delivered now (also used by the ?test hook). */
  deliver(id: string): GameEvent[] {
    const parcel = this.parcels.find((p) => p.id === id);
    if (!parcel || parcel.delivered || this.phase === 'ended') return [];
    parcel.delivered = true;
    parcel.deliveredAt = this.clock.minutes;
    this.handover.progress = 0;
    const events: GameEvent[] = [{ type: 'delivered', parcel }];
    if (this.targetId === id || this.autoTarget) {
      this.autoTarget = true;
      this.retarget();
    }
    if (!this.remaining.length) {
      this.phase = 'ended';
      events.push({ type: 'allDelivered' });
    }
    return events;
  }
}
