/**
 * Hiker screen state as a reducer plus a pure view-model selector, so the
 * replay engine (Step B2) and live mode (Step B5) only dispatch actions.
 * Visual rules come from the state map in docs/design/handoff.md section 3.
 */
import type { HealthStatus } from "@/components/ui/HealthDot";
import type { MicButtonState } from "@/components/ui/MicButton";
import type { SignCardProps } from "@/components/ui/SignCard";
import type { ClipEvent, SafetyEvent, SpeakEvent } from "@/lib/schema";

/** Handoff: the severity fill lasts 8 s, then falls back to stale. */
export const CLEAR_TIMEOUT_S = 8;
/** A SpeakEvent belongs to a ClipEvent when it fires up to this long after the clip ends. */
export const SPEAK_MATCH_S = 1.5;
export const LOG_LIMIT = 50;
/** Fall check-in countdown length (handoff and Step B5: 20 seconds). */
export const CHECKIN_SECONDS = 20;
/** How long "Cancelled. Help is not being called." stays up (frame S2). */
export const CANCELLED_DISPLAY_MS = 3000;

export const READY_TEXT = "Ready. Tap the mic to talk.";
export const TRAIL_CLEAR_TEXT = "Trail clear";
export const OFFLINE_TEXT = "Working offline, pre-recorded warnings only.";
export const CHECKIN_TEXT = "Are you okay? Say anything to cancel.";
export const CHECKIN_FOOTER_TEXT = "Tap anywhere or speak to cancel";
export const CANCELLED_TEXT = "Cancelled. Help is not being called.";
export const SOS_TEXT = "Calling for help now.";

export type HikerMode = "idle" | "replay" | "live";
export type AgentState = "off" | "listening" | "speaking";
export type Health = "ok" | "down" | "unknown";

export type CheckinState = "none" | "counting" | "cancelled" | "sos_sent";

export type LogEntry = { speak: SpeakEvent; event?: ClipEvent };

export type HikerState = {
  mode: HikerMode;
  lastSpeak?: SpeakEvent;
  lastEvent?: ClipEvent;
  log: LogEntry[];
  agent: AgentState;
  transcript?: string;
  health: Health;
  lowVision: boolean;
  logOpen: boolean;
  analysing: boolean;
  checkin: CheckinState;
  countdownSeconds: number;
  /** Wall-clock ms when the SOS went out, for "Help contacted at <time>". */
  sosSentAt?: number;
};

export type HikerAction =
  | { type: "speak_fired"; speak: SpeakEvent; event?: ClipEvent }
  | { type: "clip_event_received"; event: ClipEvent }
  | { type: "agent_changed"; agent: AgentState }
  | { type: "transcript_updated"; text?: string }
  | { type: "health_changed"; health: Health }
  | { type: "low_vision_toggled"; on: boolean }
  | { type: "mode_changed"; mode: HikerMode }
  | { type: "log_toggled"; open?: boolean }
  | { type: "analysing_changed"; analysing: boolean }
  | { type: "video_loaded" }
  | { type: "reset" }
  // Fall check-in and SOS. Time-dependent actions carry the wall clock so the reducer stays pure.
  | { type: "checkin_started"; seconds?: number }
  | { type: "checkin_tick"; at: number }
  | { type: "checkin_cancelled" }
  | { type: "checkin_cleared" }
  | { type: "sos_sent"; at: number }
  | { type: "sos_cancelled" };

export const initialHikerState: HikerState = {
  mode: "idle",
  log: [],
  agent: "off",
  health: "unknown",
  lowVision: false,
  logOpen: false,
  analysing: false,
  checkin: "none",
  countdownSeconds: CHECKIN_SECONDS,
};

function matchingEvent(speak: SpeakEvent, event: ClipEvent | undefined): ClipEvent | undefined {
  if (!event) return undefined;
  return speak.t >= event.t_start && speak.t <= event.t_end + SPEAK_MATCH_S ? event : undefined;
}

