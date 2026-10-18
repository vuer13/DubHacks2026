"use client";

import { type Dispatch, useEffect } from "react";

import { CANCELLED_DISPLAY_MS, type CheckinState, type HikerAction } from "@/lib/ui/state";

/** Drives the countdown (one tick a second) and clears the cancelled message after 3 s. */
export function useCheckinClock(checkin: CheckinState, dispatch: Dispatch<HikerAction>): void {
  useEffect(() => {
    if (checkin === "counting") {
      const timer = window.setInterval(() => dispatch({ type: "checkin_tick", at: Date.now() }), 1000);
      return () => window.clearInterval(timer);
    }
    if (checkin === "cancelled") {
      const timer = window.setTimeout(() => dispatch({ type: "checkin_cleared" }), CANCELLED_DISPLAY_MS);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [checkin, dispatch]);
}
