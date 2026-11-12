import { describe, expect, it } from 'vitest';
import { ShiftClock, formatClock, SHIFT_REAL_SECONDS } from '../../src/core/clock';

describe('clock', () => {
  it('a shift lasts 5 real minutes', () => {
    expect(SHIFT_REAL_SECONDS).toBe(300);
  });

  it('1 game minute = 2.5 s', () => {
    const c = new ShiftClock();
    c.advance(2.5);
    expect(c.minutes).toBeCloseTo(1);
    expect(c.format()).toBe('4:01pm');
  });

  it('formats the shift edges', () => {
    expect(formatClock(0)).toBe('4:00pm');
    expect(formatClock(59.9)).toBe('4:59pm');
    expect(formatClock(60)).toBe('5:00pm');
    expect(formatClock(120)).toBe('6:00pm');
  });

  it('clamps at 6pm and reports over', () => {
    const c = new ShiftClock();
    c.advance(1000);
    expect(c.isOver).toBe(true);
    expect(c.minutes).toBe(120);
    expect(c.progress).toBe(1);
    expect(c.remainingRealSeconds).toBe(0);
  });

  it('ignores negative dt', () => {
    const c = new ShiftClock();
    c.advance(-5);
    expect(c.elapsed).toBe(0);
  });
});
