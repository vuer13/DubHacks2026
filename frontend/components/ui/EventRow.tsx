import { Icon, type IconName } from "@/components/ui/icons";

export type EventSeverity = 1 | 2 | 3 | "fork";

export type EventRowProps = {
  /** m:ss of the hike, not wall-clock. Use formatHikeTime from lib/format. */
  t: string;
  severity: EventSeverity;
  say: string;
  scene?: string;
  signLines?: string[];
  compact?: boolean;
  ariaLabel?: string;
};

export const severityMeta: Record<
  "1" | "2" | "3" | "fork",
  { word: string; icon: IconName; swatch: string }
> = {
  "1": { word: "Note", icon: "check", swatch: "bg-ts-sev-1-bg text-ts-sev-1-fg" },
  "2": { word: "Caution", icon: "caution", swatch: "bg-ts-sev-2-bg text-ts-sev-2-fg" },
  "3": { word: "Stop", icon: "stop", swatch: "bg-ts-sev-3-bg text-ts-sev-3-fg" },
  fork: { word: "Fork", icon: "fork", swatch: "bg-ts-fork-bg text-ts-fork-fg" },
};

export function EventRow({ t, severity, say, scene, signLines, compact = false, ariaLabel }: EventRowProps) {
  const meta = severityMeta[String(severity) as keyof typeof severityMeta];
  const detail = [scene, ...(signLines ?? [])].filter((line): line is string => Boolean(line));

  if (compact) {
    return (
      <li aria-label={ariaLabel} className="flex items-stretch border-b-2 border-ts-divider last:border-b-0">
        <div aria-hidden="true" className={"flex w-10 shrink-0 items-center justify-center " + meta.swatch}>
          <Icon name={meta.icon} size={22} strokeWidth={2.6} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-3 py-2">
          <div className="flex items-baseline gap-3">
            <span className="w-11 shrink-0 text-meta font-normal tabular-nums text-ts-text-muted">{t}</span>
            <span className="sr-only">{meta.word}.</span>
            <span className="truncate text-secondary font-semibold">{say}</span>
          </div>
          {detail.map((line) => (
            <div key={line} className="truncate pl-14 text-meta font-normal text-ts-text-muted">
              {line}
            </div>
          ))}
        </div>
      </li>
    );
  }

  return (
    <li aria-label={ariaLabel} className="flex min-h-[88px] items-stretch overflow-hidden rounded-control bg-ts-surface-2">
      <div aria-hidden="true" className={"flex w-[72px] shrink-0 items-center justify-center " + meta.swatch}>
        <Icon name={meta.icon} size={36} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-5 py-4">
        <div className="flex flex-wrap items-baseline gap-4 text-meta text-ts-text-muted">
          <span className="tabular-nums">{t}</span>
          <span className="font-semibold">{meta.word}</span>
        </div>
        <span className="text-label">{say}</span>
        {detail.map((line) => (
          <span key={line} className="text-secondary text-ts-text-muted">
            {line}
          </span>
        ))}
      </div>
    </li>
  );
}
