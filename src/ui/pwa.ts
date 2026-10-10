import { registerSW } from 'virtual:pwa-register';

import { t } from '../strings';
import type { App } from './app';
import type { ToastHandle } from './toast';
import { showToast } from './toast';

/**
 * Registers the service worker (production builds only). A new version waits for the user:
 * the "reload" toast is never shown during a review, and is put away if one starts.
 */
export function setupServiceWorker(app: App): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  let updateReady = false;
  let toast: ToastHandle | null = null;

  const update = registerSW({
    onNeedRefresh() {
      updateReady = true;
      show();
    },
    onRegisterError(error: unknown) {
      console.error('Service worker registration failed', error);
    },
  });

  function show(): void {
    if (!updateReady || toast || app.reviewing) return;
    toast = showToast(t.pwa.updateReady, {
      duration: 0,
      action: { label: t.pwa.reload, onClick: () => void update(true) },
    });
  }

  app.onReviewChange((reviewing) => {
    if (reviewing) {
      toast?.dismiss();
      toast = null;
    } else {
      show();
    }
  });
}

/** iPhone and iPad Safari (iPadOS reports itself as a Mac with touch). */
export function isIosSafari(): boolean {
  const { userAgent, maxTouchPoints } = navigator;
  const ios = /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}
