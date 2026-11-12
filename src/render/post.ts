import * as THREE from 'three/webgpu';
import {
  Fn, dot, float, length, mix, pass, rand, renderOutput, screenUV, smoothstep, vec3, vec4,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { U } from './materials';
import type { TierSettings } from './quality';

type N = any;

/**
 * Bloom (HDR) → AgX tone mapping → colour grade (cool shadows, warm highlights)
 * → vignette → film grain.
 */
export function createPost(
  renderer: THREE.WebGPURenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  settings: TierSettings,
): THREE.RenderPipeline {
  const pipeline = new THREE.RenderPipeline(renderer);
  pipeline.outputColorTransform = false;
  const scenePass = pass(scene, camera);
  const color = scenePass.getTextureNode('output') as N;
  pipeline.outputNode = buildOutput(color, settings);
  return pipeline;
}

function buildOutput(color: N, s: TierSettings): N {
  return Fn(() => {
    let hdr = color;
    if (s.bloom) hdr = hdr.add(bloom(color, 0.55, 0.45, 0.82));
    const ldr = renderOutput(hdr) as N;
    let c = ldr.rgb;
    const lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
    // Split tone: lift shadows toward blue, push highlights toward amber.
    c = c.add(vec3(-0.004, 0.004, 0.022).mul(float(1).sub(lum).mul(smoothstep(0.0, 0.25, lum).add(0.3))));
    c = c.mul(mix(vec3(1, 1, 1), vec3(1.05, 1.0, 0.92), smoothstep(0.35, 0.9, lum)));
    // Slight saturation boost.
    c = mix(vec3(lum), c, 1.12);
    // Vignette.
    const d = length((screenUV as N).sub(0.5).mul(vec3(1.25, 1.0, 0).xy));
    c = c.mul(mix(0.62, 1.0, smoothstep(0.85, 0.3, d)));
    if (s.grain) {
      const g = rand((screenUV as N).add((U.time as N).fract().mul(13.1))).sub(0.5);
      c = c.add(g.mul(0.03));
    }
    return vec4(c, 1);
  })();
}

export function rebuildPost(pipeline: THREE.RenderPipeline, scene: THREE.Scene, camera: THREE.Camera, settings: TierSettings): void {
  const scenePass = pass(scene, camera);
  pipeline.outputNode = buildOutput(scenePass.getTextureNode('output'), settings);
  pipeline.needsUpdate = true;
}
