import { useEffect, useRef } from 'preact/hooks';
import type { App } from '../app';
import { PLAZAS, RIVER, ROADS, VALLEY_Y } from '../world/town';
import { PARCEL_COLOR } from '../core/parcels';

/** Metres from the van to the edge of the map. */
const RANGE = 150;

/**
 * Heading-up map round the van: streets, the parcels left, the target.
 * Drawn straight to a canvas on every HUD update, no re-render.
 */
export function Minimap({ app }: { app: App }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    return app.onHud(() => draw(app, canvas, ctx));
  }, [app]);

  return <canvas ref={ref} class="minimap" data-testid="minimap" />;
}

function draw(app: App, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
  const css = canvas.clientWidth;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const px = Math.round(css * dpr);
  if (!px) return;
  // Check both: a canvas starts at 300×150, so at 2× density the width already "matches".
  if (canvas.width !== px || canvas.height !== px) {
    canvas.width = px;
    canvas.height = px;
  }
  const R = px / 2;
  const s = R / RANGE;
  const v = app.van.body.translation();
  const h = app.van.heading;
  const fx = Math.sin(h);
  const fz = Math.cos(h);
  // World (x, z) → screen with the van's forward pointing up.
  const toScreen = (x: number, z: number): [number, number] => {
    const dx = x - v.x;
    const dz = z - v.z;
    return [R + (-dx * fz + dz * fx) * s, R - (dx * fx + dz * fz) * s];
  };

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, px, px);
  ctx.save();
  ctx.beginPath();
  ctx.arc(R, R, R - 1, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(10, 17, 38, 0.66)';
  ctx.fill();
  ctx.clip();

  // Draw the town in world units under one transform.
  ctx.setTransform(-fz * s, -fx * s, fx * s, -fz * s, R + (v.x * fz - v.z * fx) * s, R + (v.x * fx + v.z * fz) * s);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(80, 140, 200, 0.5)';
  ctx.lineWidth = RIVER.halfWidth * 2;
  ctx.beginPath();
  ctx.moveTo(RIVER.x, -300);
  ctx.lineTo(RIVER.x, 300);
  ctx.stroke();
  const lower = v.y < VALLEY_Y / 2;
  for (const p of PLAZAS) {
    ctx.fillStyle = 'rgba(255, 244, 226, 0.42)';
    ctx.fillRect(p.x - p.hx, p.z - p.hz, p.hx * 2, p.hz * 2);
  }
  for (const r of ROADS) {
    // Streets at the van's own level are brighter (Grund lies under the Corniche).
    const low = r.points.every((q) => q[1] < VALLEY_Y / 2);
    const mixed = !low && r.points.some((q) => q[1] < -1);
    ctx.strokeStyle = mixed ? 'rgba(255, 244, 226, 0.4)' : low === lower ? 'rgba(255, 244, 226, 0.62)' : 'rgba(255, 244, 226, 0.22)';
    ctx.lineWidth = r.halfWidth * 2;
    ctx.beginPath();
    r.points.forEach(([x, , z], i) => (i ? ctx.lineTo(x, z) : ctx.moveTo(x, z)));
    ctx.stroke();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // Parcels: dots; off-map ones pinned to the rim. The target is larger and ringed.
  const target = app.game.targetId;
  const inner = R - 6 * dpr;
  for (const p of app.game.remaining) {
    let [x, y] = toScreen(p.stop.zone.x, p.stop.zone.z);
    const d = Math.hypot(x - R, y - R);
    const isTarget = p.id === target;
    if (d > inner) {
      if (!isTarget) continue;
      x = R + ((x - R) / d) * inner;
      y = R + ((y - R) / d) * inner;
    }
    ctx.beginPath();
    ctx.arc(x, y, (isTarget ? 4.5 : 3) * dpr, 0, Math.PI * 2);
    ctx.fillStyle = PARCEL_COLOR[p.type];
    ctx.fill();
    if (isTarget) {
      ctx.lineWidth = 2 * dpr;
      ctx.strokeStyle = '#ffb547';
      ctx.beginPath();
      ctx.arc(x, y, 8 * dpr, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // The van, pointing up.
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(R, R - 7 * dpr);
  ctx.lineTo(R + 5 * dpr, R + 5 * dpr);
  ctx.lineTo(R, R + 2.5 * dpr);
  ctx.lineTo(R - 5 * dpr, R + 5 * dpr);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = 'rgba(255, 220, 170, 0.3)';
  ctx.lineWidth = 1.5 * dpr;
  ctx.beginPath();
  ctx.arc(R, R, R - 1, 0, Math.PI * 2);
  ctx.stroke();
}
