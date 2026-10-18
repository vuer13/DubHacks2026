import { Icon } from "@/components/ui/icons";

export type TranscriptLineProps = {
  speaker: "hiker" | "agent";
  text: string;
  ariaLabel?: string;
};

export function TranscriptLine({ speaker, text, ariaLabel }: TranscriptLineProps) {
  return (
    <div
      aria-live="polite"
      aria-label={ariaLabel}
      className="flex items-start gap-3 border-t-2 border-ts-divider pt-5"
    >
      <Icon
        name={speaker === "hiker" ? "mic" : "waveform"}
        size={28}
        strokeWidth={2.2}
        className="mt-0.5 shrink-0 text-ts-accent-bright"
      />
      <p className="m-0 text-label font-medium text-ts-text">
        <span className="sr-only">{speaker === "hiker" ? "You said: " : "TrailSense: "}</span>
        {text}
      </p>
    </div>
  );
}
