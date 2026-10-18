import { EventRow, type EventRowProps } from "@/components/ui/EventRow";
import { Icon } from "@/components/ui/icons";

export type EventLogPanelProps = {
  /** Newest first. The panel shows the latest eight. */
  events: EventRowProps[];
  expanded: boolean;
  newCount: number;
  onToggle: () => void;
  ariaLabel?: string;
};

export function eventLogLabel(count: number, newCount: number, expanded: boolean): string {
  const events = count === 0 ? "no events" : count === 1 ? "1 event" : count + " events";
  const fresh = newCount > 0 ? ", " + newCount + " new" : "";
  return "Event log, " + events + fresh + ", " + (expanded ? "expanded" : "collapsed");
}

export function EventLogPanel({ events, expanded, newCount, onToggle, ariaLabel }: EventLogPanelProps) {
  return (
    <section className={expanded ? "flex min-h-0 flex-1 flex-col" : "flex flex-col"}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="event-log-list"
        aria-label={ariaLabel ?? eventLogLabel(events.length, newCount, expanded)}
        onClick={onToggle}
        className="flex h-16 min-h-touch w-full shrink-0 items-center justify-between border-b-2 border-ts-divider bg-ts-bg px-4 text-left text-secondary font-semibold"
      >
        <span>Event log</span>
        <span className="flex items-center gap-3 font-medium text-ts-text-muted">
          {/* Frame 3: when every event is new, the header says "N new" in green; otherwise the count. */}
          {newCount > 0 && newCount === events.length ? (
            <span className="text-ts-accent-bright">{newCount} new</span>
          ) : (
            <span>{events.length}</span>
          )}
          <Icon name={expanded ? "chevron-up" : "chevron-down"} />
        </span>
      </button>
      {expanded ? (
        events.length === 0 ? (
          <p id="event-log-list" className="flex-1 bg-ts-surface px-4 py-6 text-secondary text-ts-text-muted">
            No events
          </p>
        ) : (
          <ul
            id="event-log-list"
            aria-label="Recent events, newest first"
            className="m-0 flex min-h-0 flex-1 list-none flex-col overflow-y-auto bg-ts-surface p-0"
          >
            {events.slice(0, 8).map((event, index) => (
              <EventRow key={event.t + "-" + index} {...event} compact />
            ))}
          </ul>
        )
      ) : null}
    </section>
  );
}
