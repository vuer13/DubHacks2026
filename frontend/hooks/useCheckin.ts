import * as Speech from "expo-speech";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { AccessibilityInfo, Platform } from "react-native";

import { cancelSos, sendSos } from "@/lib/api";
import {
  CANCEL_SOS_RETRY_MS,
  CANCELLED_DISPLAY_MS,
  SOS_CANCELLED_DISPLAY_MS,
  SOS_RETRY_MS,
  checkinAnnouncement,
  checkinReducer,
  checkinScreen,
  initialCheckinState,
  safetyEventToAction,
  spokenSeconds,
  type CheckinTrigger,
  type SosMode,
} from "@/lib/checkin";
import { playSosHaptic } from "@/lib/native/haptics";
import { getSosLocation, requestLocationPermission } from "@/lib/native/location";
import type { ClipEvent, SafetyEvent } from "@/lib/schema";
import { createFakeSosClient, SOS_REASON_DEV_TEST, SOS_REASON_FALL, type SosClient } from "@/lib/sosClient";

const realClient: SosClient = { send: sendSos, cancel: cancelSos };
const fakeClient = createFakeSosClient();
const RECENT_EVENTS_FOR_SOS = 3;

function clientFor(mode: SosMode): SosClient {
  return mode === "fake" ? fakeClient : realClient;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

type UseCheckinOptions = {
  sessionId: string;
  /** Newest first; the last few go to the backend with the SOS. */
  getRecentEvents: () => ClipEvent[];
};

/**
 * Runs the fall check-in: the countdown, the SOS request (once per attempt,
 * retried every 10 s on failure), Cancel SOS, haptics and announcements. All
 * state lives in lib/checkin.ts; this hook only performs side effects and
 * dispatches.
 */
export function useCheckin({ sessionId, getRecentEvents }: UseCheckinOptions) {
  const [state, dispatch] = useReducer(checkinReducer, initialCheckinState);
  const recentEventsRef = useRef(getRecentEvents);
  const sentAttemptRef = useRef(0);
  const cancelAttemptRef = useRef(0);
  const hapticSentAtRef = useRef<number | null>(null);
  const screenReaderRef = useRef(false);
  const screen = checkinScreen(state);

  useEffect(() => {
    recentEventsRef.current = getRecentEvents;
  }, [getRecentEvents]);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
      if (mounted) screenReaderRef.current = enabled;
    });
    const subscription = AccessibilityInfo.addEventListener("screenReaderChanged", (enabled) => {
      screenReaderRef.current = enabled;
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  /**
   * iOS VoiceOver hears announceForAccessibility; Android TalkBack hears the
   * assertive live regions in the screens. Without a screen reader, speak it.
   */
  const announce = useCallback((text: string) => {
    if (Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(text);
    if (!screenReaderRef.current) {
      void Speech.stop();
      Speech.speak(text, { rate: 0.95 });
    }
  }, []);

  // Countdown.
  useEffect(() => {
    if (state.phase !== "counting") return;
    const timer = setTimeout(() => dispatch({ type: "tick" }), 1000);
    return () => clearTimeout(timer);
  }, [state.phase, state.countdownSeconds]);

  // Ask for location as soon as a check-in starts, so a fix can be ready by SOS time.
  useEffect(() => {
    if (state.phase !== "counting") return;
    void requestLocationPermission().then((granted) => {
      console.info(`[sos] location permission ${granted ? "granted" : "not granted"}`);
    });
  }, [state.phase]);

  // Frame S2 shows for 3 seconds.
  useEffect(() => {
    if (state.phase !== "cancelled") return;
    const timer = setTimeout(() => dispatch({ type: "cancelledCleared" }), CANCELLED_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [state.phase]);

  // Place the SOS exactly once per attempt. The ref survives re-renders and
  // Strict Mode's double effects; the reducer drops results from old attempts.
  useEffect(() => {
    if (state.phase !== "sos_sent" || state.sosStatus !== "sending") return;
    const attempt = state.sosAttempt;
    if (sentAttemptRef.current >= attempt) return;
    sentAttemptRef.current = attempt;

    const client = clientFor(state.sosMode);
    const reason = state.trigger === "dev" ? SOS_REASON_DEV_TEST : SOS_REASON_FALL;
    console.info(`[sos] attempt ${attempt} (${state.sosMode}, ${state.trigger ?? "unknown"} trigger)`);
    void (async () => {
      try {
        const location = await getSosLocation();
        const response = await client.send({
          session_id: sessionId,
          reason,
          lat: location.lat,
          lng: location.lng,
          recent_events: recentEventsRef.current().slice(0, RECENT_EVENTS_FOR_SOS),
        });
        if (response.sent) {
          console.info(`[sos] attempt ${attempt} sent`);
          dispatch({ type: "sosSent", at: Date.now(), attempt });
        } else {
          console.warn(`[sos] attempt ${attempt}: backend did not place the call`);
          dispatch({ type: "sosFailed", error: "The backend did not place the call.", attempt });
        }
      } catch (error) {
        const message = errorMessage(error, "SOS request failed.");
        console.warn(`[sos] attempt ${attempt} failed: ${message}`);
        dispatch({ type: "sosFailed", error: message, attempt });
      }
    })();
  }, [state.phase, state.sosStatus, state.sosAttempt, state.sosMode, state.trigger, sessionId]);

  // Retry a failed SOS every 10 seconds until it goes out or the hiker cancels.
  useEffect(() => {
    if (state.phase !== "sos_sent" || state.sosStatus !== "failed") return;
    const timer = setTimeout(() => dispatch({ type: "sosSending" }), SOS_RETRY_MS);
    return () => clearTimeout(timer);
  }, [state.phase, state.sosStatus, state.sosAttempt]);

  // Cancel SOS, once per attempt.
  useEffect(() => {
    if (state.cancelSosStatus !== "cancelling") return;
    const attempt = state.cancelSosAttempt;
    if (cancelAttemptRef.current >= attempt) return;
    cancelAttemptRef.current = attempt;

    clientFor(state.sosMode)
      .cancel(sessionId)
      .then(
        (response) => dispatch({ type: "cancelSosConfirmed", recalled: response.cancelled, attempt }),
        (error: unknown) =>
          dispatch({ type: "cancelSosFailed", error: errorMessage(error, "Cancel SOS failed."), attempt }),
      );
  }, [state.cancelSosStatus, state.cancelSosAttempt, state.sosMode, sessionId]);

  useEffect(() => {
    if (state.cancelSosStatus !== "failed") return;
    const timer = setTimeout(() => dispatch({ type: "cancelSos" }), CANCEL_SOS_RETRY_MS);
    return () => clearTimeout(timer);
  }, [state.cancelSosStatus, state.cancelSosAttempt]);

  useEffect(() => {
    if (state.cancelSosStatus !== "done") return;
    const timer = setTimeout(() => dispatch({ type: "cancelSosCleared" }), SOS_CANCELLED_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [state.cancelSosStatus]);

  // Strong haptic once per confirmed SOS.
  useEffect(() => {
    if (state.sosStatus !== "sent" || state.sosSentAt === null) return;
    if (hapticSentAtRef.current === state.sosSentAt) return;
    hapticSentAtRef.current = state.sosSentAt;
    void playSosHaptic();
  }, [state.sosStatus, state.sosSentAt]);

  // Announce every state change.
  const announcement = checkinAnnouncement(state);
  useEffect(() => {
    if (announcement !== null) announce(announcement);
  }, [announcement, announce]);

  // The count, every 5 seconds after the opening prompt (handoff CountdownRing).
  const spoken = state.phase === "counting" ? spokenSeconds(state.countdownSeconds, state.totalSeconds) : null;
  useEffect(() => {
    if (spoken === null || spoken >= state.totalSeconds) return;
    announce(`${spoken} seconds`);
  }, [spoken, state.totalSeconds, announce]);

  const start = useCallback((trigger: CheckinTrigger, sosMode: SosMode) => {
    dispatch({ type: "start", trigger, sosMode });
  }, []);
  const cancel = useCallback(() => dispatch({ type: "cancel" }), []);
  const requestCancelSos = useCallback(() => dispatch({ type: "cancelSos" }), []);
  const applySafetyEvent = useCallback((event: SafetyEvent) => {
    const action = safetyEventToAction(event, Date.now());
    if (action) dispatch(action);
  }, []);

  return {
    state,
    screen,
    /** True from check-in start until the SOS banner clears. */
    keepAwake: state.phase !== "none",
    start,
    cancel,
    cancelSos: requestCancelSos,
    applySafetyEvent,
  };
}
