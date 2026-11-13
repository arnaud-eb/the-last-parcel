import { describe, expect, it } from 'vitest';
import { PARCEL_RULES, parcelValue, type Parcel, type ParcelType } from '../../src/core/parcels';
import { rankFor, streakBonus, tally } from '../../src/core/scoring';

let n = 0;
function parcel(type: ParcelType, value: number, deliveredAt: number | null, extra: Partial<Parcel> = {}): Parcel {
  n++;
  return {
    id: `p${n}`, type, value, tip: 0, hits: 0, delivered: deliveredAt !== null, deliveredAt,
    stop: { id: `s${n}`, address: '', zone: { x: 0, z: 0, radius: 3 }, y: 0, district: 'old' },
    ...extra,
  };
}
const line = (t: ReturnType<typeof tally>, label: string) => t.lines.find((l) => l.label.includes(label))!.points;

describe('scoring', () => {
  it('pays the express bonus only before 5pm', () => {
    const t = tally([parcel('express', 70, 59), parcel('express', 70, 61)], 0);
    expect(line(t, 'Express')).toBe(PARCEL_RULES.expressBonus);
  });

  it('fragile parcels lose value per hit and only intact ones earn the bonus', () => {
    const hit = parcel('fragile', 80, 30, { hits: 1 });
    expect(parcelValue(hit)).toBe(60);
    expect(parcelValue(parcel('fragile', 80, 30, { hits: 9 }))).toBe(20);
    const t = tally([hit, parcel('fragile', 80, 30)], 0);
    expect(line(t, 'intact')).toBe(PARCEL_RULES.fragileIntactBonus);
    expect(line(t, 'delivered')).toBe(140);
  });

  it('pays tips on time and intact, and the Grandma bonus', () => {
    const t = tally([
      parcel('standard', 50, 80, { tip: 20 }),
      parcel('standard', 50, 100, { tip: 20 }), // after 5:30pm
      parcel('fragile', 80, 10, { tip: 15, hits: 1 }), // broken
      parcel('grandma', 140, 50),
    ], 0);
    expect(line(t, 'Tips')).toBe(20);
    expect(line(t, 'Grandma')).toBe(PARCEL_RULES.grandmaBonus);
  });

  it('streak: deliveries within 30 s of each other build up a bonus', () => {
    // 30 s real = 12 game minutes.
    expect(streakBonus([0, 10, 20, 31, 40])).toBe(10 + 20 + 30 + 30);
    expect(streakBonus([0, 13, 26])).toBe(0);
    expect(streakBonus([])).toBe(0);
  });

  it('subtracts damage, never goes below zero, and counts only delivered parcels', () => {
    const t = tally([parcel('standard', 50, 10), parcel('heavy', 100, null)], 30);
    expect(t.score).toBe(20);
    expect(t.delivered).toBe(1);
    expect(tally([parcel('standard', 50, 10)], 500).score).toBe(0);
  });

  it('ranks by share of the load value', () => {
    const load = [parcel('standard', 50, null), parcel('standard', 50, null)];
    expect(rankFor(45, load)).toBe('Missed the Sleigh');
    expect(rankFor(50, load)).toBe('On Time');
    expect(rankFor(100, load)).toBe('Christmas Hero');
  });
});
