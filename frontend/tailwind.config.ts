import type { Config } from "tailwindcss";

/*
 * Every value points at a CSS custom property declared in app/globals.css,
 * which copies the token table in docs/design/handoff.md. Change tokens there.
 */

const colorTokens = [
  "bg",
  "surface",
  "surface-2",
  "divider",
  "text",
  "text-muted",
  "accent",
  "accent-bright",
  "sev-1-bg",
  "sev-1-fg",
  "sev-2-bg",
  "sev-2-fg",
  "sev-3-bg",
  "sev-3-fg",
  "fork-bg",
  "fork-fg",
  "sos-bg",
  "sos-fg",
  "health-ok",
  "health-fail",
  "health-off",
  "light-bg",
  "light-surface",
  "light-text",
  "light-muted",
  "light-divider",
  "map-ground",
] as const;

const colors: Record<string, string> = Object.fromEntries(
  colorTokens.map((name) => ["ts-" + name, "var(--ts-" + name + ")"]),
);

const touchSizes = {
  touch: "var(--ts-touch-min)",
  mic: "var(--ts-touch-mic)",
};

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors,
      fontFamily: {
        sans: ["var(--ts-font)"],
        mono: ["var(--ts-font-mono)"],
      },
      // Names and sizes follow the handoff type scale (--ts-type-*).
      fontSize: {
        hero: ["var(--ts-type-hero)", { lineHeight: "1.05", fontWeight: "700" }],
        "hero-min": ["var(--ts-type-hero-min)", { lineHeight: "1.05", fontWeight: "700" }],
        lv: ["var(--ts-type-lv)", { lineHeight: "1.05", fontWeight: "700" }],
        heading: ["var(--ts-type-heading)", { lineHeight: "38px", fontWeight: "700" }],
        label: ["var(--ts-type-label)", { lineHeight: "30px", fontWeight: "600" }],
        secondary: ["var(--ts-type-secondary)", { lineHeight: "28px", fontWeight: "400" }],
        meta: ["var(--ts-type-meta)", { lineHeight: "24px", fontWeight: "500" }],
      },
      // 4px base scale from the handoff. Same pixel values as Tailwind's
      // defaults for these keys, but sourced from the tokens.
      spacing: {
        "1": "var(--ts-space-1)",
        "2": "var(--ts-space-2)",
        "3": "var(--ts-space-3)",
        "4": "var(--ts-space-4)",
        "6": "var(--ts-space-6)",
        "8": "var(--ts-space-8)",
        "12": "var(--ts-space-12)",
        "16": "var(--ts-space-16)",
        gutter: "var(--ts-gutter)",
        ...touchSizes,
      },
      minHeight: touchSizes,
      minWidth: touchSizes,
      borderRadius: {
        control: "var(--ts-radius-control)",
        pill: "var(--ts-radius-pill)",
      },
    },
  },
  plugins: [],
};

export default config;
