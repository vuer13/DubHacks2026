import type { ReactNode } from "react";

import { wordCount } from "@/lib/format";

export type StatusTone = "plain" | "stale" | 1 | 2 | 3 | "fork" | "clear" | "sos";

export type StatusZoneProps = {
  text: string;
  tone: StatusTone;
  /** Severity word above the hero, for example "Caution" or "STOP". */
  word?: string;
  /** Icon for the word row; for tone 3 it sits beside the hero at 64px. */
  glyph?: ReactNode;
  children?: ReactNode;
  ariaLabel?: string;
};

const toneLook: Record<string, string> = {
  plain: "bg-ts-bg text-ts-text",
  stale: "bg-ts-bg text-ts-text-muted",
  "1": "bg-ts-sev-1-bg text-ts-sev-1-fg",
  "2": "bg-ts-sev-2-bg text-ts-sev-2-fg",
  "3": "bg-ts-sev-3-bg text-ts-sev-3-fg",
  fork: "bg-ts-fork-bg text-ts-fork-fg",
  clear: "bg-ts-accent text-ts-text",
  sos: "bg-black text-ts-sos-bg",
};

/**
 * Hero size rule. The handoff drops the hero to 40px at six words, but its
 * idle frame shows the six-word "Ready. Tap the mic to talk." at 56px. The
 * token comment scopes the rule to "the last spoken line", so the idle
 * (plain) message keeps 56px and spoken warnings drop at six words.
 */
export function heroUsesMinSize(text: string, tone: StatusTone): boolean {
  return tone !== "plain" && wordCount(text) >= 6;
}

export function StatusZone({ text, tone, word, glyph, children, ariaLabel }: StatusZoneProps) {
  const heroSize = heroUsesMinSize(text, tone) ? "text-hero-min" : "text-hero";
  const loud = tone === 3 || tone === "sos";
  const hero = (
    <p
      aria-live="assertive"
      aria-atomic="true"
      className={"m-0 min-w-0 max-w-[12ch] tracking-[-0.015em] [text-wrap:balance] " + heroSize}
    >
      {text}
    </p>
  );

  return (
    <section
      aria-label={ariaLabel}
      className={"flex min-h-0 flex-1 flex-col justify-center gap-6 px-4 py-6 " + toneLook[String(tone)]}
    >
      {word ? (
        <div className="flex items-center gap-3">
          {tone === 3 ? null : glyph}
          <span className={loud ? "text-label font-bold tracking-[0.06em]" : "text-label"}>{word}</span>
        </div>
      ) : null}
      {tone === 3 && glyph ? (
        <div className="flex items-center gap-4">
          <span aria-hidden="true" className="shrink-0">
            {glyph}
          </span>
          {hero}
        </div>
      ) : (
        hero
      )}
      {children}
    </section>
  );
}
