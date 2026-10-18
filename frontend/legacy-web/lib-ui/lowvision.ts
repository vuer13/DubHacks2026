/**
 * Low-vision mode: which guidance glyph and line of text to show.
 * Direction rule from Step B6 in docs/app-and-voice.md (0 to 1000 grid):
 * a hazard on the left gets an arrow steering right, and the reverse.
 */
import type { GuidanceGlyphKind } from "@/components/GuidanceGlyph";
import type { ClipEvent, Hazard, SignReading, SpeakEvent } from "@/lib/schema";
import { selectHikerView, TRAIL_CLEAR_TEXT, type HikerState } from "@/lib/ui/state";

/** Point x under this is the hazard on the left; over RIGHT_X is on the right. */
export const LEFT_X = 400;
export const RIGHT_X = 600;

export type LowVisionArrow = Extract<GuidanceGlyphKind, "steer-left" | "steer-right" | "ahead" | "stop">;

/** Arrow for one hazard. Severity 3 always stops. */
export function arrowForHazard(hazard: Pick<Hazard, "severity" | "direction" | "point">): LowVisionArrow {
  if (hazard.severity === 3) return "stop";
  if (hazard.point) {
    const [x] = hazard.point;
    if (x < LEFT_X) return "steer-right";
    if (x > RIGHT_X) return "steer-left";
    return "ahead";
  }
  if (hazard.direction === "10" || hazard.direction === "11") return "steer-right";
  if (hazard.direction === "1" || hazard.direction === "2") return "steer-left";
  return "ahead";
}

/** Fork glyph: the sign arrow's side is highlighted; no usable sign gives the neutral fork. */
export function forkGlyph(sign: SignReading | null | undefined): {
  kind: Extract<GuidanceGlyphKind, "fork" | "fork-left" | "fork-right">;
  side?: "left" | "right";
} {
  const direction = sign && sign.kind === "directional" ? sign.arrows[0]?.direction : undefined;
  if (direction === "left") return { kind: "fork-left", side: "left" };
  if (direction === "right") return { kind: "fork-right", side: "right" };
  return { kind: "fork" };
}

/** The hazard behind the last warning: same say text, else the most severe in the clip. */
function hazardFor(speak: SpeakEvent | undefined, event: ClipEvent | undefined): Hazard | undefined {
  if (!event || event.hazards.length === 0) return undefined;
  const bySay = speak ? event.hazards.find((hazard) => hazard.say === speak.say) : undefined;
  if (bySay) return bySay;
  return [...event.hazards].sort((a, b) => b.severity - a.severity)[0];
}

export type LowVisionView = {
  glyph: GuidanceGlyphKind;
  text: string;
  /** Text top in the 390 x 844 frame, per the LV frames. */
  textTop: number;
};

/** Text positions from frames LV4 to LV7. */
const TEXT_TOP: Record<"ahead" | "steer" | "stop" | "fork", number> = { ahead: 600, steer: 560, stop: 620, fork: 630 };

export function selectLowVisionView(state: HikerState, now: number): LowVisionView {
  const view = selectHikerView(state, now);

  if (view.tone === "sev3") return { glyph: "stop", text: "Stop", textTop: TEXT_TOP.stop };

  if (view.tone === "fork") {
    const fork = forkGlyph(state.lastEvent?.sign);
    return {
      glyph: fork.kind,
      text: fork.side ? "Fork ahead, " + fork.side : "Fork ahead",
      textTop: TEXT_TOP.fork,
    };
  }

  if (view.tone === "sev1" || view.tone === "sev2") {
    const hazard = hazardFor(state.lastSpeak, state.lastEvent);
    const arrow = hazard ? arrowForHazard(hazard) : "ahead";
    // Frame LV5: the say text without a trailing ", stop".
    const text = view.statusText.replace(/,\s*stop\s*$/i, "");
    if (arrow === "stop") return { glyph: "stop", text: "Stop", textTop: TEXT_TOP.stop };
    return { glyph: arrow, text, textTop: arrow === "ahead" ? TEXT_TOP.ahead : TEXT_TOP.steer };
  }

  return { glyph: "ahead", text: TRAIL_CLEAR_TEXT, textTop: TEXT_TOP.ahead };
}
