"use client";

import { useEffect } from "react";

/**
 * Keeps the screen awake while replay, live or low-vision mode is on, so the
 * phone keeps talking with the screen in a pocket. Re-requests when the page
 * becomes visible again (browsers drop the lock on hide). Does nothing where
 * the Screen Wake Lock API is unsupported.
 */

type WakeLockLike = { release: () => Promise<void>; released: boolean };
type NavigatorLike = { wakeLock?: { request: (type: "screen") => Promise<WakeLockLike> } };
type DocumentLike = {
  visibilityState: string;
  addEventListener: (type: "visibilitychange", listener: () => void) => void;
  removeEventListener: (type: "visibilitychange", listener: () => void) => void;
};

export type WakeLockController = {
  setActive: (active: boolean) => Promise<void>;
  dispose: () => Promise<void>;
  isHeld: () => boolean;
};

export function createWakeLockController(nav: NavigatorLike, doc: DocumentLike): WakeLockController {
  let active = false;
  let sentinel: WakeLockLike | null = null;

  const acquire = async () => {
    if (!nav.wakeLock || !active || doc.visibilityState !== "visible") return;
    if (sentinel && !sentinel.released) return;
    try {
      sentinel = await nav.wakeLock.request("screen");
      // The page may have gone inactive while the request was pending.
      if (!active) await release();
    } catch {
      sentinel = null; // Denied (battery saver, permissions): carry on without it.
    }
  };

  const release = async () => {
    const held = sentinel;
    sentinel = null;
    if (held && !held.released) {
      try {
        await held.release();
      } catch {
        // Already released by the browser.
      }
    }
  };

  const onVisibility = () => {
    if (doc.visibilityState === "visible") void acquire();
  };
  doc.addEventListener("visibilitychange", onVisibility);

  return {
    setActive: async (next) => {
      active = next;
      await (next ? acquire() : release());
    },
    dispose: async () => {
      active = false;
      doc.removeEventListener("visibilitychange", onVisibility);
      await release();
    },
    isHeld: () => sentinel !== null && !sentinel.released,
  };
}

export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    const controller = createWakeLockController(navigator, document);
    void controller.setActive(active);
    return () => void controller.dispose();
  }, [active]);
}
