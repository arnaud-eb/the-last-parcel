/**
 * Phone and browser plumbing: no accidental zoom, recover the 3D view after the
 * page was in the background, and full screen where the browser allows it.
 */
import type { App } from '../app';

/** iPhone Safari ignores user-scalable=no: block pinch and double-tap zoom ourselves. */
export function installTouchGuards(): void {
  const stop = (e: Event) => e.preventDefault();
  for (const t of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(t, stop, { passive: false });
  document.addEventListener('dblclick', stop, { passive: false });
  // Pinch with two fingers outside our own controls.
  document.addEventListener(
    'touchmove',
    (e) => {
      if ((e as TouchEvent).touches.length > 1 && (e as unknown as { scale?: number }).scale !== 1) e.preventDefault();
    },
    { passive: false },
  );
}

/**
 * Coming back to the tab (or the app) can leave the canvas blank on iOS until
 * something resizes it. Re-apply the size whenever the page becomes visible.
 */
export function watchResume(app: App): void {
  const kick = () => {
    if (document.visibilityState !== 'visible') return;
    // iOS settles the viewport a moment after showing the page.
    for (const ms of [50, 400]) setTimeout(() => app.resize(true), ms);
  };
  document.addEventListener('visibilitychange', kick);
  window.addEventListener('pageshow', kick);
  window.addEventListener('focus', kick);
  window.addEventListener('orientationchange', kick);
}

export const isIOS = (): boolean => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Launched from the home screen (no browser bars at all). */
export const isStandalone = (): boolean =>
  matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

export const canFullscreen = (): boolean => !!document.documentElement.requestFullscreen && document.fullscreenEnabled;

export const isFullscreen = (): boolean => !!document.fullscreenElement;

/** Full screen and landscape lock (Android, desktop). Must run inside a tap or click. */
export async function enterFullscreen(): Promise<void> {
  if (!canFullscreen() || isFullscreen()) return;
  try {
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await o.lock?.('landscape').catch(() => undefined);
  } catch {
    // Refused (no user gesture, or not allowed here): play in the window.
  }
}

export async function toggleFullscreen(): Promise<void> {
  if (isFullscreen()) await document.exitFullscreen().catch(() => undefined);
  else await enterFullscreen();
}
