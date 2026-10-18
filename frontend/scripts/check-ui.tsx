/**
 * Proves the design system components meet the handoff contract: accessible
 * names, roles, touch-target classes, severity words, ring maths, and that the
 * inlined guidance glyphs match frontend/public/glyphs/*.svg.
 *
 * Run: npm run check:ui
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { GuidanceGlyph } from "@/components/GuidanceGlyph";
import { CountdownRing, ringGeometry, spokenSeconds } from "@/components/ui/CountdownRing";
import { EventLogPanel, eventLogLabel } from "@/components/ui/EventLogPanel";
import { EventRow } from "@/components/ui/EventRow";
import { HealthDot } from "@/components/ui/HealthDot";
import { MicButton } from "@/components/ui/MicButton";
import { PillToggle } from "@/components/ui/PillToggle";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { SecondaryButton } from "@/components/ui/SecondaryButton";
import { SignCard, signDetail } from "@/components/ui/SignCard";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { StatusZone, heroUsesMinSize } from "@/components/ui/StatusZone";
import { TranscriptLine } from "@/components/ui/TranscriptLine";
import { formatHikeTime } from "@/lib/format";

const root = path.resolve(__dirname, "..");
let failures = 0;
let passes = 0;

function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    passes += 1;
  } else {
    failures += 1;
    console.error("FAIL " + name + (detail ? ": " + detail : ""));
  }
}

const html = (element: ReactElement): string => renderToStaticMarkup(element);
const noop = (): void => {};

// MicButton: label per state, aria-pressed only while listening, >= 96px.
const micLabels = {
  idle: "Ask TrailSense",
  listening: "Listening, tap to stop",
  speaking: "TrailSense is speaking, tap to interrupt",
  unavailable: "Ask TrailSense, voice agent unavailable offline",
} as const;
for (const [state, label] of Object.entries(micLabels) as [keyof typeof micLabels, string][]) {
  const out = html(<MicButton state={state} onPress={noop} />);
  check("MicButton " + state + " label", out.includes('aria-label="' + label + '"'), out);
  check("MicButton " + state + " pressed", out.includes('aria-pressed="true"') === (state === "listening"));
}
check("MicButton listening pulse", html(<MicButton state="listening" onPress={noop} />).includes("ts-pulse"));
check("MicButton never under 96px", html(<MicButton state="idle" onPress={noop} size={40} />).includes("width:96px"));

// PillToggle: switch role, aria-checked, "<label> mode, on|off", 64px.
const pillOff = html(<PillToggle label="Live" checked={false} onChange={noop} />);
const pillOn = html(<PillToggle label="Low vision" checked onChange={noop} />);
check("PillToggle role", pillOff.includes('role="switch"'));
check("PillToggle off", pillOff.includes('aria-checked="false"') && pillOff.includes('aria-label="Live mode, off"'));
check("PillToggle on", pillOn.includes('aria-checked="true"') && pillOn.includes('aria-label="Low vision mode, on"'));
check("PillToggle on shows check glyph", pillOn.includes("M5 12l5 5L20 7"));
check("PillToggle touch target", pillOff.includes("min-h-touch"));

// Buttons: 64px minimum and visible labels.
const secondary = html(<SecondaryButton label="Load video" onPress={noop} />);
check("SecondaryButton touch target", secondary.includes("min-h-touch") && secondary.includes("Load video"));
const primary = html(<PrimaryButton label="Call hiker" href="tel:+15555550100" />);
check("PrimaryButton href renders a link", primary.startsWith("<a") && primary.includes('href="tel:+15555550100"'));
check("PrimaryButton touch target", primary.includes("min-h-touch"));

// HealthDot: words beside the dot, or role img with the label in the header.
const healthInline = html(<HealthDot status="fail" label="Model not responding" />);
check("HealthDot inline words", healthInline.includes("Model not responding") && healthInline.includes('aria-hidden="true"'));
const healthHeader = html(<HealthDot status="ok" label="Backend connected" standalone />);
check("HealthDot standalone", healthHeader.includes('role="img"') && healthHeader.includes('aria-label="Backend connected"'));

// EventRow: m:ss, severity word in text (colour is never the only signal).
check("formatHikeTime 0", formatHikeTime(0) === "0:00");
check("formatHikeTime 75", formatHikeTime(75) === "1:15");
check("formatHikeTime 600.9", formatHikeTime(600.9) === "10:00");
const words = { 1: "Note", 2: "Caution", 3: "Stop", fork: "Fork" } as const;
for (const severity of [1, 2, 3, "fork"] as const) {
  const row = html(<EventRow t="1:15" severity={severity} say="Roots ahead" />);
  const compact = html(<EventRow t="1:15" severity={severity} say="Roots ahead" compact />);
  check("EventRow " + severity + " word", row.includes(">" + words[severity] + "<"));
  check("EventRow " + severity + " compact word", compact.includes(words[severity] + "."));
  check("EventRow " + severity + " swatch hidden", row.includes('aria-hidden="true"'));
}
const fork = html(<EventRow t="2:24" severity="fork" say="Fork ahead" signLines={["Lynn Loop", "2.1 km"]} />);
check("EventRow sign lines", fork.includes("Lynn Loop") && fork.includes("2.1 km"));

// EventLogPanel: header label wording from the handoff and the idle frame.
check("log label empty", eventLogLabel(0, 0, false) === "Event log, no events, collapsed");
check("log label one", eventLogLabel(1, 0, true) === "Event log, 1 event, expanded");
check("log label new", eventLogLabel(4, 1, false) === "Event log, 4 events, 1 new, collapsed");
const logCollapsed = html(<EventLogPanel events={[]} expanded={false} newCount={0} onToggle={noop} />);
check("log collapsed", logCollapsed.includes('aria-expanded="false"') && !logCollapsed.includes("No events"));
const logEmpty = html(<EventLogPanel events={[]} expanded newCount={0} onToggle={noop} />);
check("log expanded empty", logEmpty.includes("No events"));
const many = Array.from({ length: 10 }, (_, i) => ({ t: "0:" + String(i).padStart(2, "0"), severity: 1 as const, say: "Row " + i }));
const logFull = html(<EventLogPanel events={many} expanded newCount={0} onToggle={noop} />);
check("log shows 8 rows", (logFull.match(/<li/g) ?? []).length === 8);
check("log list label", logFull.includes('aria-label="Recent events, newest first"'));

// StatusZone: assertive live hero; size rule.
const zone = html(<StatusZone text="Ready. Tap the mic to talk." tone="plain" />);
check("StatusZone live region", zone.includes('aria-live="assertive"') && zone.includes('aria-atomic="true"'));
check("StatusZone idle stays 56px", /\btext-hero(?!-)\b/.test(zone) && !heroUsesMinSize("Ready. Tap the mic to talk.", "plain"));
check("StatusZone 6-word warning drops to 40px", heroUsesMinSize("Loose rocks ahead, slow down now", 2));
check("StatusZone short warning stays 56px", !heroUsesMinSize("Drop-off, left, stop", 3));

// TranscriptLine: polite live region, speaker in words for screen readers.
const transcript = html(<TranscriptLine speaker="hiker" text="What's ahead?" />);
check("TranscriptLine", transcript.includes('aria-live="polite"') && transcript.includes("You said: "));

// SignCard: group named by the spoken line; detail text.
const sign = html(<SignCard label="Lynn Loop" direction="right" distanceKm={2.1} spoken="Sign: Lynn Loop, right, two kilometres" />);
check("SignCard group", sign.includes('role="group"') && sign.includes('aria-label="Sign: Lynn Loop, right, two kilometres"'));
check("SignCard detail", signDetail("right", 2.1) === "Right, 2.1 km" && sign.includes("Right, 2.1 km"));

// CountdownRing: dash offset maths and announcements every 5 seconds.
const full = ringGeometry(240, 20, 20, 20);
const half = ringGeometry(240, 20, 10, 20);
check("ring radius", full.radius === 110);
check("ring full", Math.abs(full.offset) < 1e-9);
check("ring half", Math.abs(half.offset - half.circumference / 2) < 1e-9);
check("ring spoken", spokenSeconds(20, 20) === 20 && spokenSeconds(14, 20) === 15 && spokenSeconds(5, 20) === 5);
const ring = html(<CountdownRing seconds={14} tone="sos" size={240} />);
check("ring timer role", ring.includes('role="timer"') && ring.includes("15 seconds"));

// StatusBanner: roles per tone.
check("banner sos alert", html(<StatusBanner tone="sos" text="SOS sent. Help is coming." />).includes('role="alert"'));
check(
  "banner sos with action",
  html(<StatusBanner tone="sos" text="Help contacted at 2:14 pm" action={{ label: "Cancel SOS", onPress: noop }} />).includes("Cancel SOS"),
);
check("banner offline status", html(<StatusBanner tone="offline" text="Working offline, pre-recorded warnings only." />).includes('role="status"'));
check("banner clear status", html(<StatusBanner tone="clear" text="Live. Trail clear." />).includes('role="status"'));

// GuidanceGlyph: every path and polygon in public/glyphs/*.svg appears inline.
const glyphFiles = { ahead: "arrow-ahead.svg", "steer-right": "arrow-steer-right.svg", stop: "stop.svg", "fork-right": "fork-right.svg" } as const;
for (const [kind, file] of Object.entries(glyphFiles) as [keyof typeof glyphFiles, string][]) {
  const svg = readFileSync(path.join(root, "public", "glyphs", file), "utf8");
  const shapes = [...svg.matchAll(/(?:d|points)="([^"]+)"/g)].map((m) => m[1] ?? "");
  const rendered = html(<GuidanceGlyph kind={kind} />);
  check("glyph " + kind + " has shapes", shapes.length > 0);
  for (const shape of shapes) check("glyph " + kind + " matches " + file, rendered.includes('"' + shape + '"'), shape);
  check("glyph " + kind + " uses currentColor", rendered.includes("currentColor") && !rendered.includes("#FFD60A"));
  const label = svg.match(/aria-label="([^"]+)"/)?.[1] ?? "";
  check("glyph " + kind + " label", rendered.includes('aria-label="' + label + '"'));
}
check("glyph steer-left mirrors", html(<GuidanceGlyph kind="steer-left" />).includes("scale(-1,1) translate(-390,0)"));
check("glyph fork-left mirrors", html(<GuidanceGlyph kind="fork-left" />).includes("scale(-1,1) translate(-390,0)"));
check("glyph size keeps frame ratio", html(<GuidanceGlyph kind="stop" size={390} />).includes('height="844"'));

// No em dashes in user-facing text (CLAUDE.md rule).
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : /\.(tsx?|css)$/.test(entry) ? [full] : [];
  });
}
for (const file of [...walk(path.join(root, "components")), ...walk(path.join(root, "app"))]) {
  check("no em dash in " + path.relative(root, file), !readFileSync(file, "utf8").includes("—"));
}

if (failures > 0) {
  console.error("\n" + failures + " check(s) failed, " + passes + " passed.");
  process.exit(1);
}
console.log("OK: " + passes + " UI checks passed.");
