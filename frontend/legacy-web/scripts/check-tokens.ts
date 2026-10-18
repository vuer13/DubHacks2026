/**
 * Fails if any design token named in docs/design/handoff.md is not declared in
 * app/globals.css, or if a declared value differs from the handoff.
 *
 * Run: npm run check:tokens
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const handoffPath = path.resolve(root, "..", "docs", "design", "handoff.md");
const cssPath = path.resolve(root, "app", "globals.css");

const handoff = readFileSync(handoffPath, "utf8");
const css = readFileSync(cssPath, "utf8");

function declarations(source: string): Map<string, string> {
  const found = new Map<string, string>();
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const match of withoutComments.matchAll(/(--ts-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    const name = match[1];
    const value = match[2];
    if (name !== undefined && value !== undefined) found.set(name, value.trim().replace(/\s+/g, " "));
  }
  return found;
}

// 1. Tokens named in the handoff's token table. A cell like
//    "--ts-sev-1-bg / -fg" names two tokens; "--ts-light-*" names a family.
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

// 2. Every token in the handoff's CSS block, with its value.
const cssBlock = handoff.match(/```css\n([\s\S]*?)```/)?.[1] ?? "";
const handoffTokens = declarations(cssBlock);
const declared = declarations(css);

const problems: string[] = [];

for (const name of tableNames) {
  if (!declared.has(name)) problems.push("missing from globals.css (named in token table): " + name);
}
for (const prefix of familyPrefixes) {
  const family = [...handoffTokens.keys()].filter((name) => name.startsWith(prefix));
  if (family.length === 0) problems.push("handoff CSS block has no tokens for family " + prefix + "*");
  for (const name of family) {
    if (!declared.has(name)) problems.push("missing from globals.css (family " + prefix + "*): " + name);
  }
}
for (const [name, value] of handoffTokens) {
  const ours = declared.get(name);
  if (ours === undefined) problems.push("missing from globals.css (handoff CSS block): " + name);
  else if (ours.toLowerCase() !== value.toLowerCase()) {
    problems.push("value differs for " + name + ": handoff '" + value + "', globals.css '" + ours + "'");
  }
}

const unique = [...new Set(problems)];
if (unique.length > 0) {
  console.error("FAIL: " + unique.length + " token problem(s)");
  for (const problem of unique) console.error("  - " + problem);
  process.exit(1);
}

console.log(
  "OK: " + tableNames.length + " table tokens, " + familyPrefixes.length + " token families and " +
    handoffTokens.size + " handoff CSS tokens are declared in globals.css with matching values.",
);