export function hikerReducer(state: HikerState, action: HikerAction): HikerState {
  switch (action.type) {
    case "speak_fired": {
      const event = action.event ?? matchingEvent(action.speak, state.lastEvent);
      const entry: LogEntry = event ? { speak: action.speak, event } : { speak: action.speak };
      return {
        ...state,
        lastSpeak: action.speak,
        log: [...state.log, entry].slice(-LOG_LIMIT),
      };
    }
    case "clip_event_received":
      return { ...state, lastEvent: action.event };
    case "agent_changed":
      return action.agent === "off"
        ? { ...state, agent: "off", transcript: undefined }
        : { ...state, agent: action.agent };
    case "transcript_updated":
      return { ...state, transcript: action.text?.trim() ? action.text : undefined };
    case "health_changed":
      return { ...state, health: action.health };
    case "low_vision_toggled":
      return { ...state, lowVision: action.on };
    case "mode_changed":
      return { ...state, mode: action.mode, analysing: action.mode === "live" ? state.analysing : false };
    case "log_toggled":
      return { ...state, logOpen: action.open ?? !state.logOpen };
    case "analysing_changed":
      return { ...state, analysing: action.analysing };
    case "video_loaded":
      // A new hike: clear the previous run's events but keep health and toggles.
      return {
        ...state,
        mode: "replay",
        lastSpeak: undefined,
        lastEvent: undefined,
        log: [],
        transcript: undefined,
        analysing: false,
      };
    case "reset":
      return { ...initialHikerState, health: state.health };
    case "checkin_started":
      // A check-in never interrupts an SOS that already went out.
      if (state.checkin === "sos_sent") return state;
      return { ...state, checkin: "counting", countdownSeconds: action.seconds ?? CHECKIN_SECONDS };
    case "checkin_tick": {
      if (state.checkin !== "counting") return state;
      const left = Math.max(0, state.countdownSeconds - 1);
      return left === 0
        ? { ...state, checkin: "sos_sent", countdownSeconds: 0, sosSentAt: action.at }
        : { ...state, countdownSeconds: left };
    }
    case "checkin_cancelled":
      return state.checkin === "counting" ? { ...state, checkin: "cancelled" } : state;
    case "checkin_cleared":
      return state.checkin === "cancelled" ? { ...state, checkin: "none", countdownSeconds: CHECKIN_SECONDS } : state;
    case "sos_sent":
      return { ...state, checkin: "sos_sent", countdownSeconds: 0, sosSentAt: action.at };
    case "sos_cancelled": {
      if (state.checkin !== "sos_sent") return state;
      const { sosSentAt: _cleared, ...rest } = state;
      return { ...rest, checkin: "none", countdownSeconds: CHECKIN_SECONDS };
    }
  }
}

/**
 * Maps the safety events in docs/shared-context.md onto reducer actions so
 * Step B5 can dispatch them directly. `wallClockMs` stamps sos_sent, because
 * the event's `t` is session time, not a time of day. Other event types do
 * not change these screens and map to null.
 */
export function safetyEventToAction(event: SafetyEvent, wallClockMs: number): HikerAction | null {
  switch (event.type) {
    case "fall_checkin_started":
      return { type: "checkin_started", seconds: event.timeout_s };
    case "fall_cancelled":
      return { type: "checkin_cancelled" };
    case "sos_sent":
      return { type: "sos_sent", at: wallClockMs };
    case "fall_suspected":
    case "off_trail":
      return null;
  }
}

/** "2:14 pm", the format the S3 frame uses. */
export function formatClockTime(ms: number): string {
  return new Date(ms)
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .replace("AM", "am")
    .replace("PM", "pm");
}

// ---------------------------------------------------------------- selector

export type HikerTone = "clear" | "sev1" | "sev2" | "sev3" | "fork";

/** How a clear tone is drawn (frames 1, 2, 10 and the replay start). */
export type ClearStyle = "ready" | "stale" | "live" | "plain";

export type SignView = Omit<SignCardProps, "ariaLabel">;

