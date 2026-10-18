/**
 * Hand-written fixtures for the twelve hiker screen frames (D2) in
 * docs/design/handoff.md section 3. Events are built from the examples in
 * docs/shared-context.md (the "Drop-off, left, stop" ClipEvent and
 * SpeakEvent, the Lynn Loop SignReading) plus a few severity 1 and 2 events.
 * Every event is validated with the Zod schemas when this module loads, so an
 * invalid fixture fails at import time.
 */
import { ClipEventSchema, SignReadingSchema, SpeakEventSchema } from "@/lib/schema";
import type { ClipEvent, SignReading, SpeakEvent } from "@/lib/schema";
import { initialHikerState, type HikerState, type LogEntry } from "@/lib/ui/state";

const speak = (value: SpeakEvent): SpeakEvent => SpeakEventSchema.parse(value);
const clip = (value: ClipEvent): ClipEvent => ClipEventSchema.parse(value);
const sign = (value: SignReading): SignReading => SignReadingSchema.parse(value);

// From docs/shared-context.md, verbatim.
export const lynnLoopSign = sign({
  kind: "directional",
  lines: ["Lynn Loop", "2.1 km"],
  arrows: [{ label: "Lynn Loop", direction: "right" }],
  say: "Sign: Lynn Loop, right, two kilometres",
});

export const dropOffEvent = clip({
  clip_id: "clip_0012",
  t_start: 36.0,
  t_end: 39.0,
  hazards: [
    { type: "drop_off", severity: 3, direction: "11", distance: "near", say: "Drop-off, left, stop", point: [310, 760] },
  ],
  trail_state: "clear",
  surface: "packed dirt",
  scene: "Narrow dirt trail with a steep edge on the left, trees on the right.",
  sign: null,
  model: "perceptron-mk1.5",
  latency_ms: 1840,
});

export const dropOffSpeak = speak({ t: 36.4, priority: 3, say: "Drop-off, left, stop", earcon: "stop", haptic: "long" });

// Severity 1 and 2 and the fork, written for these fixtures.
export const mudEvent = clip({
  clip_id: "clip_0013",
  t_start: 39.0,
  t_end: 42.0,
  hazards: [{ type: "mud_ice", severity: 2, direction: "12", distance: "mid", say: "Mud ahead, slow" }],
  trail_state: "clear",
  surface: "wet dirt",
  scene: "Muddy patch across the trail a few steps ahead.",
  model: "perceptron-mk1.5",
  latency_ms: 1620,
});
export const mudSpeak = speak({ t: 42.5, priority: 2, say: "Mud, slow", earcon: "caution", haptic: "double" });

export const rootsEvent = clip({
  clip_id: "clip_0022",
  t_start: 62.0,
  t_end: 65.0,
  hazards: [{ type: "roots_steps", severity: 1, direction: "12", distance: "mid", say: "Roots ahead" }],
  trail_state: "clear",
  surface: "packed dirt",
  scene: "Exposed roots cross the path ahead between two cedars.",
  model: "perceptron-mk1.5",
  latency_ms: 1510,
});
export const rootsSpeak = speak({ t: 65.5, priority: 1, say: "Roots ahead", earcon: "note", haptic: "short" });

export const looseRockEvent = clip({
  clip_id: "clip_0027",
  t_start: 77.0,
  t_end: 80.0,
  hazards: [
    { type: "loose_rock", severity: 2, direction: "1", distance: "near", say: "Loose rock, right", point: [690, 820] },
  ],
  trail_state: "narrowing",
  surface: "gravel",
  scene: "Gravel trail narrowing, loose stones on the right edge.",
  model: "perceptron-mk1.5",
  latency_ms: 1730,
});
export const looseRockSpeak = speak({ t: 80.5, priority: 2, say: "Loose rock, right", earcon: "caution", haptic: "double" });

export const forkEvent = clip({
  clip_id: "clip_0044",
  t_start: 126.0,
  t_end: 129.0,
  hazards: [{ type: "fork", severity: 1, direction: "12", distance: "far", say: "Fork ahead" }],
  trail_state: "fork",
  surface: "packed dirt",
  scene: "The trail splits at a wooden signpost, one branch right and one left.",
  sign: lynnLoopSign,
  model: "perceptron-mk1.5",
  latency_ms: 2210,
});
export const forkSpeak = speak({ t: 129.5, priority: 2, say: "Fork ahead", earcon: "fork", haptic: "double" });

