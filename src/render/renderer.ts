import * as THREE from 'three/webgpu';

export type Backend = 'webgpu' | 'webgl2';

/** WebGPU when available, WebGL2 otherwise (three handles the fallback). `?webgl` forces WebGL2. */
export async function createRenderer(
  canvas: HTMLCanvasElement,
  opts: { forceWebGL: boolean; antialias: boolean },
): Promise<{ renderer: THREE.WebGPURenderer; backend: Backend }> {
  const renderer = new THREE.WebGPURenderer({
    canvas,
    antialias: opts.antialias,
    forceWebGL: opts.forceWebGL,
    powerPreference: 'high-performance',
  });
  await renderer.init();
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const backend: Backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl2';
  return { renderer, backend };
}
