/** Shift clock: 4:00pm → 6:00pm game time, 1 game minute = 2.5 s real time. */
export const SHIFT_START_HOUR = 16;
export const SHIFT_MINUTES = 120;
export const REAL_SECONDS_PER_GAME_MINUTE = 2.5;
export const SHIFT_REAL_SECONDS = SHIFT_MINUTES * REAL_SECONDS_PER_GAME_MINUTE; // 300 s

export class ShiftClock {
  /** Real seconds since the shift started. */
  elapsed = 0;

  advance(dt: number): void {
    if (dt <= 0) return;
    this.elapsed = Math.min(SHIFT_REAL_SECONDS, this.elapsed + dt);
  }

  /** Game minutes since 4:00pm, 0..120. */
  get minutes(): number {
    return this.elapsed / REAL_SECONDS_PER_GAME_MINUTE;
  }

  get isOver(): boolean {
    return this.elapsed >= SHIFT_REAL_SECONDS;
  }

  /** 0 at 4:00pm, 1 at 6:00pm. Drives sky, lights and snowfall. */
  get progress(): number {
    return this.elapsed / SHIFT_REAL_SECONDS;
  }

  get remainingRealSeconds(): number {
    return SHIFT_REAL_SECONDS - this.elapsed;
  }

  format(): string {
    return formatClock(this.minutes);
  }
}

/** Minutes since 4:00pm → "4:07pm". */
export function formatClock(minutes: number): string {
  const total = Math.floor(minutes) + SHIFT_START_HOUR * 60;
  const h24 = Math.floor(total / 60) % 24;
  const m = total % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m.toString().padStart(2, '0')}${h24 < 12 ? 'am' : 'pm'}`;
}
