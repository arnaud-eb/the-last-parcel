import { describe, expect, it } from 'vitest';
import { createRng, hashString } from '../../src/core/rng';

describe('rng', () => {
  it('is deterministic for the same seed', () => {
    const a = createRng('2026-12-23');
    const b = createRng('2026-12-23');
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('differs between seeds', () => {
    expect(createRng('a').next()).not.toBe(createRng('b').next());
  });

  it('stays in range', () => {
    const r = createRng(42);
    for (let i = 0; i < 1000; i++) {
      const f = r.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = r.int(3, 5);
      expect([3, 4, 5]).toContain(n);
    }
  });

  it('hashString is stable', () => {
    expect(hashString('kuerier')).toBe(hashString('kuerier'));
    expect(hashString('')).toBe(0x811c9dc5);
  });
});
