import { describe, expect, it } from 'vitest';
import { AdaptiveQuality, MIN_SCALE } from '../../src/render/quality';

function feed(q: AdaptiveQuality, ms: number, seconds: number) {
  const changes = [];
  for (let t = 0; t < seconds * 1000; t += ms) {
    const c = q.sample(ms);
    if (c) changes.push(c);
  }
  return changes;
}

describe('adaptive quality', () => {
  it('starts on medium for mobile and high for desktop', () => {
    expect(new AdaptiveQuality('auto', true).tier).toBe('medium');
    expect(new AdaptiveQuality('auto', false).tier).toBe('high');
  });

  it('a fixed tier never changes', () => {
    const q = new AdaptiveQuality('high', false);
    expect(feed(q, 40, 30)).toHaveLength(0);
  });

  it('stays put at 60 fps', () => {
    const q = new AdaptiveQuality('auto', false);
    expect(feed(q, 16.7, 20)).toHaveLength(0);
    expect(q.renderScale).toBe(1);
  });

  it('lowers render scale before dropping a tier', () => {
    const q = new AdaptiveQuality('auto', false);
    const changes = feed(q, 25, 60);
    expect(changes[0]).toEqual({ tier: 'high', renderScale: 0.9 });
    const firstTierDrop = changes.findIndex((c) => c.tier !== 'high');
    expect(changes[firstTierDrop - 1]!.renderScale).toBe(MIN_SCALE);
    expect(q.tier).toBe('fast');
  });

  it('recovers render scale when there is headroom, but keeps the tier', () => {
    const q = new AdaptiveQuality('auto', false);
    feed(q, 25, 8);
    expect(q.renderScale).toBeLessThan(1);
    feed(q, 8, 60);
    expect(q.renderScale).toBe(1);
    expect(q.tier).toBe('high');
  });
});