export const afterForkEvent = clip({
  clip_id: "clip_0049",
  t_start: 141.0,
  t_end: 144.0,
  hazards: [],
  trail_state: "clear",
  surface: "packed dirt",
  scene: "Wide flat trail on the right branch, ferns on both sides.",
  model: "perceptron-mk1.5",
  latency_ms: 1480,
});

export const clearAfterRockEvent = clip({
  clip_id: "clip_0032",
  t_start: 92.0,
  t_end: 95.0,
  hazards: [],
  trail_state: "clear",
  surface: "packed dirt",
  scene: "Trail widens again past the gravel, gentle climb ahead.",
  model: "perceptron-mk1.5",
  latency_ms: 1450,
});

export const liveClearEvent = clip({
  clip_id: "live_0003",
  t_start: 3.0,
  t_end: 9.0,
  hazards: [],
  trail_state: "clear",
  surface: "packed dirt",
  scene: "Wide dirt trail through open forest, nothing in the way.",
  model: "perceptron-mk1.5",
  latency_ms: 1390,
});

// Three more for the expanded log (frame 9 shows eight rows).
export const peopleEvent = clip({
  clip_id: "clip_0004",
  t_start: 9.0,
  t_end: 12.0,
  hazards: [{ type: "people", severity: 1, direction: "12", distance: "far", say: "People ahead" }],
  trail_state: "clear",
  surface: "packed dirt",
  scene: "Two hikers walking toward you on a wide trail.",
  model: "perceptron-mk1.5",
  latency_ms: 1550,
});
export const peopleSpeak = speak({ t: 12.5, priority: 1, say: "People ahead", earcon: "note", haptic: "short" });

export const branchEvent = clip({
  clip_id: "clip_0035",
  t_start: 101.0,
  t_end: 104.0,
  hazards: [
    { type: "low_branch", severity: 2, direction: "11", distance: "near", say: "Low branch, left, duck", point: [280, 120] },
  ],
  trail_state: "clear",
  surface: "packed dirt",
  scene: "A fallen branch hangs at head height over the left side of the trail.",
  model: "perceptron-mk1.5",
  latency_ms: 1690,
});
export const branchSpeak = speak({ t: 104.5, priority: 2, say: "Low branch, left, duck", earcon: "caution", haptic: "double" });

export const waterEvent = clip({
  clip_id: "clip_0039",
  t_start: 113.0,
  t_end: 116.0,
  hazards: [{ type: "water", severity: 1, direction: "1", distance: "mid", say: "Water, right" }],
  trail_state: "clear",
  surface: "packed dirt",
  scene: "A small creek runs beside the trail on the right.",
  model: "perceptron-mk1.5",
  latency_ms: 1580,
});
export const waterSpeak = speak({ t: 116.5, priority: 1, say: "Water, right", earcon: "note", haptic: "short" });

export const stepsEvent = clip({
  clip_id: "clip_0008",
  t_start: 21.0,
  t_end: 24.0,
  hazards: [{ type: "roots_steps", severity: 1, direction: "12", distance: "mid", say: "Steps ahead" }],
  trail_state: "clear",
  surface: "timber steps",
  scene: "Three timber steps lead down the trail ahead.",
  model: "perceptron-mk1.5",
  latency_ms: 1530,
});
export const stepsSpeak = speak({ t: 24.5, priority: 1, say: "Steps ahead", earcon: "note", haptic: "short" });

export const livePeopleSpeak = speak({ t: 1.5, priority: 1, say: "People ahead", earcon: "note", haptic: "short" });

const entry = (s: SpeakEvent, e?: ClipEvent): LogEntry => (e ? { speak: s, event: e } : { speak: s });

