import type { ReactNode } from "react";

export type SecondaryButtonProps = {
  label: string;
  icon?: ReactNode;
  onPress: () => void;
  ariaLabel?: string;
};

export function SecondaryButton({ label, icon, onPress, ariaLabel }: SecondaryButtonProps) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={ariaLabel}
      className="flex min-h-touch w-full items-center justify-center gap-3 rounded-control border-[3px] border-ts-text-muted bg-ts-surface-2 px-6 text-label text-ts-text"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
