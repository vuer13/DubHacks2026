/**
 * Asserts the derived view for each of the twelve hiker frames, plus the
 * reducer and selector rules behind them.
 *
 * Run: npm run check:states
 */
import { toEventRows } from "@/components/hiker/EventLog";
import { DEMO_SESSION_ID, dropOffEvent, dropOffSpeak, forkEvent, hikerFixtures, mudEvent, rootsSpeak } from "@/lib/ui/fixtures";
import {
  CLEAR_TIMEOUT_S,
  READY_TEXT,
  TRAIL_CLEAR_TEXT,
  hikerReducer,
  initialHikerState,
  selectHikerView,
  signView,
  type HikerTone,
  type HikerView,
} from "@/lib/ui/state";

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

check("twelve fixtures", hikerFixtures.length === 12, String(hikerFixtures.length));
for (const fixture of hikerFixtures) {
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

if (failures > 0) {
  console.error("\n" + failures + " check(s) failed, " + passes + " passed.");
  process.exit(1);
}
console.log("OK: " + passes + " state checks passed across " + hikerFixtures.length + " frames.");
