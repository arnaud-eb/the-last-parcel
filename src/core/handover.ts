/** Stop inside a delivery zone and hold ~1 s to hand the parcel over. */
export const HOLD_SECONDS = 1;
/** Van must be slower than this (m/s) to count as stopped. */
export const STOP_SPEED = 1.2;

export type Zone = { x: number; z: number; radius: number };

export function isInZone(zone: Zone, x: number, z: number): boolean {
  const dx = x - zone.x;
  const dz = z - zone.z;
  return dx * dx + dz * dz <= zone.radius * zone.radius;
}

export class Handover {
  /** 0..1 */
  progress = 0;

  /** Returns true on the frame the handover completes. */
  update(dt: number, zone: Zone | null, x: number, z: number, speed: number): boolean {
    const holding = zone !== null && isInZone(zone, x, z) && Math.abs(speed) < STOP_SPEED;
    if (holding) {
      this.progress = Math.min(1, this.progress + dt / HOLD_SECONDS);
      if (this.progress >= 1) {
        this.progress = 0;
        return true;
      }
    } else {
      // Drain quickly so a rolling stop doesn't count.
      this.progress = Math.max(0, this.progress - (dt / HOLD_SECONDS) * 2);
    }
    return false;
  }
}
