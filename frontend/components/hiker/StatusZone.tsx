import type { ReactNode } from "react";

import { Icon } from "@/components/ui/icons";
import { SignCard } from "@/components/ui/SignCard";
import { StatusZone, type StatusTone } from "@/components/ui/StatusZone";
import { TranscriptLine } from "@/components/ui/TranscriptLine";
import type { HikerView } from "@/lib/ui/state";

export type HikerStatusZoneProps = {
  view: HikerView;
  /** Session QR tile, shown in the idle state's lower corner (frame 12). */
  share?: ReactNode;
};

/** Draws the derived tone the way frames 1 to 12 show it. */
export function HikerStatusZone({ view, share }: HikerStatusZoneProps) {
  const transcript = view.transcript ? (
    <TranscriptLine speaker={view.transcript.speaker} text={view.transcript.text} />
  ) : null;

  let tone: StatusTone;
  let word: string | undefined;
  let glyph: ReactNode = null;
  let extra: ReactNode = null;

  switch (view.tone) {
    case "sev1":
      tone = 1;
      word = "Note";
      glyph = <Icon name="check" size={28} strokeWidth={2.6} />;
      break;
    case "sev2":
      tone = 2;
      word = "Caution";
      glyph = <Icon name="caution" size={28} strokeWidth={2.6} />;
      break;
    case "sev3":
      tone = 3;
      word = "STOP";
      glyph = <Icon name="stop" size={64} strokeWidth={2.4} />;
      break;
    case "fork":
      tone = "fork";
      word = "Fork";
      glyph = <Icon name="fork" size={28} strokeWidth={2.6} />;
      extra = view.sign ? <SignCard {...view.sign} /> : null;
      break;
    case "clear":
      if (view.clearStyle === "live") {
        tone = "clear";
        word = "Live";
        glyph = <Icon name="check" size={28} strokeWidth={2.6} />;
      } else if (view.clearStyle === "stale") {
        tone = "stale";
        extra = view.showClearLine ? (
          <div className="flex items-center gap-3 text-ts-accent-bright">
            <Icon name="check" size={28} strokeWidth={2.6} />
            <span className="text-label">Trail clear</span>
          </div>
        ) : null;
      } else {
        tone = "plain";
        extra = view.clearStyle === "ready" && share ? <div className="mt-auto flex justify-end">{share}</div> : null;
      }
      break;
  }

  return (
    <StatusZone
      text={view.statusText}
      tone={tone}
      {...(word ? { word } : {})}
      glyph={glyph}
      childrenNeedRoom={view.heroNeedsRoom}
    >
      {extra}
      {transcript}
    </StatusZone>
  );
}
