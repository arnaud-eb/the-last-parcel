import type { Rng } from './rng';
import type { Zone } from './handover';

export type ParcelType = 'standard' | 'express' | 'fragile' | 'heavy' | 'grandma';

export type StopDistrict = 'old' | 'belle' | 'grund';

/** A deliverable address in the town layout (authored in /world). */
export type Stop = { id: string; address: string; zone: Zone; y: number; district: StopDistrict };

export type Parcel = {
  id: string;
  type: ParcelType;
  /** Value on delivery, before damage. */
  value: number;
  /** Tip paid when delivered on time (and intact, if fragile). 0 = this recipient doesn't tip. */
  tip: number;
  stop: Stop;
  /** Hard hits taken while this parcel was in the van (only matters for fragile ones). */
  hits: number;
  delivered: boolean;
  /** Game minutes since 4:00pm. */
  deliveredAt: number | null;
};

/** Parcel rules (SPEC §2). Values are points. */
export const PARCEL_RULES = {
  count: { min: 14, max: 18 },
  /** How many of each special type per shift; the rest are standard. */
  mix: { express: 3, fragile: 3, heavy: 2, grandma: [1, 2] as [number, number] },
  value: {
    standard: [40, 70],
    express: [60, 80],
    fragile: [70, 90],
    heavy: [90, 120],
    grandma: [120, 150],
  } as Record<ParcelType, [number, number]>,
  /** Express bonus if delivered before 5pm (game minute 60). */
  expressBonus: 50,
  expressBy: 60,
  /** Fragile: each hard hit takes this share of the value, down to `fragileFloor`. */
  fragileLossPerHit: 0.25,
  fragileFloor: 0.25,
  fragileIntactBonus: 40,
  grandmaBonus: 100,
  /** Tips are paid for deliveries up to 5:30pm. */
  tipBy: 90,
  tipChance: 0.45,
  tip: [10, 25] as [number, number],
  /** Load in kg; heavy parcels slow the van down until delivered. */
  weight: { standard: 8, express: 6, fragile: 10, heavy: 150, grandma: 12 } as Record<ParcelType, number>,
  /** Stops picked for one shift are at least this far apart (m). */
  minSpacing: 18,
};

export const PARCEL_LABEL: Record<ParcelType, string> = {
  standard: 'Standard',
  express: 'Express',
  fragile: 'Fragile',
  heavy: 'Heavy',
  grandma: 'For Grandma',
};

/** Value of a parcel now, after any damage. */
export function parcelValue(p: Parcel): number {
  if (p.type !== 'fragile' || p.hits === 0) return p.value;
  const keep = Math.max(PARCEL_RULES.fragileFloor, 1 - p.hits * PARCEL_RULES.fragileLossPerHit);
  return Math.round(p.value * keep);
}

/** Grandma lives somewhere awkward: down in Grund if any stop is there. */
function isAwkward(s: Stop): boolean {
  return s.district === 'grund';
}

function roundTo5(n: number): number {
  return Math.round(n / 5) * 5;
}

/**
 * The day's load: 14 to 18 parcels with all five types, on distinct, spread-out stops.
 * Same rng → same parcels.
 */
export function generateParcels(rng: Rng, stops: readonly Stop[], count?: number): Parcel[] {
  const R = PARCEL_RULES;
  const wanted = Math.min(count ?? rng.int(R.count.min, R.count.max), stops.length);

  const grandmaCount = Math.min(wanted, rng.int(R.mix.grandma[0], R.mix.grandma[1]));
  const types: ParcelType[] = [];
  for (let i = 0; i < grandmaCount; i++) types.push('grandma');
  for (const t of ['express', 'fragile', 'heavy'] as const) for (let i = 0; i < R.mix[t] && types.length < wanted; i++) types.push(t);
  while (types.length < wanted) types.push('standard');

  const chosen: Stop[] = [];
  const spaced = (s: Stop) => chosen.every((c) => Math.hypot(c.zone.x - s.zone.x, c.zone.z - s.zone.z) >= R.minSpacing);
  const take = (pool: Stop[]): Stop | null => {
    const ok = pool.filter((s) => !chosen.includes(s) && spaced(s));
    const from = ok.length ? ok : pool.filter((s) => !chosen.includes(s));
    if (!from.length) return null;
    const s = from[rng.int(0, from.length - 1)]!;
    chosen.push(s);
    return s;
  };

  const all = [...stops];
  const awkward = all.filter(isAwkward);
  const parcels: Parcel[] = [];
  for (const type of types) {
    const stop = (type === 'grandma' && awkward.length ? take(awkward) : null) ?? take(all);
    if (!stop) break;
    const [lo, hi] = R.value[type];
    const tip = rng.next() < R.tipChance ? roundTo5(rng.range(R.tip[0], R.tip[1])) : 0;
    parcels.push({
      id: '',
      type,
      value: roundTo5(rng.range(lo, hi)),
      tip,
      stop,
      hits: 0,
      delivered: false,
      deliveredAt: null,
    });
  }
  // Shuffle so types aren't grouped, then number them.
  for (let i = parcels.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [parcels[i], parcels[j]] = [parcels[j]!, parcels[i]!];
  }
  parcels.forEach((p, i) => (p.id = `p${i + 1}`));
  return parcels;
}
