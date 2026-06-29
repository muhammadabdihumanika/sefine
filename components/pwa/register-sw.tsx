"use client";

import * as React from "react";

/** Registers the service worker in production so the app is installable & offline-capable. */
export function RegisterSW() {
  React.useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      typeof window === "undefined" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // registration failures are non-fatal
      });
    };
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
