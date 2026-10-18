import { Icon } from "@/components/ui/icons";

export type MicButtonState = "idle" | "listening" | "speaking" | "unavailable";

export type MicButtonProps = {
  state: MicButtonState;
  onPress: () => void;
  /** Handoff default 112; never under 96. */
  size?: number;
  ariaLabel?: string;
};

const labels: Record<MicButtonState, string> = {
  idle: "Ask TrailSense",
  listening: "Listening, tap to stop",
  speaking: "TrailSense is speaking, tap to interrupt",
  unavailable: "Ask TrailSense, voice agent unavailable offline",
};

const looks: Record<MicButtonState, string> = {
  idle: "bg-ts-surface-2 border-ts-accent-bright text-ts-text",
  listening: "bg-ts-accent border-ts-accent-bright text-ts-text",
  speaking: "bg-ts-text border-ts-text text-ts-bg",
  unavailable: "bg-ts-surface-2 border-ts-text-muted text-ts-text-muted",
};

export function MicButton({ state, onPress, size = 112, ariaLabel }: MicButtonProps) {
  const px = Math.max(96, size);
  return (
    <div className="relative shrink-0" style={{ width: px, height: px }}>
      {state === "listening" ? (
        <span
          aria-hidden="true"
          className="ts-pulse absolute inset-0 rounded-full border-[3px] border-ts-accent-bright"
        />
      ) : null}
      <button
        type="button"
        onClick={onPress}
        aria-label={ariaLabel ?? labels[state]}
        aria-pressed={state === "listening" ? true : undefined}
        className={
          "relative flex h-full w-full min-h-touch min-w-touch items-center justify-center rounded-full border-[3px] p-0 " +
          looks[state]
        }
      >
        <Icon
          name={state === "speaking" ? "waveform" : "mic"}
          size={48}
          strokeWidth={state === "speaking" ? 2.4 : 2}
        />
      </button>
    </div>
  );
}
