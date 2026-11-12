import type { DriveInput } from '../vehicle/van';

/**
 * Merges keyboard, touch and gamepad into one DriveInput.
 * Touch: left half = steering pad (drag left/right), right side = Gas / Brake buttons (set by the HUD).
 */
export class Input {
  private keys = new Set<string>();
  private keySteer = 0;
  /** Set by the touch UI. */
  touch = { steer: 0, gas: false, brake: false };
  readonly value: DriveInput = { steer: 0, throttle: 0, brake: 0 };
  private readonly onKey = (e: KeyboardEvent, down: boolean) => {
    const k = e.code;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(k)) e.preventDefault();
    if (down) this.keys.add(k);
    else this.keys.delete(k);
  };
  private readonly down = (e: KeyboardEvent) => this.onKey(e, true);
  private readonly up = (e: KeyboardEvent) => this.onKey(e, false);
  private readonly blur = () => this.keys.clear();

  attach(target: Window = window): void {
    target.addEventListener('keydown', this.down);
    target.addEventListener('keyup', this.up);
    target.addEventListener('blur', this.blur);
  }

  detach(target: Window = window): void {
    target.removeEventListener('keydown', this.down);
    target.removeEventListener('keyup', this.up);
    target.removeEventListener('blur', this.blur);
  }

  /** Any input activity this frame (used to start the shift). */
  get active(): boolean {
    return this.value.throttle > 0 || this.value.brake > 0 || this.value.steer !== 0;
  }

  update(dt: number): DriveInput {
    const k = this.keys;
    const left = k.has('KeyA') || k.has('ArrowLeft');
    const right = k.has('KeyD') || k.has('ArrowRight');
    const gas = k.has('KeyW') || k.has('ArrowUp');
    const brake = k.has('KeyS') || k.has('ArrowDown') || k.has('Space');

    // Keyboard steering ramps in and recentres quickly.
    const want = (right ? 1 : 0) - (left ? 1 : 0);
    const rate = (want === 0 ? 6 : 3.5) * dt;
    this.keySteer += Math.max(-rate, Math.min(rate, want - this.keySteer));

    let steer = this.keySteer;
    let throttle = gas ? 1 : 0;
    let brk = brake ? 1 : 0;

    if (this.touch.steer !== 0) steer = this.touch.steer;
    if (this.touch.gas) throttle = 1;
    if (this.touch.brake) brk = 1;

    const pad = navigator.getGamepads?.().find((p) => p && p.connected);
    if (pad) {
      const x = pad.axes[0] ?? 0;
      if (Math.abs(x) > 0.12) steer = x;
      throttle = Math.max(throttle, pad.buttons[7]?.value ?? 0, pad.buttons[0]?.pressed ? 1 : 0);
      brk = Math.max(brk, pad.buttons[6]?.value ?? 0, pad.buttons[1]?.pressed ? 1 : 0);
    }

    this.value.steer = Math.max(-1, Math.min(1, steer));
    this.value.throttle = throttle;
    this.value.brake = brk;
    return this.value;
  }
}
