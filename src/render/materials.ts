/**
 * Procedural TSL materials. All surfaces are generated in shaders: no textures.
 *
 * Lamp light is analytic: the nearest street lamps (sorted on the CPU each
 * frame) are evaluated per fragment as warm diffuse + wet specular. That's
 * what gives warm pools on cool snow without dozens of real lights.
 */
import * as THREE from 'three/webgpu';
import {
  Fn,
  Loop,
  abs,
  attribute,
  cameraPosition,
  clamp,
  dot,
  exp,
  float,
  floor,
  fract,
  fwidth,
  hash,
  inverseSqrt,
  length,
  max,
  mix,
  mx_noise_float,
  normalWorld,
  normalize,
  positionWorld,
  pow,
  select,
  smoothstep,
  step,
  uniform,
  uniformArray,
  uv,
  vec2,
  vec3,
  vertexColor,
} from 'three/tsl';

type N = any; // TSL node; three's TSL typings are too loose to be worth fighting here.

export const MAX_LAMPS = 16;

/** Shared uniforms, updated once per frame by the app. */
export const U = {
  time: uniform(0),
  /** Shift progress 0 (4pm) → 1 (6pm). */
  progress: uniform(0),
  /** 0..1, fraction of windows switched on. Rises during the shift. */
  lightsOn: uniform(0.4),
  lamps: uniformArray(
    Array.from({ length: MAX_LAMPS }, () => new THREE.Vector4()),
    'vec4',
  ),
  lampCount: uniform(0, 'int'),
  /** Colour of the sky at the horizon; also the fog colour. */
  horizon: uniform(new THREE.Color()),
  fogDensity: uniform(0.012),
  headPos: uniform(new THREE.Vector3()),
  headDir: uniform(new THREE.Vector3(0, 0, 1)),
  headOn: uniform(1),
};

export const LAMP_COLOR = vec3(1.0, 0.6, 0.28);
export const SNOW_ALBEDO = vec3(0.74, 0.8, 0.92);

/** Warm diffuse + specular from the nearest lamps. Returns radiance to add as emissive. */
export const lampLight = Fn(([P, Nrm, albedo, specAmount, shininess]: N[]) => {
  const diffuse = float(0).toVar();
  const specular = float(0).toVar();
  const V = normalize(cameraPosition.sub(P));
  Loop(U.lampCount, ({ i }: N) => {
    const l = U.lamps.element(i) as N;
    const L = l.xyz.sub(P);
    const d2 = dot(L, L);
    const Ld = L.mul(inverseSqrt(d2));
    const att = l.w.div(d2.mul(0.5).add(1)).mul(smoothstep(400, 100, d2));
    diffuse.addAssign(max(dot(Nrm, Ld), 0).mul(att));
    const H = normalize(Ld.add(V));
    specular.addAssign(pow(max(dot(Nrm, H), 0), shininess).mul(att));
  });
  return LAMP_COLOR.mul(diffuse.mul(albedo).add(specular.mul(specAmount)));
});

/** Anti-aliased box mask in [x0,x1]×[y0,y1]. */
const rect = (fx: N, fy: N, x0: number, x1: number, y0: number, y1: number): N => {
  const wx = fwidth(fx).max(0.001);
  const wy = fwidth(fy).max(0.001);
  return smoothstep(wx.negate().add(x0), wx.add(x0), fx)
    .mul(smoothstep(wx.add(x1), wx.negate().add(x1), fx))
    .mul(smoothstep(wy.negate().add(y0), wy.add(y0), fy))
    .mul(smoothstep(wy.add(y1), wy.negate().add(y1), fy));
};

/**
 * Plaster facades with a window grid, frames, shutters, snowy sills, doors and
 * shop fronts. Geometry supplies uv in metres (u along the wall, v height) and
 * aWall = (wallWidth, wallHeight, buildingSeed, kind). kind 0 = windows, 1 = plain.
 */
