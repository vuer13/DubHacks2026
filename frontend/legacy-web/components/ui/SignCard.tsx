import { Icon } from "@/components/ui/icons";

export type SignCardProps = {
  label: string;
  direction: "left" | "right" | "ahead";
  /** Optional: the handoff's sign data marks distance optional; the card then shows the direction only. */
  distanceKm?: number;
  /** The spoken readout; also the group's accessible name. */
  spoken: string;
  ariaLabel?: string;
};

const arrow = { left: "arrow-left", right: "arrow-right", ahead: "arrow-ahead" } as const;

export function signDetail(direction: SignCardProps["direction"], distanceKm?: number): string {
  const word = direction.charAt(0).toUpperCase() + direction.slice(1);
  return distanceKm === undefined ? word : word + ", " + distanceKm.toFixed(1) + " km";
}

export function SignCard({ label, direction, distanceKm, spoken, ariaLabel }: SignCardProps) {
  return (
    <div className="flex flex-col gap-4">
      <div
        role="group"
        aria-label={ariaLabel ?? spoken}
        className="flex items-center gap-4 rounded-control bg-ts-bg p-4 text-ts-text"
      >
        <div
          aria-hidden="true"
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-control bg-ts-fork-bg text-ts-fork-fg"
        >
          <Icon name={arrow[direction]} size={40} strokeWidth={2.6} />
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-heading">{label}</span>
          <span className="text-label font-normal text-ts-text-muted">{signDetail(direction, distanceKm)}</span>
        </div>
      </div>
      {/* Same words as the group label, so screen readers skip it. */}
      <p aria-hidden="true" className="m-0 text-secondary font-medium">
        {spoken}
      </p>
    </div>
  );
}
