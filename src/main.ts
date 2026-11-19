import { App } from './app';
import { mountUi } from './ui/Ui';
import { installTouchGuards, watchResume } from './ui/device';
import { dailySeed } from './net/dailySeed';
import type { QualitySetting } from './render/quality';

const params = new URLSearchParams(location.search);
const test = params.has('test');
const isMobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
const q = params.get('quality');
const quality: QualitySetting = q === 'high' || q === 'medium' || q === 'fast' ? q : 'auto';

async function boot(): Promise<void> {
  const canvas = document.getElementById('world') as HTMLCanvasElement;
  const app = await App.create(canvas, {
    test,
    live: params.has('live'),
    forceWebGL: params.has('webgl'),
    quality,
    seed: params.get('seed') ?? dailySeed(),
    isMobile,
  });
  mountUi(document.getElementById('ui')!, app, { debug: params.has('debug') });
  installTouchGuards();
  watchResume(app);
  if (test) {
    const { installTestHook } = await import('./test-hook');
    installTestHook(app);
  }
}

boot().catch((err) => {
  console.error(err);
  document.getElementById('ui')!.innerHTML =
    '<div class="overlay"><div class="panel card"><h2>Couldn’t start the engine</h2><p>This browser can’t run WebGPU or WebGL2.</p></div></div>';
});