export function facadeMaterial(): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial();
  const aWall = attribute('aWall', 'vec4') as N;
  const W = aWall.x;
  const H = aWall.y;
  const seed = aWall.z;
  const plain = aWall.w;
  const u = (uv() as N).x;
  const v = (uv() as N).y;
  const G = 3.6;
  const FH = 3.0;

  const cols = max(floor(W.div(2.6)), 1);
  const cellW = W.div(cols);
  const cx = floor(u.div(cellW));
  const fx = fract(u.div(cellW));
  const ground = step(v, G); // 1 on the ground floor
  const upper = v.sub(G).div(FH);
  const floorIdx = select(ground.greaterThan(0.5), float(0), floor(upper).add(1));
  const fy = select(ground.greaterThan(0.5), v.div(G), fract(upper));
  // Only floors that fit under the eaves get windows.
  const fits = max(ground, step(floorIdx.mul(FH).add(G), H.add(0.1)));

  const hB = hash(seed.mul(9173.1));
  const isShop = step(hB, 0.55);
  const doorCol = floor(hash(seed.mul(3121.7)).mul(cols));
  const isDoor = ground.mul(step(abs(cx.sub(doorCol)), 0.5));
  const hasShutters = step(hash(seed.mul(611.3)), 0.45);

  // Window rectangles: upper floors, ground-floor shop fronts, ground-floor windows.
  const upWin = rect(fx, fy, 0.3, 0.7, 0.22, 0.8);
  const shopWin = rect(fx, fy, 0.1, 0.9, 0.1, 0.72);
  const gWin = rect(fx, fy, 0.3, 0.7, 0.3, 0.75);
  const door = rect(fx, fy, 0.34, 0.66, 0.0, 0.66);
  const winGround = mix(gWin, shopWin, isShop).mul(float(1).sub(isDoor));
  const win = mix(upWin, winGround, ground).mul(fits).mul(float(1).sub(plain));
  const doorM = door.mul(isDoor).mul(float(1).sub(plain));

  // Frames, shutters, snowy sills.
  const upFrame = rect(fx, fy, 0.27, 0.73, 0.19, 0.83).sub(upWin);
  const frame = mix(upFrame, float(0), ground).mul(fits).mul(float(1).sub(plain));
  const shutters = rect(fx, fy, 0.12, 0.27, 0.22, 0.8)
    .add(rect(fx, fy, 0.73, 0.88, 0.22, 0.8))
    .mul(hasShutters)
    .mul(float(1).sub(ground))
    .mul(fits)
    .mul(float(1).sub(plain));
  const sillUp = rect(fx, fy, 0.25, 0.75, 0.13, 0.19);
  const sillShop = rect(fx, fy, 0.08, 0.92, 0.04, 0.1).mul(isShop).mul(float(1).sub(isDoor));
  const sill = mix(sillUp, sillShop, ground).mul(fits).mul(float(1).sub(plain));

  // Which windows are lit. Shops are almost always lit.
  const wid = cx.add(floorIdx.mul(17.0)).add(seed.mul(1013.0));
  const h1 = hash(wid);
  const h2 = hash(wid.add(57.3));
  const litFrac = mix(mix(0.2, 0.62, U.lightsOn), 0.92, ground.mul(isShop));
  const lit = step(h1, litFrac);
  const warm = mix(vec3(1.0, 0.3, 0.05), vec3(1.0, 0.5, 0.16), h2);
  const tv = step(0.94, h2); // the odd cool TV glow
  const glowCol = mix(warm, vec3(0.45, 0.6, 1.0), tv);
  // Interior falloff: brighter at the top, curtains darken the sides.
  // Interior: a warm lamp hotspot somewhere in the room, darker toward the sill,
  // curtains at the sides (upper floors), glazing bars across the pane.
  const hx = mix(0.38, 0.62, hash(wid.add(11.1)));
  const hot = exp(fx.sub(hx).mul(fx.sub(hx)).add(fy.sub(0.7).mul(fy.sub(0.7))).mul(-28)).mul(0.9);
  const grad = smoothstep(0.1, 0.9, fy).mul(0.45).add(0.4);
  const curtain = smoothstep(0.37, 0.33, fx).add(smoothstep(0.63, 0.67, fx)).mul(float(1).sub(ground)).mul(step(0.35, hash(wid.add(3.3))));
  const barsUp = float(1).sub(smoothstep(0.006, 0.014, abs(fx.sub(0.5)))).max(float(1).sub(smoothstep(0.006, 0.014, abs(fy.sub(0.6)))));
  const barsShop = float(1).sub(smoothstep(0.004, 0.01, abs(fract(fx.sub(0.1).div(0.8).mul(3).add(0.5)).sub(0.5).div(3)))).mul(isShop);
  const bars = mix(barsUp, barsShop, ground).mul(win);
  const interior = grad.add(hot).mul(float(1).sub(curtain.mul(0.55))).mul(float(1).sub(bars));
  const glowStrength = mix(float(2.0), float(2.8), ground.mul(isShop)).mul(h1.mul(0.6).add(0.7));

  // Wall albedo: plaster colour + noise + darker stone plinth + string courses.
  const P = positionWorld;
  const noise = mx_noise_float(P.mul(0.9)).mul(0.07).add(mx_noise_float(P.mul(5.0)).mul(0.03));
  // Plaster reads cool at dusk: slightly desaturated and darker, shadowed under the eaves.
  const vc = vertexColor().rgb;
  const plaster = vc.mul(0.72);
  const eave = smoothstep(H.sub(2.2), H, v).mul(float(1).sub(plain)).mul(0.35);
  const base = plaster.mul(noise.add(0.92)).mul(float(1).sub(eave));
  const plinth = step(v, 0.55);
  const dLine = abs(v.sub(G).sub(floor(v.sub(G).div(FH).add(0.5)).mul(FH)));
  const aa = fwidth(v).max(0.001);
  const course = float(1).sub(smoothstep(aa.negate().add(0.09), aa.add(0.09), dLine)).mul(step(G - 0.1, v)).mul(float(1).sub(plain));
  let wall = mix(base, base.mul(0.55).add(vec3(0.02, 0.025, 0.03)), plinth);
  wall = wall.mul(float(1).sub(course.mul(0.18)));
  // Snow dusting at the foot of walls.
  wall = mix(wall, SNOW_ALBEDO, smoothstep(0.25, 0.0, v).mul(0.8));

  const shutterCol = select(
    hash(seed.mul(77.7)).lessThan(0.33),
    vec3(0.18, 0.3, 0.2),
    select(hash(seed.mul(77.7)).lessThan(0.66), vec3(0.16, 0.24, 0.38), vec3(0.4, 0.14, 0.12)),
  );
  const glass = vec3(0.02, 0.03, 0.05);
  let albedo = wall;
  albedo = mix(albedo, vec3(0.86, 0.84, 0.8), frame);
  albedo = mix(albedo, shutterCol, shutters);
  albedo = mix(albedo, SNOW_ALBEDO.mul(1.05), sill);
  albedo = mix(albedo, glass, win);
  albedo = mix(albedo, vec3(0.82, 0.8, 0.76), bars);
  albedo = mix(albedo, vec3(0.16, 0.09, 0.05), doorM);

  // Doors get a warm fanlight; unlit glass reflects a little sky.
  const fan = doorM.mul(smoothstep(0.52, 0.6, fy)).mul(lit.max(isShop));
  const glow = glowCol.mul(win.mul(lit).mul(interior).mul(glowStrength))
    .add(vec3(1.0, 0.55, 0.2).mul(fan.mul(2.0)))
    .add(U.horizon.mul(win.mul(float(1).sub(lit)).mul(0.08)));

  m.colorNode = albedo;
  m.roughnessNode = mix(float(0.92), float(0.35), win);
  m.metalnessNode = float(0);
  m.emissiveNode = glow.add(lampLight(P, normalWorld, albedo, win.mul(1.5).add(0.04), float(24)));
  return m;
}

