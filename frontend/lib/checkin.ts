/**
 * Fall check-in and SOS as a pure reducer, ported from
 * legacy-web/lib-ui/state.ts and extended with the SOS request lifecycle.
 * Screens follow docs/design/handoff.md frames S1 to S3. Side effects (timers,
 * network, location, haptics) live in hooks/useCheckin.ts and only
 * dispatch these actions, so scripts/check-checkin.ts can test every path.
 */
import type { SafetyEvent } from "@/lib/schema";

/** Countdown length. The handoff and Step B5 say 20 seconds; shortened to 10 on 2026-10-18. */
export const CHECKIN_SECONDS = 10;
/** How long "Cancelled. Help is not being called." stays up (frame S2). */
export const CANCELLED_DISPLAY_MS = 3000;
/** Gap between failed SOS attempts. */
export const SOS_RETRY_MS = 10_000;
/** Gap between failed Cancel SOS attempts. */
export const CANCEL_SOS_RETRY_MS = 10_000;
/** How long "SOS cancelled" stays in the banner before it clears. */
export const SOS_CANCELLED_DISPLAY_MS = 3000;

export const CHECKIN_TEXT = "Are you okay? Say anything to cancel.";
export const CHECKIN_FOOTER_TEXT = "Tap anywhere or speak to cancel";
export const CHECKIN_SPOKEN_PROMPT = "Are you okay? Tap anywhere on the screen to cancel.";
export const CANCELLED_TEXT = "Cancelled. Help is not being called.";
export const SOS_TEXT = "Calling for help now.";
export const SOS_FAILED_TEXT = "Still trying to reach help.";
export const CANCEL_SOS_LABEL = "Cancel SOS";
export const CANCEL_SOS_FAILED_TEXT = "Could not cancel. Trying again.";
export const SOS_CANCELLED_TEXT = "SOS cancelled";
export const SOS_CANCELLED_ALREADY_CALLED_TEXT = "SOS cancelled. Your contact was already called.";
export const CALL_CONTACT_LABEL = "Call emergency contact";

export type CheckinPhase = "none" | "counting" | "cancelled" | "sos_sent";
export type SosStatus = "sending" | "sent" | "failed";
export type CancelSosStatus = "idle" | "cancelling" | "failed" | "done";
/** What opened the check-in. Fall detection always uses the real backend. */
export type CheckinTrigger = "fall" | "dev";
export type SosMode = "real" | "fake";

export type CheckinState = {
  phase: CheckinPhase;
  countdownSeconds: number;
  totalSeconds: number;
  trigger: CheckinTrigger | null;
  sosMode: SosMode;
  sosStatus: SosStatus | null;
  /** Last send error. Kept while a retry is in flight so the failed screen stays up. */
  sosError: string | null;
  /** Wall-clock ms when the backend confirmed the call, for "Help contacted at <time>". */
  sosSentAt: number | null;
  /** Bumps each time a send starts. The send effect runs once per value, and stale results are dropped. */
  sosAttempt: number;
  cancelSosStatus: CancelSosStatus;
  /** Last Cancel SOS error. Kept while a retry is in flight. */
  cancelSosError: string | null;
  cancelSosAttempt: number;
  /** From /api/sos/cancel: false means the call had already been placed. */
  cancelSosRecalled: boolean | null;
};

export type CheckinAction =
  | { type: "start"; trigger: CheckinTrigger; sosMode: SosMode; seconds?: number }
  | { type: "tick" }
  | { type: "cancel" }
  | { type: "cancelledCleared" }
  | { type: "sosSending" }
  | { type: "sosSent"; at: number; attempt?: number }
  | { type: "sosFailed"; error: string; attempt: number }
  | { type: "cancelSos" }
  | { type: "cancelSosFailed"; error: string; attempt: number }
  | { type: "cancelSosConfirmed"; recalled: boolean; attempt: number }
  | { type: "cancelSosCleared" };

export const initialCheckinState: CheckinState = {
  phase: "none",
  countdownSeconds: CHECKIN_SECONDS,
  totalSeconds: CHECKIN_SECONDS,
  trigger: null,
  sosMode: "real",
  sosStatus: null,
  sosError: null,
  sosSentAt: null,
  sosAttempt: 0,
  cancelSosStatus: "idle",
  cancelSosError: null,
  cancelSosAttempt: 0,
  cancelSosRecalled: null,
};

/** Back to no check-in. Attempt counters survive so late results from an old attempt never match. */
function reset(state: CheckinState): CheckinState {
  return { ...initialCheckinState, sosAttempt: state.sosAttempt, cancelSosAttempt: state.cancelSosAttempt };
}

function markSent(state: CheckinState, at: number): CheckinState {
  return {
    ...state,
    phase: "sos_sent",
    countdownSeconds: 0,
    sosStatus: "sent",
    sosError: null,
    sosSentAt: at,
    cancelSosStatus: "idle",
    cancelSosError: null,
    cancelSosRecalled: null,
  };
}

