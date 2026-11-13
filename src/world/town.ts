/**
 * The hand-authored town (SPEC §3). Pure data, no three.js.
 *
 * Axes: +x east, +z south, +y up, metres. The upper town plateau is y = 0,
 * the valley floors (Pétrusse, Alzette/Grund) are y = VALLEY_Y. Distances are
 * compressed from the real city but the order of streets and landmarks along
 * the route is real.
 */

export const VALLEY_Y = -34;

export type District = 'old' | 'belle' | 'grund';

export type Road = {
  name: string;
  /** Centreline points [x, y, z]. y is the road surface height. */
  points: [number, number, number][];
  halfWidth: number;
  district: District;
  /** Which sides get buildings: 'both', 'left', 'right' (relative to point order), or 'none'. */
  frontage: 'both' | 'left' | 'right' | 'none';
  /** String lights across the street (narrow old-town streets). */
  strings?: boolean;
  /** Bridge: the terrain below is not flattened; deck and parapets are built instead. */
  bridge?: boolean;
  /** Parapet along this side (cliff edges). */
  parapet?: 'left' | 'right';
  /** Spacing of street lamps; 0 = none. */
  lampEvery?: number;
};

export type Plaza = {
  name: string;
  /** Centre and half extents (axis-aligned), at height y. */
  x: number;
  z: number;
  hx: number;
  hz: number;
  y: number;
  district: District;
  /** Edges with no buildings (views, landmarks). */
  open?: ('n' | 's' | 'e' | 'w')[];
};

export const ROADS: Road[] = [
  // The spine, in driving order from the depot.
  { name: 'Avenue de la Liberté', points: [[0, 0, 346], [0, 0, 172]], halfWidth: 5, district: 'belle', frontage: 'both', lampEvery: 18 },
  { name: 'Pont Adolphe', points: [[0, 0, 172], [0, 0, 54]], halfWidth: 4.5, district: 'belle', frontage: 'none', bridge: true, lampEvery: 20 },
  { name: 'Boulevard Roosevelt', points: [[0, 0, 54], [28, 0, 44], [78, 0, 40]], halfWidth: 4.2, district: 'belle', frontage: 'left', parapet: 'right', lampEvery: 16 },
  { name: 'Rue Chimay', points: [[54, 0, 38], [50, 0, -12], [40, 0, -78]], halfWidth: 3.3, district: 'old', frontage: 'both', strings: true, lampEvery: 14 },
  { name: 'Rue du Fossé', points: [[51, 0, -30], [68, 0, -40]], halfWidth: 3.0, district: 'old', frontage: 'both', strings: true, lampEvery: 14 },
  { name: 'Rue Notre-Dame', points: [[116, 0, -27], [118, 0, 29]], halfWidth: 3.2, district: 'old', frontage: 'left', lampEvery: 14 },
  { name: 'Rue du Curé', points: [[48, 0, -92], [92, 0, -96], [130, 0, -98]], halfWidth: 3.2, district: 'old', frontage: 'both', strings: true, lampEvery: 14 },
  { name: 'Rue du Marché-aux-Herbes', points: [[124, 0, -61], [130, 0, -98]], halfWidth: 3.1, district: 'old', frontage: 'left', strings: true, lampEvery: 14 },
  { name: 'Rue de la Boucherie', points: [[130, 0, -98], [170, 0, -101], [206, 0, -104]], halfWidth: 3.1, district: 'old', frontage: 'both', strings: true, lampEvery: 14 },
  { name: 'Chemin de la Corniche', points: [[212, 0, -100], [228, 0, -62], [231, 0, -22]], halfWidth: 3.4, district: 'old', frontage: 'right', parapet: 'left', lampEvery: 16 },
  // Switchbacks down the Alzette cliff to Grund.
  {
    name: 'Montée du Grund',
    // Hairpins are rounded to ~7 m radius: the van's turning circle is ~8 m across.
    points: [
      [231, 0, -22], [241, -8, 36],
      [244, -8.6, 44], [250, -9.4, 47.5], [255, -10.2, 44], [256, -11, 38],
      [256, -20, -12],
      [258, -20.6, -20], [263, -21.4, -24], [268, -22.2, -20], [270, -23, -12],
      [273, VALLEY_Y, 38],
    ],
    halfWidth: 3.4, district: 'grund', frontage: 'none', lampEvery: 18,
  },
  { name: 'Rue Münster', points: [[273, VALLEY_Y, 38], [298, VALLEY_Y, 6], [304, VALLEY_Y, -52]], halfWidth: 3.1, district: 'grund', frontage: 'both', strings: true, lampEvery: 14 },
  { name: 'Bisserweg', points: [[304, VALLEY_Y, -52], [331, VALLEY_Y, -40], [331, VALLEY_Y, 44], [273, VALLEY_Y, 40]], halfWidth: 3.0, district: 'grund', frontage: 'none', lampEvery: 16 },
  // The western loop back to the bridge.
  { name: 'Grand-Rue', points: [[2, 0, -96], [-40, 0, -98], [-84, 0, -100]], halfWidth: 3.6, district: 'old', frontage: 'both', strings: true, lampEvery: 14 },
  { name: 'Boulevard Royal', points: [[-84, 0, -100], [-90, 0, -40], [-60, 0, 30], [0, 0, 54]], halfWidth: 4.6, district: 'belle', frontage: 'both', lampEvery: 18 },
];