/**
 * Snowy roofs over a vertex-coloured base (slate, fascia, copper).
 * aRoof: 0 = slope (uv.y = metres up from the eave, snow thins at the eave),
 * 1 = bare (no snow), 2 = full snow cap.
 */
export function roofMaterial(): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial();
  const kind = attribute('aRoof', 'float') as N;
  const P = positionWorld;
  const up = (uv() as N).y;
  const n = mx_noise_float(P.mul(vec3(0.6, 0.6, 0.6))).mul(0.5).add(0.5);
  const fine = mx_noise_float(P.mul(4.0)).mul(0.5).add(0.5);
  // Snow thins out at the eaves where dark slate shows through.
  const snowAmt = smoothstep(0.15, 0.9, up.add(n.mul(0.9)).sub(0.2)).mul(step(kind, 0.5)).add(step(1.5, kind));
  const base = vertexColor().rgb.mul(fine.mul(0.4).add(0.8));
  const snow = SNOW_ALBEDO.mul(fine.mul(0.08).add(0.95));
  const albedo = mix(base, snow, snowAmt);
  m.colorNode = albedo;
  m.roughnessNode = mix(float(0.5), float(0.85), snowAmt);
  m.emissiveNode = lampLight(P, normalWorld, albedo, float(0.05), float(8));
  return m;
}

