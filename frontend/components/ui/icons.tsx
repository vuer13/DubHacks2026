import type { ReactElement } from "react";

/*
 * The 24-unit icons from docs/design/handoff.md section 4: round caps and
 * joins, currentColor. Always decorative here (aria-hidden); the words next
 * to them carry the meaning.
 */

export type IconName =
  | "check"
  | "caution"
  | "stop"
  | "stop-plain"
  | "fork"
  | "mic"
  | "waveform"
  | "alert"
  | "chevron-down"
  | "chevron-up"
  | "arrow-left"
  | "arrow-right"
  | "arrow-ahead";

const shapes: Record<IconName, ReactElement> = {
  check: <path d="M5 12l5 5L20 7" />,
  caution: <path d="M12 3L22 20H2z M12 10v4 M12 17.5h.01" />,
  stop: <path d="M7.5 3h9L21 7.5v9L16.5 21h-9L3 16.5v-9z M12 8v5 M12 16.5h.01" />,
  "stop-plain": <path d="M7.5 3h9L21 7.5v9L16.5 21h-9L3 16.5v-9z" />,
  fork: <path d="M12 21v-8 M12 13L6 6 M12 13l6-7" />,
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0 M12 18v3" />
    </>
  ),
  waveform: <path d="M4 10v4 M8 7v10 M12 4v16 M16 8v8 M20 10v4" />,
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6 M12 16.5h.01" />
    </>
  ),
  "chevron-down": <path d="M6 9l6 6 6-6" />,
  "chevron-up": <path d="M6 15l6-6 6 6" />,
  "arrow-left": <path d="M20 12H4 M10 6l-6 6 6 6" />,
  "arrow-right": <path d="M4 12h16 M14 6l6 6-6 6" />,
  "arrow-ahead": <path d="M12 20V4 M6 10l6-6 6 6" />,
};

type IconProps = {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
};

export function Icon({ name, size = 24, strokeWidth = 2.4, className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {shapes[name]}
    </svg>
  );
}
