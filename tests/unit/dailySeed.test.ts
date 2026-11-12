import { describe, expect, it } from 'vitest';
import { dailySeed } from '../../src/net/dailySeed';

describe('daily seed', () => {
  it('uses the Luxembourg calendar date', () => {
    // 23:30 UTC on Dec 22 is already Dec 23 in Luxembourg (UTC+1).
    expect(dailySeed(new Date('2026-12-22T23:30:00Z'))).toBe('2026-12-23');
    expect(dailySeed(new Date('2026-12-22T22:30:00Z'))).toBe('2026-12-22');
  });
});
