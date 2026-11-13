import { describe, expect, it } from 'vitest';
import { facadeCols, facadeSlots, upperFloors, GROUND_FLOOR_H, FLOOR_H } from '../../src/world/facade';

describe('facade grid', () => {
  it('fits columns to the width', () => {
    expect(facadeCols(2)).toBe(1);
    expect(facadeCols(7.9)).toBe(3);
  });

  it('counts the upper floors under the eaves', () => {
    expect(upperFloors(GROUND_FLOOR_H + 3 * FLOOR_H)).toBe(3);
    expect(upperFloors(GROUND_FLOOR_H + 2.5 * FLOOR_H)).toBe(2);
  });

  it('has one door, shop or windows on the ground floor, windows above', () => {
    const slots = facadeSlots({ width: 8, height: GROUND_FLOOR_H + 2 * FLOOR_H, shop: true, doorCol: 1 });
    expect(slots.filter((s) => s.kind === 'door')).toHaveLength(1);
    expect(slots.filter((s) => s.kind === 'shop')).toHaveLength(2);
    expect(slots.filter((s) => s.kind === 'upper')).toHaveLength(6);
    for (const s of slots) {
      expect(s.u).toBeGreaterThan(0);
      expect(s.u).toBeLessThan(8);
      expect(s.y1).toBeGreaterThan(s.y0);
    }
  });
});
