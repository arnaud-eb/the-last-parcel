import RAPIER from '@dimforge/rapier3d-compat';

let ready: Promise<typeof RAPIER> | null = null;

/** Load the Rapier WASM once. */
export function loadRapier(): Promise<typeof RAPIER> {
  ready ??= RAPIER.init().then(() => RAPIER);
  return ready;
}

export type Rapier = typeof RAPIER;
