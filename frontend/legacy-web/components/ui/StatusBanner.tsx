import { Icon } from "@/components/ui/icons";
import { SecondaryButton } from "@/components/ui/SecondaryButton";

export type StatusBannerProps = {
  tone: "clear" | "warn" | "sos" | "offline";
  text: string;
  action?: { label: string; onPress: () => void; ariaLabel?: string };
  ariaLabel?: string;
};

/*
 * The handoff describes two SOS looks under one tone: yellow on black pinned
 * under the hero, and the persistent red top banner that carries the Cancel
 * SOS action (frame S3). Passing `action` selects the red top banner.
 * "warn" has no separate spec; it uses the interruption look (surface-2,
 * muted border, dot and words) shown on the design sheet.
 */
export function StatusBanner({ tone, text, action, ariaLabel }: StatusBannerProps) {
  if (tone === "sos" && action) {
    return (
      <div role="alert" aria-label={ariaLabel} className="flex flex-col gap-3 bg-ts-sev-3-bg p-4 text-ts-sev-3-fg">
        <div className="flex items-center gap-3">
          <Icon name="alert" size={32} strokeWidth={2.6} />
          <span className="text-label font-bold">{text}</span>
        </div>
        <SecondaryButton
          label={action.label}
          onPress={action.onPress}
          {...(action.ariaLabel ? { ariaLabel: action.ariaLabel } : {})}
        />
      </div>
    );
  }

  if (tone === "sos") {
    return (
      <div
        role="alert"
        aria-label={ariaLabel}
        className="flex min-h-[72px] items-center gap-4 rounded-control border-[3px] border-ts-sos-bg bg-black px-6 text-ts-sos-bg"
      >
        <Icon name="alert" size={32} strokeWidth={2.6} />
        <span className="text-label font-bold">{text}</span>
      </div>
    );
  }

  if (tone === "clear") {
    return (
      <div
        role="status"
        aria-label={ariaLabel}
        className="flex min-h-[72px] items-center gap-4 rounded-control bg-ts-accent px-6 text-ts-text"
      >
        <Icon name="check" size={32} strokeWidth={2.6} />
        <span className="text-label">{text}</span>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-label={ariaLabel}
      className="flex min-h-touch items-center gap-3 rounded-control border-[3px] border-ts-text-muted bg-ts-surface-2 px-4 text-ts-text"
    >
      <span aria-hidden="true" className="h-4 w-4 shrink-0 rounded-full bg-ts-health-fail" />
      <span className="text-secondary font-medium">{text}</span>
      {action ? (
        <span className="ml-auto">
          <SecondaryButton label={action.label} onPress={action.onPress} />
        </span>
      ) : null}
    </div>
  );
}
