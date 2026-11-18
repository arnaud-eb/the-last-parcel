import { PARCEL_COLOR, PARCEL_LABEL, type ParcelType } from '../core/parcels';

/**
 * Drawn parcel-type icons (inline SVG, no emoji), in the type's colour:
 * a parcel, a stopwatch, a cracked bauble, a kg weight, a heart.
 */
const PATHS: Record<ParcelType, preact.JSX.Element> = {
  standard: (
    <>
      <path d="M4 8.5 12 4.5l8 4v8.8l-8 4.2-8-4.2z" />
      <path d="M4 8.5l8 4 8-4M12 12.5v9M8 6.5l8 4" fill="none" />
    </>
  ),
  express: (
    <>
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M10 3h4M12 3v3M18 6.5l1.5-1.5M12 9.5v4l3 2" fill="none" />
    </>
  ),
  fragile: (
    <>
      <path d="M10 3.5h4v2.5h-4z" />
      <circle cx="12" cy="14" r="7.5" />
      <path d="M8.5 8.5l2.5 3.5-2 2.5 3 3-1 3M15.5 9.5 14 12l2 1.5" fill="none" />
    </>
  ),
  heavy: (
    <>
      <path d="M9 7.5a3 3 0 0 1 6 0" fill="none" />
      <path d="M6.5 7.5h11l2.5 13h-16z" />
      <text x="12" y="17.6" text-anchor="middle" font-size="6.5" font-weight="900" stroke="none" fill="#1a1206">kg</text>
    </>
  ),
  grandma: <path d="M12 20.5s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 8a4.2 4.2 0 0 1 7.5 2.5c0 5.4-7.5 10-7.5 10z" />,
};

export function ParcelIcon({ type, size = 22 }: { type: ParcelType; size?: number }) {
  const c = PARCEL_COLOR[type];
  return (
    <svg class="picon" width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={PARCEL_LABEL[type]}
      fill={c} fill-opacity="0.32" stroke={c} stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      {PATHS[type]}
    </svg>
  );
}
