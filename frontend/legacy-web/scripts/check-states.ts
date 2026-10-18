/**
 * Asserts the derived view for each of the twelve hiker frames, plus the
 * reducer and selector rules behind them.
 *
 * Run: npm run check:states
 */
import { toEventRows } from "@/components/hiker/EventLog";
import { SafetyEventSchema } from "@/lib/schema";
import {
  DEMO_SESSION_ID,
  SOS_SENT_AT,
  dropOffEvent,
  dropOffSpeak,
  forkEvent,
  hikerFixtures,
  lynnLoopSign,
  mudEvent,
  rootsSpeak,
} from "@/lib/ui/fixtures";
import { arrowForHazard, forkGlyph, selectLowVisionView } from "@/lib/ui/lowvision";
import {
  CHECKIN_SECONDS,
  CLEAR_TIMEOUT_S,
  READY_TEXT,
  TRAIL_CLEAR_TEXT,
  formatClockTime,
  hikerReducer,
  initialHikerState,
  safetyEventToAction,
  selectHikerView,
  signView,
  type HikerState,
  type HikerTone,
  type HikerView,
} from "@/lib/ui/state";
import { createWakeLockController } from "@/lib/wakelock";

let failures = 0;
let passes = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) passes += 1;
  else {
    failures += 1;
    console.error("FAIL " + name + (detail ? ": " + detail : ""));
  }
}

const lynnLoop: HikerView["sign"] = {
  label: "Lynn Loop",
  direction: "right",
  distanceKm: 2.1,
  spoken: "Sign: Lynn Loop, right, two kilometres",
};

type Expected = {
  tone: HikerTone;
  statusText: string;
  sign?: HikerView["sign"];
  extra?: (view: HikerView) => string | null;
};

// Written by hand from the handoff state map, not computed.
const expected: Record<string, Expected> = {
  "1 Idle": { tone: "clear", statusText: READY_TEXT, extra: (v) => (v.clearStyle === "ready" ? null : "clearStyle " + v.clearStyle) },
  "2 Playing, trail clear": {
    tone: "clear",
    statusText: "Loose rock, right",
    extra: (v) => (v.clearStyle === "stale" && v.showClearLine ? null : "expected stale with Trail clear line"),
  },
  "3 Severity 1": { tone: "sev1", statusText: "Roots ahead", extra: (v) => (v.newCount === 1 ? null : "newCount " + v.newCount) },
  "4 Severity 2": { tone: "sev2", statusText: "Loose rock, right" },
  "5 Severity 3": { tone: "sev3", statusText: "Drop-off, left, stop", extra: (v) => (v.isStop ? null : "isStop false") },
  "6 Fork with sign": { tone: "fork", statusText: "Fork ahead", sign: lynnLoop },
  "7 Agent listening": {
    tone: "clear",
    statusText: "Fork ahead",
    extra: (v) =>
      v.mic === "listening" && v.transcript?.speaker === "hiker" && !v.showClearLine && !v.heroNeedsRoom ? null : "listening view wrong",
  },
  "8 Agent speaking": {
    tone: "clear",
    statusText: "Fork ahead",
    extra: (v) => (v.mic === "speaking" && v.transcript?.speaker === "agent" && v.heroNeedsRoom ? null : "speaking view wrong"),
  },
  "9 Event log expanded": { tone: "clear", statusText: "Fork ahead" },
  "10 Live mode": { tone: "clear", statusText: TRAIL_CLEAR_TEXT, extra: (v) => (v.clearStyle === "live" ? null : "clearStyle " + v.clearStyle) },
  "11 Backend offline": {
    tone: "clear",
    statusText: "Roots ahead",
    extra: (v) =>
      v.offline && v.mic === "unavailable" && v.healthDot === "fail" && !v.showClearLine ? null : "offline view wrong",
  },
  "12 Session QR": { tone: "clear", statusText: READY_TEXT },
};

// D3 frames: check-in, SOS and low-vision. Written by hand from the frames.
const d3Expected: Record<string, (state: HikerState, now: number) => string | null> = {
  "S1 Check-in started": (st) => (st.checkin === "counting" && st.countdownSeconds === 14 ? null : "not counting from 14"),
  "S2 Cancelled": (st) => (st.checkin === "cancelled" ? null : "not cancelled"),
  "S3 SOS sent": (st) =>
    st.checkin === "sos_sent" && st.sosSentAt !== undefined && formatClockTime(st.sosSentAt) === "2:14 pm" ? null : "sos time wrong",
  "LV4 Trail clear": (st, now) => lv(st, now, "ahead", "Trail clear"),
  "LV5 Hazard left": (st, now) => lv(st, now, "steer-right", "Drop-off, left"),
  "LV6 Stop": (st, now) => lv(st, now, "stop", "Stop"),
  "LV7 Fork": (st, now) => lv(st, now, "fork-right", "Fork ahead, right"),
};
function lv(state: HikerState, now: number, glyph: string, text: string): string | null {
  const view = selectLowVisionView(state, now);
  return state.lowVision && view.glyph === glyph && view.text === text ? null : "got " + view.glyph + " / " + view.text;
}

