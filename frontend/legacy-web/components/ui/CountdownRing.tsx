export type CountdownRingProps = {
  seconds: number;
  total?: number;
  tone: "sos" | "caution";
  size: 240 | 176;
  ariaLabel?: string;
};

export function ringGeometry(size: number, stroke: number, seconds: number, total: number) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = total > 0 ? Math.min(1, Math.max(0, seconds / total)) : 0;
  return { radius, circumference, offset: circumference * (1 - fraction) };
}

/** Screen readers hear the count at the start and every 5 seconds, not every tick. */
export function spokenSeconds(seconds: number, total: number): number {
  if (seconds >= total) return total;
  return Math.ceil(seconds / 5) * 5;
}

export function CountdownRing({ seconds, total = 20, tone, size, ariaLabel }: CountdownRingProps) {
  const sos = tone === "sos";
  const arcWidth = sos ? 20 : 14;
  const { radius, circumference, offset } = ringGeometry(size, arcWidth, seconds, total);
  const centre = size / 2;
  const spoken = spokenSeconds(seconds, total);

  return (
    <div
      role="timer"
      aria-label={ariaLabel ?? seconds + " seconds left"}
      className={"relative shrink-0 " + (sos ? "text-ts-sos-bg" : "text-ts-text")}
      style={{ width: size, height: size }}
    >
      <svg aria-hidden="true" width={size} height={size} viewBox={"0 0 " + size + " " + size} className="-rotate-90">
        <circle
          cx={centre}
          cy={centre}
          r={radius}
          fill="none"
          stroke={sos ? "var(--ts-sos-bg)" : "var(--ts-surface-2)"}
          strokeWidth={sos ? 4 : 14}
        />
        <circle
          cx={centre}
          cy={centre}
          r={radius}
          fill="none"
          stroke={sos ? "var(--ts-sos-bg)" : "var(--ts-sev-2-bg)"}
          strokeWidth={arcWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <span
          aria-hidden="true"
          className={
            "font-bold tabular-nums " + (sos ? "text-[120px] leading-[120px] tracking-[-0.03em]" : "text-hero leading-[56px]")
          }
        >
          {seconds}
        </span>
        {sos ? null : <span className="text-meta font-normal text-ts-text-muted">seconds</span>}
      </div>
      <span aria-live="assertive" aria-atomic="true" className="sr-only">
        {spoken} seconds
      </span>
    </div>
  );
}
