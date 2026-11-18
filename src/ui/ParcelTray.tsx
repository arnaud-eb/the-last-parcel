import type { App } from '../app';
import { PARCEL_COLOR, PARCEL_LABEL, parcelValue } from '../core/parcels';
import { ParcelIcon } from './ParcelIcon';

/**
 * Stop picker: the parcels still in the van, in the suggested route order (numbered).
 * Tap one to make it the target.
 */
export function ParcelTray({ app, onPick }: { app: App; onPick: () => void }) {
  const g = app.game;
  const v = app.van.body.translation();
  const rank = new Map(g.plan.map((id, i) => [id, i]));
  const left = g.remaining
    .map((p) => ({ p, d: Math.hypot(p.stop.zone.x - v.x, p.stop.zone.z - v.z), n: rank.get(p.id) ?? 99 }))
    .sort((a, b) => a.n - b.n);
  return (
    <div class="panel tray" data-testid="tray">
      <p class="tray-head">Suggested order · tap to choose</p>
      {left.map(({ p, d, n }) => (
        <button
          key={p.id}
          class={`tray-item${p.id === g.targetId ? ' on' : ''}`}
          data-testid={`pick-${p.id}`}
          style={{ '--type': PARCEL_COLOR[p.type] }}
          onClick={() => {
            app.select(p.id);
            onPick();
          }}
        >
          <span class="icon"><i class="step">{n + 1}</i><ParcelIcon type={p.type} /></span>
          <span class="addr">
            {p.stop.address}
            <small>{PARCEL_LABEL[p.type]}{p.type === 'fragile' && p.hits ? ' · chipped' : ''}</small>
          </span>
          <span class="val">{parcelValue(p)}</span>
          <span class="dist">{Math.round(d)} m</span>
        </button>
      ))}
    </div>
  );
}
