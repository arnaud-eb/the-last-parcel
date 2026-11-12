import type RAPIER from '@dimforge/rapier3d-compat';

let ready: Promise<typeof RAPIER> | null = null;

/**
 * Load Rapier once, as its own chunk: it is most of the download (WASM inlined
 * by the -compat build), so it streams in parallel with the renderer setup.
 */
export function loadRapier(): Promise<typeof RAPIER> {
  ready ??= import('@dimforge/rapier3d-compat').then(async (m) => {
    const R = (m.default ?? m) as typeof RAPIER;
    await R.init();
    return R;
  });
  return ready;
}

export type Rapier = typeof RAPIER;