const roots = entry(rootsSpeak, rootsEvent);
const rock = entry(looseRockSpeak, looseRockEvent);
const fork = entry(forkSpeak, forkEvent);
const logRoots: LogEntry[] = [roots];
const logRootsRock: LogEntry[] = [roots, rock];
const logToFork: LogEntry[] = [entry(mudSpeak, mudEvent), roots, rock, fork];
const logEight: LogEntry[] = [
  entry(peopleSpeak, peopleEvent),
  entry(dropOffSpeak, dropOffEvent),
  entry(mudSpeak, mudEvent),
  roots,
  rock,
  entry(branchSpeak, branchEvent),
  entry(waterSpeak, waterEvent),
  fork,
];

// Low-vision frame LV5: a severity 2 drop-off on the left (point x 310), so the arrow steers right.
export const edgeLeftEvent = clip({
  clip_id: "clip_0057",
  t_start: 168.0,
  t_end: 171.0,
  hazards: [
    { type: "drop_off", severity: 2, direction: "11", distance: "mid", say: "Drop-off, left", point: [310, 640] },
  ],
  trail_state: "narrowing",
  surface: "packed dirt",
  scene: "Trail narrows with a slope falling away on the left.",
  model: "perceptron-mk1.5",
  latency_ms: 1770,
});
export const edgeLeftSpeak = speak({ t: 171.5, priority: 2, say: "Drop-off, left", earcon: "caution", haptic: "double" });

/** Local 2:14 pm, the time frame S3 shows, independent of the machine's timezone. */
export const SOS_SENT_AT = new Date(2026, 9, 17, 14, 14).getTime();

export type HikerFixture = {
  /** Frame label from the handoff state map. */
  frame: string;
  /** Render in docs/design/png/. */
  png: string;
  state: HikerState;
  /** Current hike time in seconds, used for the 8 s clear timeout. */
  now: number;
  /** Frame 1 shows no QR; frame 12 is the same state once a session id exists. */
  sessionId?: string;
};

export const DEMO_SESSION_ID = "demo";

