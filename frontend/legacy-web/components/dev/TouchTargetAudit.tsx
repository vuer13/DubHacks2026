"use client";

import { useEffect } from "react";

const MIN_TARGET_PX = 64;
const SELECTOR = 'button, [role="button"], [role="switch"], [role="checkbox"], input[type="checkbox"], input[type="radio"]';

/**
 * Development only: warns in the console about any button or toggle that
 * renders smaller than 64px in either dimension (handoff touch minimum).
 * Mounted from app/layout.tsx behind a NODE_ENV check, so production builds
 * never include it.
 */
export function TouchTargetAudit() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const warned = new WeakSet<Element>();
    let frame = 0;

    const audit = () => {
      frame = 0;
      document.querySelectorAll(SELECTOR).forEach((element) => {
        if (warned.has(element)) return;
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;
        if (rect.width < MIN_TARGET_PX || rect.height < MIN_TARGET_PX) {
          warned.add(element);
          const name = element.getAttribute("aria-label") ?? element.textContent?.trim() ?? element.tagName;
          console.warn(
            "[TrailSense] Touch target under " + MIN_TARGET_PX + "px: \"" + name + "\" is " +
              Math.round(rect.width) + " x " + Math.round(rect.height) + "px",
            element,
          );
        }
      });
    };

    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(audit);
    };

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true });
    window.addEventListener("resize", schedule);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
