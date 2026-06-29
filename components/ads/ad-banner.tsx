"use client";

import { useEffect } from "react";

import { hideTopBanner, isNativeApp, showTopBanner } from "@/lib/ads";

/**
 * Triggers the native top banner (AdMob) on Android. Hidden on web.
 * Place at the top of a page to show the banner while that page is visible.
 */
export function AdBanner() {
  useEffect(() => {
    if (isNativeApp()) showTopBanner();
    return () => {
      if (isNativeApp()) hideTopBanner();
    };
  }, []);
  return null;
}