/** Snow on the ground, sidewalks, banks and tree tips. */
export function snowMaterial(): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial();
  const P = positionWorld;
  const n = mx_noise_float(P.xz.mul(0.35)).mul(0.5).add(0.5);
  const fine = mx_noise_float(P.xz.mul(3.0)).mul(0.5).add(0.5);
  const albedo = SNOW_ALBEDO.mul(n.mul(0.1).add(fine.mul(0.06)).add(0.86)).mul(vertexColor().rgb);
  // Glints: tiny sparkles that catch the light.
  const cell = floor(P.mul(28.0));
  const glint = step(0.9985, hash(cell.x.add(cell.y.mul(131.0)).add(cell.z.mul(7919.0))));
  m.colorNode = albedo;
  m.roughnessNode = float(0.82);
  m.emissiveNode = lampLight(P, normalWorld, albedo, float(0.08), float(10))
    .add(vec3(0.7, 0.8, 1.0).mul(glint.mul(0.6)));
  return m;
}

/**
 * Wet cobblestones with slushy snow toward the curbs.
 * uv: x = lateral metres from the centreline, y = metres along the street.
 */
export function cobbleMaterial(roadHalf: number): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial();
  const lat = (uv() as N).x;
  const along = (uv() as N).y;
  const P = positionWorld;

  const row = floor(along.div(0.22));
  const p = vec2(lat.div(0.3).add(fract(row.mul(0.5))), along.div(0.22));
  const cell = floor(p);
  const f = fract(p).sub(0.5);
  const d = length(max(abs(f).sub(vec2(0.3, 0.26)), 0.0));
  // Fade the pattern out where stones get smaller than a few pixels (avoids moiré).
  const px = fwidth(p).length();
  const stone = mix(float(1).sub(smoothstep(0.1, 0.2, d)), float(0.75), smoothstep(0.05, 0.22, px));
  const hs = hash(cell.x.add(cell.y.mul(311.7)));
  const stoneCol = mix(vec3(0.075, 0.08, 0.095), vec3(0.15, 0.13, 0.12), hs);

  // Snow: piled near the curbs, packed between the tyre lanes, broken by noise.
  const n = mx_noise_float(P.xz.mul(0.45)).mul(0.5).add(0.5);
  const n2 = mx_noise_float(P.xz.mul(2.2)).mul(0.5).add(0.5);
  const edge = smoothstep(roadHalf - 1.6, roadHalf - 0.2, abs(lat));
  const middle = smoothstep(0.9, 0.0, abs(lat)).mul(0.6);
  const snowAmt = clamp(edge.add(middle).add(n.sub(0.55).mul(0.9)).add(float(1).sub(stone).mul(0.25)), 0, 1).mul(n2.mul(0.35).add(0.75));
  const slush = mix(vec3(0.3, 0.33, 0.4), SNOW_ALBEDO, smoothstep(0.4, 0.9, snowAmt));
  const albedo = mix(mix(vec3(0.04, 0.045, 0.055), stoneCol, stone), slush, smoothstep(0.2, 0.6, snowAmt));
  const wet = float(1).sub(smoothstep(0.3, 0.7, snowAmt)).mul(stone.mul(0.6).add(0.4));

  // Domed stones: perturbed normal breaks lamp reflections into glints.
  const bump = f.mul(stone).mul(0.9);
  const Nw = normalize(vec3(bump.x, 1.0, bump.y));
  const V = normalize(cameraPosition.sub(P));
  const fres = pow(float(1).sub(max(dot(Nw, V), 0)), 4.0);

  m.colorNode = albedo;
  m.roughnessNode = mix(float(0.85), float(0.22), wet);
  m.emissiveNode = lampLight(P, Nw, albedo, wet.mul(2.2).add(0.05), float(70))
    .add(U.horizon.mul(fres.mul(wet).mul(0.5)));
  return m;
}

/** Height fog: thicker low down, density rises toward 6pm. */
export const fogFactor = Fn(() => {
  const d = length(positionWorld.sub(cameraPosition));
  const heightAtten = exp(positionWorld.y.max(0).mul(-0.035)).mul(0.6).add(0.4);
  return float(1).sub(exp(d.mul(U.fogDensity).mul(heightAtten).negate())).min(0.97);
});

/** Plain vertex-coloured lit material for props (lamp posts, van trim, tree). */
export function propMaterial(roughness = 0.6, metalness = 0): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness, metalness });
  const albedo = vertexColor().rgb;
  m.colorNode = albedo;
  m.emissiveNode = lampLight(positionWorld, normalWorld, albedo, float(0.4), float(30));
  return m;
}

/** Unlit glowing material (lantern glass, bulbs, headlights). Values > 1 bloom. */
export function glowMaterial(color: THREE.Color, intensity: number): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial();
  m.colorNode = vec3(color.r, color.g, color.b).mul(intensity);
  return m;
}
