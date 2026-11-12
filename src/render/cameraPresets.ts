/**
 * Fixed camera positions for milestone screenshot reviews. Keep these stable
 * across milestones so shots stay comparable (see CLAUDE.md).
 */
export type CameraPreset = { pos: [number, number, number]; target: [number, number, number]; fov?: number };

export const CAMERA_PRESETS = {
  /** Gameplay view: chase camera behind the van at the depot end. */
  '1-chase-start': { pos: [1.2, 4.4, 91], target: [0.6, 1.4, 70] },
  /** Eye level mid-street, looking toward the square, tree and spires. */
  '2-street-eye': { pos: [-2.5, 1.7, 40], target: [1.5, 4.5, -10] },
  /** High oblique "miniature town" view over the rooftops. */
  '3-aerial': { pos: [34, 38, 64], target: [0, 0, 8] },
  /** In the square, looking at the tree. */
  '4-square-tree': { pos: [9, 3.2, -36], target: [0, 6, -58] },
  /** Close on a facade: windows, lamp, snowbank, wet cobbles. */
  '5-facade-close': { pos: [-1.5, 2.1, 22], target: [5.5, 3.2, 12] },
  /** From the square back up the street toward the depot. */
  '6-street-reverse': { pos: [-2, 6, -46], target: [2, 2, 20] },
} satisfies Record<string, CameraPreset>;

export type CameraPresetName = keyof typeof CAMERA_PRESETS;