check("nineteen fixtures", hikerFixtures.length === 19, String(hikerFixtures.length));
for (const fixture of hikerFixtures) {
  const d3 = d3Expected[fixture.frame];
  if (d3) {
    const problem = d3(fixture.state, fixture.now);
    check(fixture.frame, problem === null, problem ?? "");
    continue;
  }
  const want = expected[fixture.frame];
  if (!want) {
    check("expectation for " + fixture.frame, false);
    continue;
  }
  const view = selectHikerView(fixture.state, fixture.now);
  check(fixture.frame + " tone", view.tone === want.tone, view.tone);
  check(fixture.frame + " statusText", view.statusText === want.statusText, view.statusText);
  check(fixture.frame + " sign", JSON.stringify(view.sign) === JSON.stringify(want.sign), JSON.stringify(view.sign));
  const problem = want.extra?.(view) ?? null;
  check(fixture.frame + " extra", problem === null, problem ?? "");
}
check("frame 12 has session id", hikerFixtures[11]?.sessionId === DEMO_SESSION_ID);
check("frame 9 log has eight rows", hikerFixtures[8]?.state.log.length === 8);

// Severity mapping and the clear timeout.
const fired = (priority: 1 | 2 | 3, t: number) =>
  hikerReducer({ ...initialHikerState, mode: "replay" }, {
    type: "speak_fired",
    speak: { t, priority, say: "Test", earcon: priority === 3 ? "stop" : priority === 2 ? "caution" : "note", haptic: "short" },
  });
check("p1 -> sev1", selectHikerView(fired(1, 10), 11).tone === "sev1");
check("p2 -> sev2", selectHikerView(fired(2, 10), 11).tone === "sev2");
check("p3 -> sev3", selectHikerView(fired(3, 10), 11).tone === "sev3");
check("fresh just before timeout", selectHikerView(fired(2, 10), 10 + CLEAR_TIMEOUT_S - 0.01).tone === "sev2");
check("clear at timeout", selectHikerView(fired(2, 10), 10 + CLEAR_TIMEOUT_S).tone === "clear");
check("no speak in replay is clear", selectHikerView({ ...initialHikerState, mode: "replay" }, 0).statusText === TRAIL_CLEAR_TEXT);

// Priority 3 holds while a severity 3 hazard is still detected.
const stopHeld = hikerReducer(
  hikerReducer({ ...initialHikerState, mode: "replay" }, { type: "clip_event_received", event: dropOffEvent }),
  { type: "speak_fired", speak: dropOffSpeak },
);
check("sev3 holds past timeout while detected", selectHikerView(stopHeld, 60).tone === "sev3");
const stopReleased = hikerReducer(stopHeld, { type: "clip_event_received", event: mudEvent });
check("sev3 clears once hazard gone", selectHikerView(stopReleased, 60).tone === "clear");

// Speak attaches the matching clip; log rows newest first with scene.
check("speak matched to clip", stopHeld.log[0]?.event?.clip_id === "clip_0012");
const unmatched = hikerReducer(stopHeld, { type: "speak_fired", speak: rootsSpeak });
check("speak outside clip window has no event", unmatched.log[1]?.event === undefined);
const rows = toEventRows(stopHeld.log);
check("row severity and scene", rows[0]?.severity === 3 && rows[0]?.scene === dropOffEvent.scene);
check("row time m:ss", rows[0]?.t === "0:36");
const forkRows = toEventRows([{ speak: { t: 129.5, priority: 2, say: "Fork ahead", earcon: "fork", haptic: "double" }, event: forkEvent }]);
check("fork row with sign lines", forkRows[0]?.severity === "fork" && forkRows[0]?.signLines?.[0] === "Lynn Loop");
check("log newest first", toEventRows(hikerFixtures[8]?.state.log ?? [])[0]?.say === "Fork ahead");

// Sign only for directional signs.
check("directional sign", signView(forkEvent)?.label === "Lynn Loop");
check("warning sign ignored", signView({ ...forkEvent, sign: { kind: "warning", lines: ["Trail closed"], arrows: [], say: "Warning sign: Trail closed" } }) === undefined);
check("no sign", signView(dropOffEvent) === undefined);
check("back arrow has no card", signView({ ...forkEvent, sign: { kind: "directional", lines: ["Parking"], arrows: [{ label: "Parking", direction: "back" }], say: "Sign: Parking, back" } }) === undefined);

