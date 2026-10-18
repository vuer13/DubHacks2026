/**
 * TrailSense design tokens for React Native and React Native Web.
 *
 * handoffTokens is generated verbatim from the CSS block in
 * docs/design/handoff.md section 1, which is the source of truth: change a
 * token there first, then here. `npm run check:tokens` fails if any handoff
 * token is missing, differs, or if a derived value below disagrees with it.
 *
 * Names and sizes follow the handoff. Where the build prompt used other names
 * for the same value, aliases are exported (heroSm = heroMin, body = meta).
 * The handoff's `label` is 24px; 20px is `secondary`.
 */
import type { TextStyle } from "react-native";

export const handoffTokens = {
  "--ts-bg": "#0B1410",
  "--ts-surface": "#13201A",
  "--ts-surface-2": "#1B2C23",
  "--ts-divider": "#2A3F33",
  "--ts-text": "#F2F5F0",
  "--ts-text-muted": "#AEBBB2",
  "--ts-accent": "#1B5A38",
  "--ts-accent-bright": "#5FC98A",
  "--ts-sev-1-bg": "#9ED8AE",
  "--ts-sev-1-fg": "#0B1410",
  "--ts-sev-2-bg": "#E0A526",
  "--ts-sev-2-fg": "#0B1410",
  "--ts-sev-3-bg": "#8F0F19",
  "--ts-sev-3-fg": "#FFFFFF",
  "--ts-fork-bg": "#8DC4F5",
  "--ts-fork-fg": "#0B1410",
  "--ts-sos-bg": "#FFD60A",
  "--ts-sos-fg": "#000000",
  "--ts-health-ok": "#4CC37A",
  "--ts-health-fail": "#FF5C5C",
  "--ts-health-off": "#8A958D",
  "--ts-light-bg": "#F4F6F2",
  "--ts-light-surface": "#FFFFFF",
  "--ts-light-text": "#0B1410",
  "--ts-light-muted": "#44534A",
  "--ts-light-divider": "#D5DDD6",
  "--ts-map-ground": "#E6EAE4",
  "--ts-font": '-apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", sans-serif',
  "--ts-font-mono": "ui-monospace, SFMono-Regular, Menlo, monospace",
  "--ts-type-hero": "56px",
  "--ts-type-hero-min": "40px",
  "--ts-type-lv": "64px",
  "--ts-type-heading": "32px",
  "--ts-type-label": "24px",
  "--ts-type-secondary": "20px",
  "--ts-type-meta": "18px",
  "--ts-space-1": "4px",
  "--ts-space-2": "8px",
  "--ts-space-3": "12px",
  "--ts-space-4": "16px",
  "--ts-space-6": "24px",
  "--ts-space-8": "32px",
  "--ts-space-12": "48px",
  "--ts-space-16": "64px",
  "--ts-touch-min": "64px",
  "--ts-touch-mic": "112px",
  "--ts-gutter": "16px",
  "--ts-radius-control": "16px",
  "--ts-radius-pill": "999px",
  "--ts-focus": "3px solid var(--ts-text)",
} as const;

export type HandoffTokenName = keyof typeof handoffTokens;

/** "56px" -> 56. Throws on anything that is not a plain px value, so a bad token fails loudly. */
export function px(name: HandoffTokenName): number {
  const value: string = handoffTokens[name];
  const match = /^(\d+(?:\.\d+)?)px$/.exec(value);
  if (!match?.[1]) throw new Error(name + " is not a px value: " + value);
  return Number(match[1]);
}

