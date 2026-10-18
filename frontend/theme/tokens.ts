/**
 * Design tokens from docs/design/handoff.md section 1, as plain values for
 * StyleSheet. Keep names aligned with the --ts-* custom properties there.
 */
export const colors = {
  bg: "#0B1410",
  surface: "#13201A",
  surface2: "#1B2C23",
  divider: "#2A3F33",
  text: "#F2F5F0",
  textMuted: "#AEBBB2",
  accent: "#1B5A38",
  accentBright: "#5FC98A",
  sev1Bg: "#9ED8AE",
  sev1Fg: "#0B1410",
  sev2Bg: "#E0A526",
  sev2Fg: "#0B1410",
  sev3Bg: "#8F0F19",
  sev3Fg: "#FFFFFF",
  forkBg: "#8DC4F5",
  forkFg: "#0B1410",
  sosBg: "#FFD60A",
  sosFg: "#000000",
  healthOk: "#4CC37A",
  healthFail: "#FF5C5C",
  healthOff: "#8A958D",
} as const;

export const type = {
  hero: { fontSize: 56, lineHeight: 59, fontWeight: "700" },
  heroMin: { fontSize: 40, lineHeight: 42, fontWeight: "700" },
  lowVision: { fontSize: 64, lineHeight: 67, fontWeight: "700" },
  heading: { fontSize: 32, lineHeight: 38, fontWeight: "700" },
  label: { fontSize: 24, lineHeight: 30, fontWeight: "600" },
  secondary: { fontSize: 20, lineHeight: 28, fontWeight: "400" },
  meta: { fontSize: 18, lineHeight: 24, fontWeight: "500" },
} as const;

export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  6: 24,
  8: 32,
  12: 48,
  16: 64,
} as const;

export const size = {
  touchMin: 64,
  touchMic: 112,
  gutter: 16,
  radiusControl: 16,
  radiusPill: 999,
} as const;