// Toggles, health, agent, video loaded, reset.
let s = hikerReducer(initialHikerState, { type: "low_vision_toggled", on: true });
check("low vision on", s.lowVision);
s = hikerReducer(s, { type: "mode_changed", mode: "live" });
s = hikerReducer(s, { type: "analysing_changed", analysing: true });
check("live analysing", s.mode === "live" && s.analysing);
s = hikerReducer(s, { type: "mode_changed", mode: "idle" });
check("leaving live stops analysing", !s.analysing);
s = hikerReducer(s, { type: "health_changed", health: "down" });
check("health down -> mic unavailable", selectHikerView(s, 0).mic === "unavailable");
s = hikerReducer(s, { type: "agent_changed", agent: "listening" });
s = hikerReducer(s, { type: "transcript_updated", text: "Hello" });
check("transcript kept", s.transcript === "Hello");
s = hikerReducer(s, { type: "agent_changed", agent: "off" });
check("agent off clears transcript", s.transcript === undefined);
s = hikerReducer(stopHeld, { type: "video_loaded" });
check("video loaded clears events", s.mode === "replay" && s.log.length === 0 && s.lastSpeak === undefined);
s = hikerReducer({ ...stopHeld, health: "ok", logOpen: true }, { type: "reset" });
check("reset keeps health", s.health === "ok" && !s.logOpen && s.log.length === 0);

// Fall check-in and SOS reducer.
let c = hikerReducer(initialHikerState, { type: "checkin_started" });
check("check-in starts at the constant", c.checkin === "counting" && c.countdownSeconds === CHECKIN_SECONDS && CHECKIN_SECONDS === 20);
c = hikerReducer(c, { type: "checkin_tick", at: 1 });
check("tick counts down", c.countdownSeconds === CHECKIN_SECONDS - 1 && c.checkin === "counting");
for (let i = 0; i < CHECKIN_SECONDS - 2; i += 1) c = hikerReducer(c, { type: "checkin_tick", at: 1000 + i });
check("one second left", c.countdownSeconds === 1 && c.checkin === "counting");
c = hikerReducer(c, { type: "checkin_tick", at: SOS_SENT_AT });
check("zero sends SOS and records the time", c.checkin === "sos_sent" && c.countdownSeconds === 0 && c.sosSentAt === SOS_SENT_AT);
check("tick after SOS is ignored", hikerReducer(c, { type: "checkin_tick", at: 5 }) === c);
check("new check-in cannot override SOS", hikerReducer(c, { type: "checkin_started" }).checkin === "sos_sent");
const sosOff = hikerReducer(c, { type: "sos_cancelled" });
check("cancel SOS clears", sosOff.checkin === "none" && sosOff.sosSentAt === undefined);
let k = hikerReducer(initialHikerState, { type: "checkin_started", seconds: 5 });
check("custom length", k.countdownSeconds === 5);
k = hikerReducer(k, { type: "checkin_cancelled" });
check("cancel while counting", k.checkin === "cancelled");
k = hikerReducer(k, { type: "checkin_cleared" });
check("cleared returns to normal", k.checkin === "none" && k.countdownSeconds === CHECKIN_SECONDS);
check("cancel when idle is ignored", hikerReducer(initialHikerState, { type: "checkin_cancelled" }) === initialHikerState);
check("2:14 pm label", formatClockTime(SOS_SENT_AT) === "2:14 pm");

// Safety events from docs/shared-context.md map to actions.
const docEvents = [
  { type: "fall_suspected", t: 212.0, signals: { motion_spike: true, static_after: true, vlm: "yes" }, confidence: 0.86 },
  { type: "fall_checkin_started", t: 213.0, timeout_s: 20 },
  { type: "fall_cancelled", t: 219.0, by: "voice" },
  { type: "sos_sent", t: 233.0, to: "+1...", lat: 49.3, lng: -123.1 },
  { type: "off_trail", t: 90.0, distance_m: 22, side: "left" },
].map((event) => SafetyEventSchema.parse(event));
const mapped = docEvents.map((event) => safetyEventToAction(event, SOS_SENT_AT));
check("fall_suspected maps to nothing", mapped[0] === null);
check("fall_checkin_started maps", JSON.stringify(mapped[1]) === JSON.stringify({ type: "checkin_started", seconds: 20 }));
check("fall_cancelled maps", mapped[2]?.type === "checkin_cancelled");
check("sos_sent maps with wall clock", JSON.stringify(mapped[3]) === JSON.stringify({ type: "sos_sent", at: SOS_SENT_AT }));
check("off_trail maps to nothing", mapped[4] === null);
let flow = initialHikerState;
for (const action of mapped) if (action) flow = hikerReducer(flow, action);
check("dispatched doc events end in sos_sent", flow.checkin === "sos_sent" && flow.sosSentAt === SOS_SENT_AT);

