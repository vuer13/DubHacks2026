import type { ReactElement } from "react";

/*
 * Low-vision guidance glyphs from docs/design/handoff.md section 4, inlined
 * from frontend/public/glyphs/*.svg so stroke and fill use currentColor.
 * Coordinates share the phone frame's 390 x 844 viewBox. The ahead arrow is
 * thin and the steer arrow thick on purpose (stroke weight carries severity),
 * so the variants are separate drawings, not rotations of one arrow. Left
 * variants mirror the right ones, as the handoff specifies.
 * `npm run check:ui` fails if these paths drift from the SVG files.
 */

/** "fork" is the neutral fork for a junction with no readable sign; the handoff only draws the two sided forks. */
export type GuidanceGlyphKind = "ahead" | "steer-left" | "steer-right" | "stop" | "fork" | "fork-left" | "fork-right";

export type GuidanceGlyphProps = {
  kind: GuidanceGlyphKind;
  /** Rendered width in px; height follows the 390 x 844 frame. Fills the parent when omitted. */
  size?: number;
  ariaLabel?: string;
};

const labels: Record<GuidanceGlyphKind, string> = {
  ahead: "Arrow pointing straight ahead",
  "steer-right": "Thick arrow pointing right, away from the hazard",
  "steer-left": "Thick arrow pointing left, away from the hazard",
  stop: "Stop",
  "fork-right": "Fork, take the right branch",
  "fork-left": "Fork, take the left branch",
  fork: "Fork ahead",
};

const ahead = (
  <>
    <path d="M195 560V300" fill="none" stroke="currentColor" strokeWidth={16} strokeLinecap="round" />
    <path
      d="M135 360L195 300L255 360"
      fill="none"
      stroke="currentColor"
      strokeWidth={16}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </>
);

const steerRight = (
  <>
    <path d="M60 400H330" fill="none" stroke="currentColor" strokeWidth={40} strokeLinecap="round" />
    <path
      d="M250 320L330 400L250 480"
      fill="none"
      stroke="currentColor"
      strokeWidth={40}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </>
);

const stop = <polygon points="121,110 269,110 374,215 374,363 269,468 121,468 16,363 16,215" fill="currentColor" />;

const forkRight = (
  <>
    <path d="M195 600V430" fill="none" stroke="currentColor" strokeWidth={24} strokeLinecap="round" />
    <path d="M195 430L95 290" fill="none" stroke="currentColor" strokeWidth={12} strokeLinecap="round" />
    <path d="M195 430L295 290" fill="none" stroke="currentColor" strokeWidth={40} strokeLinecap="round" />
    <path
      d="M230 290H295V355"
      fill="none"
      stroke="currentColor"
      strokeWidth={40}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </>
);

// Neutral fork: the handoff's stem, both branches at the stem's 24px weight, no arrowhead.
const forkNeutral = (
  <>
    <path d="M195 600V430" fill="none" stroke="currentColor" strokeWidth={24} strokeLinecap="round" />
    <path d="M195 430L95 290" fill="none" stroke="currentColor" strokeWidth={24} strokeLinecap="round" />
    <path d="M195 430L295 290" fill="none" stroke="currentColor" strokeWidth={24} strokeLinecap="round" />
  </>
);

const mirror = (shape: ReactElement) => <g transform="scale(-1,1) translate(-390,0)">{shape}</g>;

const drawings: Record<GuidanceGlyphKind, ReactElement> = {
  ahead,
  "steer-right": steerRight,
  "steer-left": mirror(steerRight),
  stop,
  "fork-right": forkRight,
  "fork-left": mirror(forkRight),
  fork: forkNeutral,
};

export function GuidanceGlyph({ kind, size, ariaLabel }: GuidanceGlyphProps) {
  return (
    <svg
      viewBox="0 0 390 844"
      role="img"
      aria-label={ariaLabel ?? labels[kind]}
      width={size}
      height={size === undefined ? undefined : Math.round((size * 844) / 390)}
      preserveAspectRatio="xMidYMid meet"
      className={"text-ts-sos-bg" + (size === undefined ? " h-full w-full" : "")}
    >
      {drawings[kind]}
    </svg>
  );
}
