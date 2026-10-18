import { EventLogPanel } from "@/components/ui/EventLogPanel";
import type { EventRowProps } from "@/components/ui/EventRow";
import { formatHikeTime } from "@/lib/format";
import type { LogEntry } from "@/lib/ui/state";

export type EventLogProps = {
  log: LogEntry[];
  open: boolean;
  newCount: number;
  onToggle: () => void;
};

/** One EventRow per spoken warning, newest first, with the ClipEvent scene and sign lines. */
export function toEventRows(log: LogEntry[]): EventRowProps[] {
  return [...log].reverse().map(({ speak, event }) => {
    const signLines = event?.sign && event.sign.kind !== "none" ? event.sign.lines : undefined;
    return {
      t: formatHikeTime(speak.t),
      severity: speak.earcon === "fork" ? "fork" : speak.priority === 3 ? 3 : speak.priority === 2 ? 2 : 1,
      say: speak.say,
      ...(event?.scene ? { scene: event.scene } : {}),
      ...(signLines && signLines.length > 0 ? { signLines } : {}),
    };
  });
}

export function EventLog({ log, open, newCount, onToggle }: EventLogProps) {
  return <EventLogPanel events={toEventRows(log)} expanded={open} newCount={newCount} onToggle={onToggle} />;
}
