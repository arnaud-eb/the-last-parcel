import * as THREE from 'three/webgpu';
import {
  Fn, dot, float, floor, fog, hash, max, mix, normalize, pow, positionWorldDirection, smoothstep, step, vec2, vec3,
} from 'three/tsl';
import { U, fogFactor } from './materials';

type N = any;

// Blue hour (4pm, just after sunset) → full night (6pm).
const HORIZON_START = new THREE.Color(0.11, 0.18, 0.36);
const HORIZON_END = new THREE.Color(0.025, 0.035, 0.075);
const ZENITH_START = vec3(0.02, 0.045, 0.15);
const ZENITH_END = vec3(0.006, 0.01, 0.03);
/** Where the sun went down: low warm glow on that side of the sky. */
const SUNSET_DIR = vec2(0.6, -0.8);

const _c = new THREE.Color();

/** Horizon/fog colour at shift progress p. */
export function horizonColor(p: number): THREE.Color {
  return _c.copy(HORIZON_START).lerp(HORIZON_END, smooth(Math.min(1, p * 1.15)));
}

function smooth(x: number): number {
  return x * x * (3 - 2 * x);
}

export function setupSky(scene: THREE.Scene): { update(progress: number): void } {
  const dir = normalize(positionWorldDirection) as N;
  const p = U.progress as N;

  scene.backgroundNode = Fn(() => {
    const h = dir.y;
    const zenith = mix(ZENITH_START, ZENITH_END, p);
    const sky = mix(U.horizon, zenith, smoothstep(-0.02, 0.55, h)).toVar();
    // Sunset afterglow, fading out over the first half of the shift.
    const toward = max(dot(normalize(dir.xz), SUNSET_DIR), 0);
    const glow = pow(toward, 3).mul(smoothstep(0.45, -0.02, h)).mul(float(1).sub(p.mul(1.8)).max(0));
    sky.addAssign(vec3(0.6, 0.28, 0.16).mul(glow.mul(0.55)));
    // Faint stars appear as it gets dark.
    const cell = floor(dir.mul(260)) as N;
    const star = step(0.9965, hash(cell.x.add(cell.y.mul(157.0)).add(cell.z.mul(113.0))));
    sky.addAssign(vec3(0.7, 0.75, 0.9).mul(star.mul(smoothstep(0.08, 0.4, h)).mul(p.mul(0.8).add(0.2))));
    return sky;
  })();

  scene.fogNode = fog(U.horizon, fogFactor());

  const hemi = new THREE.HemisphereLight(0x4f7bc4, 0x141824, 0.55);
  const moon = new THREE.DirectionalLight(0x9db4ef, 0.35);
  moon.position.set(-30, 60, 20);
  scene.add(hemi, moon);

  return {
    update(progress: number) {
      U.progress.value = progress;
      U.horizon.value.copy(horizonColor(progress));
      // Visibility drops toward 6pm as snowfall rises.
      U.fogDensity.value = 0.005 + progress * 0.008;
      // Ambient light dims as the sky goes dark.
      hemi.intensity = 0.55 - progress * 0.3;
      moon.intensity = 0.35 - progress * 0.18;
      U.lightsOn.value = Math.min(1, 0.35 + progress * 0.9);
    },
  };
}
