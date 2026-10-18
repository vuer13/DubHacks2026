"use client";

import { useEffect, useMemo, useReducer, useState } from "react";

import { HikerScreen } from "@/components/hiker/HikerScreen";
import { checkBackendHealth } from "@/lib/api";
import { getSessionId } from "@/lib/session";
import { selectLowVisionView } from "@/lib/ui/lowvision";
import { CHECKIN_SECONDS, hikerReducer, initialHikerState, selectHikerView } from "@/lib/ui/state";
import { useCheckinClock } from "@/lib/ui/useCheckinClock";
import { useWakeLock } from "@/lib/wakelock";

const HEALTH_POLL_MS = 5000;

// Later app-and-voice steps wire these; for now they render and do nothing.
function notWiredYet() {}

const IS_DEV = process.env.NODE_ENV !== "production";

export default function HomePage() {
  const [state, dispatch] = useReducer(hikerReducer, initialHikerState);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [video, setVideo] = useState<{ url: string; name: string } | undefined>(undefined);
  // Hike time used for the 8 s clear timeout: video time in replay, seconds since start in live.
  const [now, setNow] = useState(0);

  // Session id on page load, kept in sessionStorage (Step B3).
  useEffect(() => setSessionId(getSessionId()), []);

  // Poll GET /health every 5 seconds through lib/api.ts.
  useEffect(() => {
    let active = true;
    const poll = async () => {
      const online = await checkBackendHealth();
      if (active) dispatch({ type: "health_changed", health: online ? "ok" : "down" });
    };
    void poll();
    const timer = window.setInterval(() => void poll(), HEALTH_POLL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  // Live mode has no video clock, so count seconds from when it started.
  useEffect(() => {
    if (state.mode !== "live") return;
    const started = performance.now();
    setNow(0);
    const timer = window.setInterval(() => setNow((performance.now() - started) / 1000), 1000);
    return () => window.clearInterval(timer);
  }, [state.mode]);

  useEffect(
    () => () => {
      if (video) URL.revokeObjectURL(video.url);
    },
    [video],
  );

  // Countdown ticks and the 3 s cancelled message. Step B5 will start check-ins from fall detection.
  useCheckinClock(state.checkin, dispatch);
  // Keep the screen awake while a hike is running or low-vision mode is on.
  useWakeLock(state.mode !== "idle" || state.lowVision);

  const view = useMemo(() => selectHikerView(state, now), [state, now]);
  const lowVision = useMemo(() => selectLowVisionView(state, now), [state, now]);

  return (
    <HikerScreen
      state={state}
      view={view}
      lowVision={lowVision}
      {...(sessionId ? { sessionId } : {})}
      {...(video ? { videoUrl: video.url, videoName: video.name } : {})}
      handlers={{
        onUseDemo: notWiredYet,
        onVideoSelected: (file) => {
          if (video) URL.revokeObjectURL(video.url);
          setVideo({ url: URL.createObjectURL(file), name: file.name });
          setNow(0);
          dispatch({ type: "video_loaded" });
        },
        onTimeUpdate: setNow,
        onToggleLog: () => dispatch({ type: "log_toggled" }),
        onMicPress: notWiredYet,
        onLiveChange: (on) => dispatch({ type: "mode_changed", mode: on ? "live" : video ? "replay" : "idle" }),
        onLowVisionChange: (on) => dispatch({ type: "low_vision_toggled", on }),
        onCheckinCancel: () => dispatch({ type: "checkin_cancelled" }),
        onSosCancel: () => {
          if (window.confirm("Cancel the SOS alert?")) dispatch({ type: "sos_cancelled" });
        },
        ...(IS_DEV
          ? { onTestCheckin: () => dispatch({ type: "checkin_started", seconds: CHECKIN_SECONDS }) }
          : {}),
      }}
    />
  );
}
