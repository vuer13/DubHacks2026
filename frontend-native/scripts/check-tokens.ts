/**
 * Fails if any design token named in docs/design/handoff.md is missing from
 * theme/tokens.ts, if a value differs, or if a derived React Native value
 * (type sizes, spacing, radii, touch sizes, colours) disagrees with its token.
 *
 * Run: npm run check:tokens
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { colors, handoffTokens, lightColors, radii, size, space, type, typeAliases } from "@/theme/tokens";

const handoffPath = path.resolve(__dirname, "..", "..", "docs", "design", "handoff.md");
const handoff = readFileSync(handoffPath, "utf8");
const ours: Record<string, string> = handoffTokens;
const problems: string[] = [];

function declarations(source: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of source.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(--ts-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    const name = match[1];
    const value = match[2];
    if (name !== undefined && value !== undefined) found.set(name, value.trim().replace(/\s+/g, " "));
  }
  return found;
}

// 1. Tokens named in the handoff's token table ("--ts-sev-1-bg / -fg" names two; "--ts-light-*" a family).
const tableSection = handoff.split("## 1. Token table")[1]?.split("## 2.")[0];
if (tableSection === undefined) {
  console.error("FAIL: could not find '## 1. Token table' in handoff.md");
  process.exit(1);
}
const tableNames: string[] = [];
const familyPrefixes: string[] = [];
for (const line of tableSection.split("\n")) {
  const cell = line.match(/^\|\s*(--ts-[^|]+?)\s*\|/)?.[1];
  if (cell === undefined) continue;
  const parts = cell.split("/").map((part) => part.trim());
  const first = parts[0];
  if (first === undefined) continue;
  if (first.endsWith("*")) {
    familyPrefixes.push(first.slice(0, -1));
    continue;
  }
  tableNames.push(first);
  const prefix = first.slice(0, first.lastIndexOf("-") + 1);
  for (const suffix of parts.slice(1)) tableNames.push(prefix + suffix.replace(/^-/, ""));
}

// 2. Every token in the handoff CSS block, with its value.
const handoffTokensFromDoc = declarations(handoff.match(/```css\n([\s\S]*?)```/)?.[1] ?? "");

for (const name of tableNames) {
  if (!(name in ours)) problems.push("missing from tokens.ts (named in token table): " + name);
}
for (const prefix of familyPrefixes) {
  const family = [...handoffTokensFromDoc.keys()].filter((name) => name.startsWith(prefix));
  if (family.length === 0) problems.push("handoff CSS block has no tokens for family " + prefix + "*");
  for (const name of family) if (!(name in ours)) problems.push("missing from tokens.ts (family " + prefix + "*): " + name);
}
for (const [name, value] of handoffTokensFromDoc) {
  const mine = ours[name];
  if (mine === undefined) problems.push("missing from tokens.ts (handoff CSS block): " + name);
  else if (mine.toLowerCase() !== value.toLowerCase()) {
    problems.push("value differs for " + name + ": handoff '" + value + "', tokens.ts '" + mine + "'");
  }
}

// 3. Derived React Native values agree with their tokens.
const pxOf = (name: string): number => Number(/^(\d+(?:\.\d+)?)px$/.exec(handoffTokensFromDoc.get(name) ?? "")?.[1] ?? NaN);
const numeric: Array<[string, number, string]> = [
  ["type.hero", type.hero.fontSize, "--ts-type-hero"],
  ["type.heroMin", type.heroMin.fontSize, "--ts-type-hero-min"],
  ["typeAliases.heroSm", typeAliases.heroSm.fontSize, "--ts-type-hero-min"],
  ["type.lv", type.lv.fontSize, "--ts-type-lv"],
  ["type.heading", type.heading.fontSize, "--ts-type-heading"],
  ["type.label", type.label.fontSize, "--ts-type-label"],
  ["type.secondary", type.secondary.fontSize, "--ts-type-secondary"],
  ["type.meta", type.meta.fontSize, "--ts-type-meta"],
  ["typeAliases.body", typeAliases.body.fontSize, "--ts-type-meta"],
  ["radii.control", radii.control, "--ts-radius-control"],
  ["radii.pill", radii.pill, "--ts-radius-pill"],
  ["size.touchMin", size.touchMin, "--ts-touch-min"],
  ["size.touchMic", size.touchMic, "--ts-touch-mic"],
  ["size.gutter", size.gutter, "--ts-gutter"],
  ...Object.entries(space).map(([step, value]): [string, number, string] => ["space." + step, value, "--ts-space-" + step]),
];
for (const [label, value, token] of numeric) {
  if (value !== pxOf(token)) problems.push(label + " is " + value + " but " + token + " is " + handoffTokensFromDoc.get(token));
}
if (size.touchMic < size.touchMicMin) problems.push("size.touchMic is under the 96pt mic minimum");

// Colour objects only point at handoff values.
const allowed = new Set([...handoffTokensFromDoc.values()].map((value) => value.toLowerCase()));
for (const [group, values] of [["colors", colors], ["lightColors", lightColors]] as const) {
  for (const [key, value] of Object.entries(values)) {
    if (!allowed.has(value.toLowerCase())) problems.push(group + "." + key + " (" + value + ") is not a handoff token value");
  }
}
const lightFamily = [...handoffTokensFromDoc.keys()].filter((name) => name.startsWith("--ts-light-") || name === "--ts-map-ground");
const lightValues = new Set(Object.values(lightColors).map((value) => value.toLowerCase()));
for (const name of lightFamily) {
  if (!lightValues.has((handoffTokensFromDoc.get(name) ?? "").toLowerCase())) problems.push("lightColors does not export " + name);
}

const unique = [...new Set(problems)];
if (unique.length > 0) {
  console.error("FAIL: " + unique.length + " token problem(s)");
  for (const problem of unique) console.error("  - " + problem);
  process.exit(1);
}
console.log(
  "OK: " + tableNames.length + " table tokens, " + familyPrefixes.length + " token family, " + handoffTokensFromDoc.size +
    " handoff CSS tokens and " + numeric.length + " derived values match theme/tokens.ts.",
);
