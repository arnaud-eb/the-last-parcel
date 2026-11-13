import type { App } from '../app';
import { PARCEL_LABEL, parcelValue, type ParcelType } from '../core/parcels';

export const TYPE_ICON: Record<ParcelType, string> = {
  standard: '📦',
  express: '⚡',
  fragile: '🥂',
  heavy: '🪨',
  grandma: '👵',
};

/** Minimap and tray colour per parcel type. */
export const TYPE_COLOR: Record<ParcelType, string> = {
  standard: '#ffd28a',
  express: '#7fd3ff',
  fragile: '#f2a3ff',
  heavy: '#c9b49a',
  grandma: '#ff7a6b',
};

/** Stop picker: the parcels still in the van, nearest first. Tap one to make it the target. */
export function ParcelTray({ app, onPick }: { app: App; onPick: () => void }) {
  const g = app.game;
  const v = app.van.body.translation();
  const left = g.remaining
    .map((p) => ({ p, d: Math.hypot(p.stop.zone.x - v.x, p.stop.zone.z - v.z) }))
    .sort((a, b) => a.d - b.d);
  return (
    <div class="panel tray" data-testid="tray">
      {left.map(({ p, d }) => (
        <button
          key={p.id}
          class={`tray-item${p.id === g.targetId ? ' on' : ''}`}
          data-testid={`pick-${p.id}`}
          style={{ '--type': TYPE_COLOR[p.type] }}
          onClick={() => {
            app.select(p.id);
            onPick();
          }}
        >
          <span class="icon">{TYPE_ICON[p.type]}</span>
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