export type HikerView = {
  tone: HikerTone;
  statusText: string;
  sign?: SignView;
  isStop: boolean;
  /** Only meaningful when tone is "clear". */
  clearStyle: ClearStyle;
  /** The green "Trail clear" line under a stale warning (frame 2). */
  showClearLine: boolean;
  /** Log entries still inside the 8 s severity window. */
  newCount: number;
  healthDot: HealthStatus;
  healthLabel: string;
  offline: boolean;
  mic: MicButtonState;
  transcript?: { speaker: "hiker" | "agent"; text: string };
  /** Frame 8: the agent's reply needs room, so the hero drops to 40px. */
  heroNeedsRoom: boolean;
};

const healthDot: Record<Health, HealthStatus> = { ok: "ok", down: "fail", unknown: "off" };
const healthLabel: Record<Health, string> = {
  ok: "Backend connected",
  down: "Backend offline",
  unknown: "Checking backend",
};

function isFresh(speak: SpeakEvent, now: number): boolean {
  return now - speak.t < CLEAR_TIMEOUT_S;
}

/** Handoff: priority 3 is never auto-dismissed while the hazard is still detected. */
function stopStillDetected(state: HikerState): boolean {
  return (
    state.lastSpeak?.priority === 3 &&
    (state.lastEvent?.hazards.some((hazard) => hazard.severity === 3) ?? false)
  );
}

function parseDistanceKm(lines: string[]): number | undefined {
  for (const line of lines) {
    const km = line.match(/(\d+(?:\.\d+)?)\s*km\b/i);
    if (km?.[1]) return Number(km[1]);
    const metres = line.match(/(\d+(?:\.\d+)?)\s*m\b/i);
    if (metres?.[1]) return Number(metres[1]) / 1000;
  }
  return undefined;
}

/**
 * Sign card data, only for a directional sign on the latest ClipEvent.
 * SignCard draws left, right and ahead; a sign pointing back has no card.
 */
export function signView(event: ClipEvent | undefined): SignView | undefined {
  const sign = event?.sign;
  if (!sign || sign.kind !== "directional") return undefined;
  const arrow = sign.arrows[0];
  const direction = arrow ? arrow.direction : "ahead";
  if (direction === "back") return undefined;
  const label = arrow?.label ?? sign.lines[0];
  if (!label) return undefined;
  const distanceKm = parseDistanceKm(sign.lines);
  return {
    label,
    direction,
    ...(distanceKm === undefined ? {} : { distanceKm }),
    spoken: sign.say,
  };
}

export function selectHikerView(state: HikerState, now: number): HikerView {
  const speak = state.lastSpeak;
  const active = speak !== undefined && (isFresh(speak, now) || stopStillDetected(state));

  let tone: HikerTone = "clear";
  if (active && speak) {
    if (speak.earcon === "fork") tone = "fork";
    else tone = speak.priority === 3 ? "sev3" : speak.priority === 2 ? "sev2" : "sev1";
  }

  let clearStyle: ClearStyle = "plain";
  let statusText: string;
  if (tone !== "clear" && speak) {
    statusText = speak.say;
  } else if (state.mode === "live" && state.agent === "off") {
    clearStyle = "live";
    statusText = TRAIL_CLEAR_TEXT;
  } else if (speak) {
    clearStyle = "stale";
    statusText = speak.say;
  } else if (state.mode === "idle") {
    clearStyle = "ready";
    statusText = READY_TEXT;
  } else {
    statusText = TRAIL_CLEAR_TEXT;
  }

  const offline = state.health === "down";
  const transcript =
    state.agent !== "off" && state.transcript
      ? { speaker: state.agent === "listening" ? ("hiker" as const) : ("agent" as const), text: state.transcript }
      : undefined;

  const sign = signView(state.lastEvent);
  return {
    tone,
    statusText,
    ...(sign ? { sign } : {}),
    isStop: tone === "sev3",
    clearStyle,
    showClearLine: tone === "clear" && clearStyle === "stale" && state.agent === "off" && !offline,
    newCount: state.log.filter((entry) => isFresh(entry.speak, now)).length,
    healthDot: healthDot[state.health],
    healthLabel: healthLabel[state.health],
    offline,
    mic: offline ? "unavailable" : state.agent === "off" ? "idle" : state.agent,
    ...(transcript ? { transcript } : {}),
    heroNeedsRoom: state.agent === "speaking" && transcript !== undefined,
  };
}
