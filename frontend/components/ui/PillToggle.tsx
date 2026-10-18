import { Icon } from "@/components/ui/icons";

export type PillToggleProps = {
  label: "Live" | "Low vision";
  checked: boolean;
  onChange: (checked: boolean) => void;
  tone?: "dark" | "yellow";
  ariaLabel?: string;
};

export function PillToggle({ label, checked, onChange, tone = "dark", ariaLabel }: PillToggleProps) {
  const look =
    tone === "yellow"
      ? "w-[220px] bg-black border-ts-sos-bg text-ts-sos-bg text-secondary font-semibold"
      : checked
        ? "flex-1 bg-ts-accent border-ts-accent-bright text-ts-text text-meta font-semibold"
        : "flex-1 bg-ts-surface-2 border-ts-text-muted text-ts-text text-meta font-semibold";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel ?? label + " mode, " + (checked ? "on" : "off")}
      onClick={() => onChange(!checked)}
      className={
        "flex min-h-touch min-w-0 items-center justify-center gap-1.5 rounded-pill border-[3px] px-1.5 " + look
      }
    >
      {checked ? <Icon name="check" size={20} strokeWidth={3} /> : null}
      <span>{label}</span>
    </button>
  );
}
