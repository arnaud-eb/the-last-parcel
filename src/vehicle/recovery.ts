/**
 * Decides when the van is stuck and should be put back on the road.
 * Pure logic, no Rapier: fed the van's state each physics step.
 */
export const RECOVERY = {
  /** World-up component of the van's up axis below which it counts as tipped (~60°). */
  tiltUpY: 0.5,
  /** Seconds tipped (and nearly stopped) before an automatic reset. */
  tiltSeconds: 1.5,
  /** Seconds with no wheel on the ground (and nearly stopped) before an automatic reset. */
  strandedSeconds: 3,
  /** Below this speed (m/s) the van counts as stopped. */
  slowSpeed: 2,
};

export type RecoveryInput = { upY: number; speed: number; wheelsOnGround: number };

export class RecoveryWatch {
  private tilted = 0;
  private stranded = 0;

  /** Returns true when the van should be reset now. */
  update(dt: number, s: RecoveryInput): boolean {
    const slow = Math.abs(s.speed) < RECOVERY.slowSpeed;
    this.tilted = s.upY < RECOVERY.tiltUpY && slow ? this.tilted + dt : 0;
    this.stranded = s.wheelsOnGround === 0 && slow ? this.stranded + dt : 0;
    if (this.tilted >= RECOVERY.tiltSeconds || this.stranded >= RECOVERY.strandedSeconds) {
      this.reset();
      return true;
    }
    return false;
  }

  reset(): void {
    this.tilted = 0;
    this.stranded = 0;
  }
}
