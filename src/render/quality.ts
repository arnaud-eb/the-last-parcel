/** Quality tiers and the adaptive controller. Pure logic: no three.js. */
export type Tier = 'high' | 'medium' | 'fast';
export type QualitySetting = Tier | 'auto';

export type TierSettings = {
  /** Cap on devicePixelRatio before render scale is applied. */
  maxPixelRatio: number;
  snowCount: number;
  bloom: boolean;
  grain: boolean;
  /** Real shadow-casting headlight. */
  shadows: boolean;
  /** Analytic lamp lights evaluated per fragment on facades/ground. */
  lampLights: number;
  /** Scenery chunks beyond this distance (m) are hidden; the fog has swallowed them anyway. */
  cullDistance: number;
};

export const TIERS: Record<Tier, TierSettings> = {
  high: { maxPixelRatio: 2, snowCount: 40000, bloom: true, grain: true, shadows: false, lampLights: 16, cullDistance: 300 },
  medium: { maxPixelRatio: 1.5, snowCount: 20000, bloom: true, grain: true, shadows: false, lampLights: 10, cullDistance: 240 },
  fast: { maxPixelRatio: 1, snowCount: 8000, bloom: false, grain: false, shadows: false, lampLights: 6, cullDistance: 170 },
};

const ORDER: Tier[] = ['high', 'medium', 'fast'];

export const BUDGET_MS = 1000 / 60;
const SLOW_MS = BUDGET_MS * 1.12; // ~18.7 ms: we're dropping frames
const FAST_MS = BUDGET_MS * 0.8; // headroom to raise the scale again
const WINDOW_S = 1;
export const MIN_SCALE = 0.6;
const SCALE_STEP = 0.1;

export type QualityChange = { tier: Tier; renderScale: number };

/**
 * Measures frame time continuously. When frames are slow, it lowers the render
 * scale first, then drops a tier. It slowly raises the scale back when there's
 * headroom, but never raises the tier on its own (avoids oscillation).
 */
export class AdaptiveQuality {
  tier: Tier;
  renderScale = 1;
  readonly auto: boolean;
  private acc = 0;
  private frames = 0;
  private slowWindows = 0;
  private fastWindows = 0;
  private warmup: number;

  constructor(setting: QualitySetting, isMobile: boolean, warmupSeconds = 2) {
    this.auto = setting === 'auto';
    this.tier = setting === 'auto' ? (isMobile ? 'medium' : 'high') : setting;
    this.warmup = warmupSeconds;
  }

  get settings(): TierSettings {
    return TIERS[this.tier];
  }

  /** Feed one frame's duration in ms. Returns a change when quality should move. */
  sample(frameMs: number): QualityChange | null {
    if (!this.auto) return null;
    // Ignore hitches (tab switch, shader compile).
    const ms = Math.min(frameMs, 100);
    if (this.warmup > 0) {
      this.warmup -= ms / 1000;
      return null;
    }
    this.acc += ms;
    this.frames++;
    if (this.acc < WINDOW_S * 1000) return null;
    const avg = this.acc / this.frames;
    this.acc = 0;
    this.frames = 0;

    if (avg > SLOW_MS) {
      this.fastWindows = 0;
      if (++this.slowWindows < 2) return null;
      this.slowWindows = 0;
      if (this.renderScale > MIN_SCALE + 1e-6) {
        this.renderScale = Math.max(MIN_SCALE, round1(this.renderScale - SCALE_STEP));
      } else {
        const i = ORDER.indexOf(this.tier);
        if (i === ORDER.length - 1) return null;
        this.tier = ORDER[i + 1]!;
        this.renderScale = 0.9;
      }
      return { tier: this.tier, renderScale: this.renderScale };
    }

    this.slowWindows = 0;
    if (avg < FAST_MS && this.renderScale < 1) {
      if (++this.fastWindows < 5) return null;
      this.fastWindows = 0;
      this.renderScale = Math.min(1, round1(this.renderScale + SCALE_STEP));
      return { tier: this.tier, renderScale: this.renderScale };
    }
    this.fastWindows = 0;
    return null;
  }
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