export const PLAZAS: Plaza[] = [
  { name: 'Place de la Gare', x: 0, z: 360, hx: 34, hz: 14, y: 0, district: 'belle', open: ['n'] },
  { name: 'Place de la Constitution', x: 108, z: 44, hx: 26, hz: 14, y: 0, district: 'belle', open: ['s', 'w'] },
  { name: 'Place Guillaume II', x: 95, z: -44, hx: 27, hz: 17, y: 0, district: 'old' },
  { name: "Place d'Armes", x: 25, z: -95, hx: 23, hz: 16, y: 0, district: 'old' },
  { name: 'Bock', x: 222, z: -104, hx: 12, hz: 9, y: 0, district: 'old', open: ['e', 'n'] },
];

/** Valleys carved into the plateau. */
export const VALLEYS = {
  /** Pétrusse: east-west band under Pont Adolphe. Rims at zNorth / zSouth, cliffs `cliff` wide. */
  petrusse: { zNorth: 60, zSouth: 166, xWest: -220, xEast: 300, cliff: 16 },
  /** Alzette (Grund): west rim at xRim, cliff `cliff` wide down to the floor. */
  alzette: { xRim: 236, cliff: 34, xEastRim: 420, zNorth: -260, zSouth: 260 },
};

export type LandmarkId =
  | 'cathedral' | 'palais' | 'hotelDeVille' | 'gare' | 'gelleFra' | 'ferrisWheel' | 'neumunster' | 'tree';

export type Landmark = {
  id: LandmarkId;
  x: number;
  y: number;
  z: number;
  /** Rotation about Y; local -Z faces the front (street / square). */
  rot: number;
  /** Footprint half extents (local X, Z) used to keep generated buildings away. */
  hx: number;
  hz: number;
};

export const LANDMARKS: Landmark[] = [
  // Station at the south end of Avenue de la Liberté, facing north up the avenue.
  { id: 'gare', x: 0, y: 0, z: 384, rot: 0, hx: 30, hz: 10 },
  // Cathedral beside Place de la Constitution, nave running north-south.
  { id: 'cathedral', x: 92, y: 0, z: 1, rot: Math.PI, hx: 12, hz: 26 },
  { id: 'gelleFra', x: 112, y: 0, z: 50, rot: 0, hx: 2.5, hz: 2.5 },
  { id: 'ferrisWheel', x: 128, y: 0, z: 40, rot: Math.PI / 2, hx: 3, hz: 9 },
  // City hall on the north side of Place Guillaume II, facing the square (south).
  { id: 'hotelDeVille', x: 95, y: 0, z: -69, rot: Math.PI, hx: 19, hz: 8 },
  // Palais on the right of Rue du Curé at the corner of Rue du Marché-aux-Herbes, front onto Rue de la Boucherie.
  { id: 'palais', x: 152, y: 0, z: -86, rot: 0, hx: 18, hz: 8 },
  { id: 'tree', x: 25, y: 0, z: -95, rot: 0, hx: 4.5, hz: 4.5 },
  // Neumünster Abbey down in Grund, between Rue Münster and the river path, facing west.
  { id: 'neumunster', x: 319, y: VALLEY_Y, z: -6, rot: Math.PI / 2, hx: 21, hz: 5.5 },
];

/** River Alzette through Grund. */
export const RIVER = { x: 347, halfWidth: 7, y: VALLEY_Y - 1.2 };

/** Van start at the depot by the Gare, facing north up Avenue de la Liberté. */
export const START = { x: 2.5, z: 338, heading: Math.PI };
