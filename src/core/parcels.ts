import type { Rng } from './rng';
import type { Zone } from './handover';

export type ParcelType = 'standard' | 'express' | 'fragile' | 'heavy' | 'grandma';

/** A deliverable address in the town layout (authored in /world). */
export type Stop = { id: string; address: string; zone: Zone };

export type Parcel = {
  id: string;
  type: ParcelType;
  value: number;
  stop: Stop;
  delivered: boolean;
  /** Game minutes since 4:00pm. */
  deliveredAt: number | null;
};

/** M1: standard parcels only, picked from the available stops without repeats. */
export function generateParcels(rng: Rng, stops: readonly Stop[], count: number): Parcel[] {
  const pool = [...stops];
  const n = Math.min(count, pool.length);
  const parcels: Parcel[] = [];
  for (let i = 0; i < n; i++) {
    const idx = rng.int(0, pool.length - 1);
    const stop = pool.splice(idx, 1)[0]!;
    parcels.push({
      id: `p${i + 1}`,
      type: 'standard',
      value: 50 + rng.int(0, 10) * 5,
      stop,
      delivered: false,
      deliveredAt: null,
    });
  }
  return parcels;
}