// Low-vision direction rule (Step B6).
check("x 310 -> arrow right", arrowForHazard({ severity: 2, direction: "12", point: [310, 700] }) === "steer-right");
check("x 700 -> arrow left", arrowForHazard({ severity: 2, direction: "12", point: [700, 700] }) === "steer-left");
check("x 500 -> ahead", arrowForHazard({ severity: 2, direction: "12", point: [500, 700] }) === "ahead");
check("no point, 10 -> arrow right", arrowForHazard({ severity: 2, direction: "10" }) === "steer-right");
check("no point, 11 -> arrow right", arrowForHazard({ severity: 1, direction: "11", point: null }) === "steer-right");
check("no point, 2 -> arrow left", arrowForHazard({ severity: 2, direction: "2" }) === "steer-left");
check("no point, 12 -> ahead", arrowForHazard({ severity: 2, direction: "12" }) === "ahead");
check("severity 3 -> stop", arrowForHazard({ severity: 3, direction: "10", point: [100, 700] }) === "stop");
check("fork with right sign highlights right", forkGlyph(lynnLoopSign).kind === "fork-right" && forkGlyph(lynnLoopSign).side === "right");
check("fork with left sign highlights left", forkGlyph({ ...lynnLoopSign, arrows: [{ label: "Ridge", direction: "left" }] }).kind === "fork-left");
check("fork without sign is neutral", forkGlyph(null).kind === "fork" && forkGlyph(undefined).side === undefined);
const forkNoSign = hikerReducer(
  hikerReducer(initialHikerState, { type: "clip_event_received", event: { ...forkEvent, sign: null } }),
  { type: "speak_fired", speak: { t: 129.5, priority: 2, say: "Fork ahead", earcon: "fork", haptic: "double" } },
);
check("neutral fork text", selectLowVisionView(forkNoSign, 130).text === "Fork ahead" && selectLowVisionView(forkNoSign, 130).glyph === "fork");
check("low vision clear when nothing active", selectLowVisionView(initialHikerState, 0).glyph === "ahead");

// Wake lock controller, with fakes.
async function wakeLockChecks(): Promise<void> {
  const listeners: Array<() => void> = [];
  const doc = {
    visibilityState: "visible",
    addEventListener: (_type: "visibilitychange", fn: () => void) => listeners.push(fn),
    removeEventListener: (_type: "visibilitychange", fn: () => void) => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    },
  };
  let requests = 0;
  const sentinels: Array<{ released: boolean; release: () => Promise<void> }> = [];
  const nav = {
    wakeLock: {
      request: async () => {
        requests += 1;
        const sentinel = { released: false, release: async () => void (sentinel.released = true) };
        sentinels.push(sentinel);
        return sentinel;
      },
    },
  };
  const wl = createWakeLockController(nav, doc);
  await wl.setActive(true);
  check("wake lock acquired when active", requests === 1 && wl.isHeld());
  await wl.setActive(true);
  check("no duplicate request", requests === 1);
  sentinels[0]!.released = true; // the browser drops it when the page hides
  doc.visibilityState = "hidden";
  listeners.forEach((fn) => fn());
  check("not re-requested while hidden", requests === 1);
  doc.visibilityState = "visible";
  listeners.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 0));
  check("re-requested on visible", requests === 2 && wl.isHeld());
  await wl.setActive(false);
  check("released when inactive", !wl.isHeld() && sentinels[1]!.released);
  listeners.forEach((fn) => fn());
  await new Promise((resolve) => setTimeout(resolve, 0));
  check("inactive ignores visibility", requests === 2);
  await wl.dispose();
  check("dispose removes listener", listeners.length === 0);

  const unsupported = createWakeLockController({}, doc);
  await unsupported.setActive(true);
  check("unsupported is a no-op", !unsupported.isHeld());
  await unsupported.dispose();

  const denied = createWakeLockController(
    { wakeLock: { request: async () => Promise.reject(new Error("NotAllowedError")) } },
    doc,
  );
  await denied.setActive(true);
  check("denied request does not throw", !denied.isHeld());
  await denied.dispose();
}
void wakeLockChecks().then(() => {
  if (failures > 0) {
    console.error("\n" + failures + " check(s) failed, " + passes + " passed.");
    process.exit(1);
  }
  console.log("OK: " + passes + " state checks passed across " + hikerFixtures.length + " frames.");
});