export function checkinReducer(state: CheckinState, action: CheckinAction): CheckinState {
  switch (action.type) {
    case "start": {
      // A check-in never interrupts an SOS, and a second trigger does not restart a running countdown.
      if (state.phase === "sos_sent" || state.phase === "counting") return state;
      const seconds = action.seconds !== undefined && action.seconds > 0 ? action.seconds : CHECKIN_SECONDS;
      return {
        ...reset(state),
        phase: "counting",
        countdownSeconds: seconds,
        totalSeconds: seconds,
        trigger: action.trigger,
        sosMode: action.sosMode,
      };
    }
    case "tick": {
      if (state.phase !== "counting") return state;
      const left = Math.max(0, state.countdownSeconds - 1);
      if (left > 0) return { ...state, countdownSeconds: left };
      return {
        ...state,
        phase: "sos_sent",
        countdownSeconds: 0,
        sosStatus: "sending",
        sosError: null,
        sosAttempt: state.sosAttempt + 1,
      };
    }
    case "cancel":
      if (state.phase === "counting") return { ...state, phase: "cancelled" };
      // While the call is still being placed or retried, the hiker can stop it.
      // Once it went out, only Cancel SOS (cancelSos) clears it.
      if (state.phase === "sos_sent" && state.sosStatus !== "sent") {
        return { ...state, phase: "cancelled", sosStatus: null, sosError: null };
      }
      return state;
    case "cancelledCleared":
      return state.phase === "cancelled" ? reset(state) : state;
    case "sosSending":
      if (state.phase !== "sos_sent" || state.sosStatus !== "failed") return state;
      return { ...state, sosStatus: "sending", sosAttempt: state.sosAttempt + 1 };
    case "sosSent": {
      if (state.phase === "sos_sent" && state.sosStatus === "sent") return state;
      if (action.attempt === undefined) return markSent(state, action.at); // from a sos_sent safety event
      // A late success for the current attempt still counts, even after the
      // hiker cancelled: the call really went out, so the banner must show it.
      return action.attempt === state.sosAttempt ? markSent(state, action.at) : state;
    }
    case "sosFailed":
      if (state.phase !== "sos_sent" || state.sosStatus !== "sending" || action.attempt !== state.sosAttempt) {
        return state;
      }
      return { ...state, sosStatus: "failed", sosError: action.error };
    case "cancelSos":
      if (state.phase !== "sos_sent" || state.sosStatus !== "sent") return state;
      if (state.cancelSosStatus !== "idle" && state.cancelSosStatus !== "failed") return state;
      return { ...state, cancelSosStatus: "cancelling", cancelSosAttempt: state.cancelSosAttempt + 1 };
    case "cancelSosFailed":
      if (state.cancelSosStatus !== "cancelling" || action.attempt !== state.cancelSosAttempt) return state;
      return { ...state, cancelSosStatus: "failed", cancelSosError: action.error };
    case "cancelSosConfirmed":
      if (state.cancelSosStatus !== "cancelling" || action.attempt !== state.cancelSosAttempt) return state;
      return { ...state, cancelSosStatus: "done", cancelSosError: null, cancelSosRecalled: action.recalled };
    case "cancelSosCleared":
      return state.phase === "sos_sent" && state.cancelSosStatus === "done" ? reset(state) : state;
  }
}

/**
 * Maps the safety events in docs/shared-context.md onto actions. `wallClockMs`
 * stamps sos_sent, because the event's `t` is session time, not a time of day.
 * Check-ins that arrive as events came from fall detection, so they are real.
 */
export function safetyEventToAction(event: SafetyEvent, wallClockMs: number): CheckinAction | null {
  switch (event.type) {
    case "fall_checkin_started":
      return { type: "start", trigger: "fall", sosMode: "real", seconds: event.timeout_s };
    case "fall_cancelled":
      return { type: "cancel" };
    case "sos_sent":
      return { type: "sosSent", at: wallClockMs };
    case "fall_suspected":
    case "off_trail":
      return null;
  }
}

export type CheckinScreen =
  | "none"
  | "counting"
  | "cancelled"
  | "sos_sending"
  | "sos_failed"
  | "sos_banner";

/** Which screen to draw. A retry after a failure keeps the failed screen up. */
export function checkinScreen(state: CheckinState): CheckinScreen {
  switch (state.phase) {
    case "none":
      return "none";
    case "counting":
      return "counting";
    case "cancelled":
      return "cancelled";
    case "sos_sent":
      if (state.sosStatus === "sent") return "sos_banner";
      return state.sosStatus === "failed" || state.sosError !== null ? "sos_failed" : "sos_sending";
  }
}

/** "2:14 pm", the format frame S3 uses. */
export function formatClockTime(ms: number): string {
  return new Date(ms)
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .replace("AM", "am")
    .replace("PM", "pm");
}

export function sosBannerText(state: CheckinState): string {
  if (state.cancelSosStatus === "done") {
    return state.cancelSosRecalled === false ? SOS_CANCELLED_ALREADY_CALLED_TEXT : SOS_CANCELLED_TEXT;
  }
  return state.sosSentAt === null ? "Help contacted" : `Help contacted at ${formatClockTime(state.sosSentAt)}`;
}

/** Screen readers hear the count at the start and every 5 seconds, not every tick. */
export function spokenSeconds(seconds: number, total: number): number {
  if (seconds >= total) return total;
  return Math.ceil(seconds / 5) * 5;
}

/**
 * The sentence to announce for the current state, or null when nothing new
 * should be said. The hook announces it whenever it changes.
 */
export function checkinAnnouncement(state: CheckinState): string | null {
  switch (checkinScreen(state)) {
    case "none":
      return null;
    case "counting":
      return CHECKIN_SPOKEN_PROMPT;
    case "cancelled":
      return CANCELLED_TEXT;
    case "sos_sending":
      return SOS_TEXT;
    case "sos_failed":
      return `${SOS_TEXT} ${SOS_FAILED_TEXT}`;
    case "sos_banner":
      if (state.cancelSosStatus === "done") return sosBannerText(state);
      if (state.cancelSosError !== null) return CANCEL_SOS_FAILED_TEXT;
      return `${sosBannerText(state)}.`;
  }
}
