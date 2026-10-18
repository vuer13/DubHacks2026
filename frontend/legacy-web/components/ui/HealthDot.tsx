export type HealthStatus = "ok" | "fail" | "off";

export type HealthDotProps = {
  status: HealthStatus;
  label: string;
  /**
   * Header use: the dot stands alone with role="img" and aria-label = label,
   * as the handoff's HealthDot entry describes. Not a separate prop in the
   * handoff's signature; added so one component covers both uses.
   */
  standalone?: boolean;
  ariaLabel?: string;
};

const dotColor: Record<HealthStatus, string> = {
  ok: "bg-ts-health-ok",
  fail: "bg-ts-health-fail",
  off: "bg-ts-health-off",
};

export function HealthDot({ status, label, standalone = false, ariaLabel }: HealthDotProps) {
  if (standalone) {
    return (
      <span
        role="img"
        aria-label={ariaLabel ?? label}
        title={label}
        data-status={status}
        className={"inline-block h-4 w-4 shrink-0 rounded-full " + dotColor[status]}
      />
    );
  }
  return (
    <span className="inline-flex items-center gap-4" data-status={status}>
      <span aria-hidden="true" className={"inline-block h-5 w-5 shrink-0 rounded-full " + dotColor[status]} />
      <span className="text-secondary font-semibold" aria-label={ariaLabel}>
        {label}
      </span>
    </span>
  );
}
