/**
 * Bridge to native Android AdMob (via window.Android JS interface).
 * No-op on regular web browsers.
 */

declare global {
  interface Window {
    Android?: {
      isNativeApp: () => boolean;
      showInterstitial: () => void;
      showTopBanner: () => void;
      hideTopBanner: () => void;
    };
  }
}

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  return window.Android?.isNativeApp?.() ?? false;
}

export function showInterstitial(): void {
  try {
    window.Android?.showInterstitial?.();
  } catch {
    /* no-op on web */
  }
}

export function showTopBanner(): void {
  try {
    window.Android?.showTopBanner?.();
  } catch {
    /* no-op on web */
  }
}

export function hideTopBanner(): void {
  try {
    window.Android?.hideTopBanner?.();
  } catch {
    /* no-op on web */
  }
}
