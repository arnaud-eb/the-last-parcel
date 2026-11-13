/**
 * Fixed camera positions for milestone screenshot reviews (see CLAUDE.md).
 * Set for the full town in M2; keep them stable from here on so shots stay comparable.
 */
export type CameraPreset = { pos: [number, number, number]; target: [number, number, number] };

export const CAMERA_PRESETS = {
  /** Gameplay view: chase camera behind the van at the depot by the Gare. */
  '1-chase-start': { pos: [3.2, 4.3, 345], target: [2.5, 1.4, 330] },
  /** On Pont Adolphe looking north-east: the cathedral spires over the upper town. */
  '2-bridge-cathedral': { pos: [-2, 2.6, 150], target: [92, 34, 0] },
  /** Pont Adolphe over the Pétrusse valley, from the Constitution viewpoint. */
  '3-pont-adolphe': { pos: [96, 4, 57], target: [0, -14, 114] },
  /** Place d'Armes: the Christmas tree and the square. */
  '4-place-darmes': { pos: [42, 3.2, -80], target: [22, 6, -98] },
  /** Palais Grand-Ducal from the corner of Rue du Curé. */
  '5-palais': { pos: [137, 2.4, -101.3], target: [157, 8, -89] },
  /** From the Corniche down over Grund and Neumünster Abbey. */
  '6-corniche-grund': { pos: [229, 6, -42], target: [305, -30, -8] },
} satisfies Record<string, CameraPreset>;

export type CameraPresetName = keyof typeof CAMERA_PRESETS;
