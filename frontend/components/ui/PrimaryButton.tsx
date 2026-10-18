import type { ReactNode } from "react";

type Base = {
  label: string;
  icon?: ReactNode;
  ariaLabel?: string;
};

/** One per screen. Either an action (onPress) or a link (href), never both. */
export type PrimaryButtonProps = Base &
  ({ onPress: () => void; href?: never } | { href: string; onPress?: never });

const classes =
  "flex min-h-touch w-full items-center justify-center gap-3 rounded-control border-[3px] border-ts-accent bg-ts-accent px-6 text-label text-ts-text no-underline";

export function PrimaryButton(props: PrimaryButtonProps) {
  const { label, icon, ariaLabel } = props;
  if (props.href !== undefined) {
    return (
      <a href={props.href} aria-label={ariaLabel} className={classes}>
        {icon}
        <span>{label}</span>
      </a>
    );
  }
  return (
    <button type="button" onClick={props.onPress} aria-label={ariaLabel} className={classes}>
      {icon}
      <span>{label}</span>
    </button>
  );
}
