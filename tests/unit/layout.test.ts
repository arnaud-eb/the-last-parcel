import { beforeAll, describe, expect, it } from 'vitest';
import { buildLayout, obbOverlap, obbPoints, type Building } from '../../src/world/layout';
import { onRoad, SIDEWALK } from '../../src/world/roads';
import { terrainHeight } from '../../src/world/terrain';
import { loadRapier, type Rapier } from '../../src/vehicle/rapier';
import { buildColliders } from '../../src/world/colliders';

const layout = buildLayout();
const obb = (b: Building) => ({ x: b.x, z: b.z, rot: b.rot, hx: b.width / 2, hz: b.depth / 2 });

describe('town layout', () => {
  it('has a real town: hundreds of buildings and plenty of delivery addresses', () => {
    expect(layout.buildings.length).toBeGreaterThan(200);
    expect(layout.stops.length).toBeGreaterThan(60);
  });

  it('the main streets of the route have addresses', () => {
    const streets = new Set(layout.stops.map((s) => s.address.replace(/^\d+ /, '')));
    const key = ['Avenue de la Liberté', 'Boulevard Roosevelt', 'Rue Chimay', 'Rue du Curé', 'Rue de la Boucherie', 'Chemin de la Corniche', 'Rue Münster', 'Grand-Rue', 'Boulevard Royal', "Place d'Armes", 'Place Guillaume II'];
    for (const name of key) expect(streets, name).toContain(name);
  });

  it('no generated building sits on a street', () => {
    for (const b of layout.buildings.filter((b) => b.street !== null || b.relief === false)) {
      for (const [x, z] of obbPoints(obb(b), 0.3)) expect(onRoad(x, z, SIDEWALK - 0.4), `${b.street} @ ${b.x.toFixed(0)},${b.z.toFixed(0)}`).toBe(false);
    }
  });

  it('generated buildings barely overlap each other', () => {
    const gen = layout.buildings.filter((b) => b.street !== null);
    let bad = 0;
    for (let i = 0; i < gen.length; i++) {
      for (let j = i + 1; j < gen.length; j++) {
        const a = { ...obb(gen[i]!), hx: gen[i]!.width / 2 - 0.5, hz: gen[i]!.depth / 2 - 0.5 };
        if (obbOverlap(a, { ...obb(gen[j]!), hx: gen[j]!.width / 2 - 0.5, hz: gen[j]!.depth / 2 - 0.5 })) bad++;
      }
    }
    expect(bad).toBe(0);
  });

  it('delivery zones are on drivable ground at road height', () => {
    for (const s of layout.stops) {
      expect(onRoad(s.zone.x, s.zone.z, 1.2) || Math.abs(terrainHeight(s.zone.x, s.zone.z)) < 0.5, s.address).toBe(true);
    }
  });
});

describe('physics heightfield', () => {
  let R: Rapier;
  beforeAll(async () => {
    R = await loadRapier();
  });

  it('matches the terrain function (rows along Z, columns along X)', () => {
    const world = new R.World({ x: 0, y: -9.81, z: 0 });
    buildColliders(R, world, layout);
    world.step(); // scene queries update on step
    // Plateau, valley floor, halfway down the switchbacks. Off-grid points: rays exactly through a
    // heightfield vertex can miss in Rapier.
    for (const [x, z] of [[36.37, -90.61], [300.37, 0.61], [253.37, 20.61], [-30.37, 260.61]] as const) {
      const onlyGround = (c: { shapeType(): number }) => c.shapeType() === R.ShapeType.HeightField;
      const hit = world.castRay(new R.Ray({ x, y: 100, z }, { x: 0, y: -1, z: 0 }), 300, true, undefined, undefined, undefined, undefined, onlyGround);
      expect(hit, `${x},${z}`).not.toBeNull();
      expect(100 - hit!.timeOfImpact).toBeCloseTo(terrainHeight(x, z), 0);
    }
  });
});
