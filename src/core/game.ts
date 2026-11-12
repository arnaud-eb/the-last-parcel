import { ShiftClock } from './clock';
import { Handover } from './handover';
import { generateParcels, type Parcel, type Stop } from './parcels';
import { createRng } from './rng';

export type Phase = 'ready' | 'driving' | 'ended';

export type GameEvent =
  | { type: 'started' }
  | { type: 'delivered'; parcel: Parcel }
  | { type: 'allDelivered' }
  | { type: 'shiftEnded' };

export type VanSample = { x: number; z: number; speed: number };

export type GameOptions = { seed: string; stops: readonly Stop[]; parcelCount: number };

/** Gameplay state. Pure logic: no three.js, no DOM. */
export class Game {
  phase: Phase = 'ready';
  readonly clock = new ShiftClock();
  readonly handover = new Handover();
  parcels: Parcel[] = [];
  targetId: string | null = null;
  seed: string;
  private readonly opts: GameOptions;

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
    this.parcels = generateParcels(createRng(seed), this.opts.stops, this.opts.parcelCount);
    this.targetId = this.parcels[0]?.id ?? null;
  }

  start(): GameEvent[] {
    if (this.phase !== 'ready') return [];
    this.phase = 'driving';
    return [{ type: 'started' }];
  }

  get target(): Parcel | null {
    return this.parcels.find((p) => p.id === this.targetId) ?? null;
  }

  get parcelsLeft(): number {
    return this.parcels.filter((p) => !p.delivered).length;
  }

  get score(): number {
    return this.parcels.reduce((sum, p) => sum + (p.delivered ? p.value : 0), 0);
  }

  update(dt: number, van: VanSample): GameEvent[] {
    if (this.phase !== 'driving') return [];
    const events: GameEvent[] = [];
    this.clock.advance(dt);
    const target = this.target;
    if (target && this.handover.update(dt, target.stop.zone, van.x, van.z, van.speed)) {
      events.push(...this.deliver(target.id));
    }
    if (this.phase === 'driving' && this.clock.isOver) {
      this.phase = 'ended';
      events.push({ type: 'shiftEnded' });
    }
    return events;
  }

  /** Mark a parcel delivered now (also used by the ?test hook). */
  deliver(id: string): GameEvent[] {
    const parcel = this.parcels.find((p) => p.id === id);
    if (!parcel || parcel.delivered || this.phase === 'ended') return [];
    parcel.delivered = true;
    parcel.deliveredAt = this.clock.minutes;
    const events: GameEvent[] = [{ type: 'delivered', parcel }];
    const next = this.parcels.find((p) => !p.delivered);
    this.targetId = next?.id ?? null;
    if (!next) {
      this.phase = 'ended';
      events.push({ type: 'allDelivered' });
    }
    return events;
  }
}
