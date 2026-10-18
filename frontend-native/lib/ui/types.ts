/**
 * Prop and value types from the handoff component inventory
 * (docs/design/handoff.md section 2) that the pure logic in lib/ also needs.
 * They live here so lib/ never imports a React component; the components in
 * components/ import these types instead of declaring their own.
 */

export type HealthStatus = "ok" | "fail" | "off";

export type MicButtonState = "idle" | "listening" | "speaking" | "unavailable";

export type SignCardProps = {
  label: string;
  direction: "left" | "right" | "ahead";
  /** Optional: the handoff's sign data marks distance optional; the card then shows the direction only. */
  distanceKm?: number;
  /** The spoken readout; also the group's accessible name. */
  spoken: string;
  ariaLabel?: string;
};

export type EventSeverity = 1 | 2 | 3 | "fork";

export type EventRowProps = {
  /** m:ss of the hike, not wall-clock. Use formatHikeTime from lib/format. */
  t: string;
  severity: EventSeverity;
  say: string;
  scene?: string;
  signLines?: string[];
  compact?: boolean;
  ariaLabel?: string;
};

/** "fork" is the neutral fork for a junction with no readable sign; the handoff only draws the two sided forks. */
export type GuidanceGlyphKind = "ahead" | "steer-left" | "steer-right" | "stop" | "fork" | "fork-left" | "fork-right";