/** Hiker screen, dark only. */
export const colors = {
  bg: handoffTokens["--ts-bg"],
  surface: handoffTokens["--ts-surface"],
  surface2: handoffTokens["--ts-surface-2"],
  divider: handoffTokens["--ts-divider"],
  text: handoffTokens["--ts-text"],
  textMuted: handoffTokens["--ts-text-muted"],
  accent: handoffTokens["--ts-accent"],
  accentBright: handoffTokens["--ts-accent-bright"],
  sev1Bg: handoffTokens["--ts-sev-1-bg"],
  sev1Fg: handoffTokens["--ts-sev-1-fg"],
  sev2Bg: handoffTokens["--ts-sev-2-bg"],
  sev2Fg: handoffTokens["--ts-sev-2-fg"],
  sev3Bg: handoffTokens["--ts-sev-3-bg"],
  sev3Fg: handoffTokens["--ts-sev-3-fg"],
  forkBg: handoffTokens["--ts-fork-bg"],
  forkFg: handoffTokens["--ts-fork-fg"],
  sosBg: handoffTokens["--ts-sos-bg"],
  sosFg: handoffTokens["--ts-sos-fg"],
  healthOk: handoffTokens["--ts-health-ok"],
  healthFail: handoffTokens["--ts-health-fail"],
  healthOff: handoffTokens["--ts-health-off"],
  /** Low-vision mode and the check-in overlay sit on pure black (handoff --ts-sos-fg). */
  black: handoffTokens["--ts-sos-fg"],
} as const;

/** Live share page, light theme. */
export const lightColors = {
  bg: handoffTokens["--ts-light-bg"],
  surface: handoffTokens["--ts-light-surface"],
  text: handoffTokens["--ts-light-text"],
  muted: handoffTokens["--ts-light-muted"],
  divider: handoffTokens["--ts-light-divider"],
  mapGround: handoffTokens["--ts-map-ground"],
  /** The share page reuses the dark set's accent and stop red (handoff: Call button, SOS banner). */
  accent: handoffTokens["--ts-accent"],
  onAccent: handoffTokens["--ts-text"],
  sos: handoffTokens["--ts-sev-3-bg"],
  onSos: handoffTokens["--ts-sev-3-fg"],
} as const;

export type ColorToken = keyof typeof colors;
export type LightColorToken = keyof typeof lightColors;

/** Web font stacks from the handoff. Native uses the platform system font (undefined fontFamily). */
export const fonts = {
  web: handoffTokens["--ts-font"],
  webMono: handoffTokens["--ts-font-mono"],
} as const;

type TypeStyle = Required<Pick<TextStyle, "fontSize" | "lineHeight" | "fontWeight">>;

/** Type scale from the handoff comments: size, line height, weight. React Native needs line height in points. */
export const type = {
  hero: { fontSize: px("--ts-type-hero"), lineHeight: Math.round(px("--ts-type-hero") * 1.05), fontWeight: "700" },
  heroMin: { fontSize: px("--ts-type-hero-min"), lineHeight: Math.round(px("--ts-type-hero-min") * 1.05), fontWeight: "700" },
  lv: { fontSize: px("--ts-type-lv"), lineHeight: Math.round(px("--ts-type-lv") * 1.05), fontWeight: "700" },
  heading: { fontSize: px("--ts-type-heading"), lineHeight: 38, fontWeight: "700" },
  label: { fontSize: px("--ts-type-label"), lineHeight: 30, fontWeight: "600" },
  secondary: { fontSize: px("--ts-type-secondary"), lineHeight: 28, fontWeight: "400" },
  meta: { fontSize: px("--ts-type-meta"), lineHeight: 24, fontWeight: "500" },
} as const satisfies Record<string, TypeStyle>;

/** Aliases for the names used in the build prompt; same values as the handoff tokens. */
export const typeAliases = { heroSm: type.heroMin, body: type.meta } as const;

/** 4px base spacing scale. */
export const space = {
  1: px("--ts-space-1"),
  2: px("--ts-space-2"),
  3: px("--ts-space-3"),
  4: px("--ts-space-4"),
  6: px("--ts-space-6"),
  8: px("--ts-space-8"),
  12: px("--ts-space-12"),
  16: px("--ts-space-16"),
} as const;

export const radii = {
  control: px("--ts-radius-control"),
  pill: px("--ts-radius-pill"),
} as const;

export const size = {
  /** Minimum hit area for every control, in points. */
  touchMin: px("--ts-touch-min"),
  /** Mic button; never under 96. */
  touchMic: px("--ts-touch-mic"),
  touchMicMin: 96,
  gutter: px("--ts-gutter"),
} as const;

/** --ts-focus: 3px solid --ts-text, offset 3px (web focus ring and the check-in overlay outline). */
export const focus = { width: 3, color: colors.text, offset: 3 } as const;

export const tokens = { colors, lightColors, fonts, type, typeAliases, space, radii, size, focus } as const;