export const hikerFixtures: HikerFixture[] = [
  {
    frame: "1 Idle",
    png: "hiker-idle.png",
    state: { ...initialHikerState, health: "ok" },
    now: 0,
  },
  {
    frame: "2 Playing, trail clear",
    png: "hiker-playing-clear.png",
    state: { ...initialHikerState, health: "ok", mode: "replay", lastSpeak: looseRockSpeak, lastEvent: clearAfterRockEvent, log: logRootsRock },
    now: 95,
  },
  {
    frame: "3 Severity 1",
    png: "hiker-sev1-note.png",
    state: { ...initialHikerState, health: "ok", mode: "replay", lastSpeak: rootsSpeak, lastEvent: rootsEvent, log: logRoots },
    now: 66,
  },
  {
    frame: "4 Severity 2",
    png: "hiker-sev2-caution.png",
    state: { ...initialHikerState, health: "ok", mode: "replay", lastSpeak: looseRockSpeak, lastEvent: looseRockEvent, log: logRootsRock },
    now: 81,
  },
  {
    frame: "5 Severity 3",
    png: "hiker-sev3-stop.png",
    state: { ...initialHikerState, health: "ok", mode: "replay", lastSpeak: dropOffSpeak,
      lastEvent: dropOffEvent,
      log: [entry(peopleSpeak, peopleEvent), entry(stepsSpeak, stepsEvent), entry(dropOffSpeak, dropOffEvent)],
    },
    now: 37,
  },
  {
    frame: "6 Fork with sign",
    png: "hiker-fork-sign.png",
    state: { ...initialHikerState, health: "ok", mode: "replay", lastSpeak: forkSpeak, lastEvent: forkEvent, log: logToFork },
    now: 130,
  },
  {
    frame: "7 Agent listening",
    png: "hiker-agent-listening.png",
    state: {
      ...initialHikerState,
      health: "ok",
      mode: "replay",
      lastSpeak: forkSpeak,
      lastEvent: afterForkEvent,
      log: logToFork,
      agent: "listening",
      transcript: "What's ahead?",
    },
    now: 146,
  },
  {
    frame: "8 Agent speaking",
    png: "hiker-agent-speaking.png",
    state: {
      ...initialHikerState,
      health: "ok",
      mode: "replay",
      lastSpeak: forkSpeak,
      lastEvent: afterForkEvent,
      log: logToFork,
      agent: "speaking",
      transcript: "The fork is about ten metres ahead. Lynn Loop goes right and stays wide and flat for the next two kilometres.",
    },
    now: 146,
  },
  {
    frame: "9 Event log expanded",
    png: "hiker-event-log-expanded.png",
    state: { ...initialHikerState, health: "ok", mode: "replay", lastSpeak: forkSpeak, lastEvent: afterForkEvent, log: logEight, logOpen: true },
    now: 150,
  },
  {
    frame: "10 Live mode",
    png: "hiker-live-mode.png",
    state: {
      ...initialHikerState,
      health: "ok",
      mode: "live",
      lastSpeak: livePeopleSpeak,
      lastEvent: liveClearEvent,
      log: [entry(livePeopleSpeak)],
      analysing: true,
    },
    now: 10,
  },
  {
    frame: "11 Backend offline",
    png: "hiker-backend-offline.png",
    state: { ...initialHikerState, health: "down", mode: "replay", lastSpeak: rootsSpeak, lastEvent: rootsEvent, log: [entry(mudSpeak, mudEvent), roots] },
    now: 75,
  },
  {
    frame: "12 Session QR",
    png: "hiker-session-qr.png",
    state: { ...initialHikerState, health: "ok" },
    now: 0,
    sessionId: DEMO_SESSION_ID,
  },
  // D3: fall check-in and SOS.
  {
    frame: "S1 Check-in started",
    png: "safety-checkin-started.png",
    state: {
      ...initialHikerState,
      health: "ok",
      mode: "replay",
      lastSpeak: rootsSpeak,
      lastEvent: rootsEvent,
      log: logToFork,
      checkin: "counting",
      countdownSeconds: 14,
    },
    now: 210,
  },
  {
    frame: "S2 Cancelled",
    png: "safety-checkin-cancelled.png",
    state: {
      ...initialHikerState,
      health: "ok",
      mode: "replay",
      lastSpeak: looseRockSpeak,
      lastEvent: clearAfterRockEvent,
      log: [entry(mudSpeak, mudEvent), roots, rock],
      checkin: "cancelled",
      countdownSeconds: 9,
    },
    now: 220,
  },
  {
    frame: "S3 SOS sent",
    png: "safety-sos-sent.png",
    state: {
      ...initialHikerState,
      health: "ok",
      mode: "replay",
      lastSpeak: looseRockSpeak,
      lastEvent: clearAfterRockEvent,
      log: logRootsRock,
      checkin: "sos_sent",
      countdownSeconds: 0,
      sosSentAt: SOS_SENT_AT,
    },
    now: 233,
  },
  // D3: low-vision mode.
  {
    frame: "LV4 Trail clear",
    png: "lowvision-clear.png",
    state: {
      ...initialHikerState,
      health: "ok",
      mode: "replay",
      lastSpeak: looseRockSpeak,
      lastEvent: clearAfterRockEvent,
      log: logRootsRock,
      lowVision: true,
    },
    now: 95,
  },
  {
    frame: "LV5 Hazard left",
    png: "lowvision-hazard-left.png",
    state: {
      ...initialHikerState,
      health: "ok",
      mode: "replay",
      lastSpeak: edgeLeftSpeak,
      lastEvent: edgeLeftEvent,
      log: [entry(edgeLeftSpeak, edgeLeftEvent)],
      lowVision: true,
    },
    now: 172,
  },
  {
    frame: "LV6 Stop",
    png: "lowvision-stop.png",
    state: {
      ...initialHikerState,
      health: "ok",
      mode: "replay",
      lastSpeak: dropOffSpeak,
      lastEvent: dropOffEvent,
      log: [entry(dropOffSpeak, dropOffEvent)],
      lowVision: true,
    },
    now: 37,
  },
  {
    frame: "LV7 Fork",
    png: "lowvision-fork.png",
    state: { ...initialHikerState, health: "ok", mode: "replay", lastSpeak: forkSpeak, lastEvent: forkEvent, log: logToFork, lowVision: true },
    now: 130,
  },
];
