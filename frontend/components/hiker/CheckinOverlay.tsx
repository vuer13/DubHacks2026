"use client";

import { useEffect, useRef } from "react";

import { CountdownRing } from "@/components/ui/CountdownRing";
import { Icon } from "@/components/ui/icons";
import { StatusZone } from "@/components/ui/StatusZone";
import { CANCELLED_TEXT, CHECKIN_FOOTER_TEXT, CHECKIN_SECONDS, CHECKIN_TEXT, SOS_TEXT } from "@/lib/ui/state";

export type CheckinOverlayProps = {
  seconds: number;
  total?: number;
  onCancel: () => void;
};

/**
 * Frame S1: the whole screen is one button, so any tap cancels. Focus moves
 * here when it opens so VoiceOver and switch users land on it.
 */
export function CheckinOverlay({ seconds, total = CHECKIN_SECONDS, onCancel }: CheckinOverlayProps) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => button.current?.focus({ preventScroll: true }), []);

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Fall detected"
      aria-live="assertive"
      className="absolute inset-0 z-50 flex flex-col bg-black text-ts-sos-bg"
    >
      <button
        ref={button}
        type="button"
        aria-label="Cancel the fall check-in"
        onClick={onCancel}
        className="flex min-h-touch w-full flex-1 flex-col items-center justify-between bg-black px-4 pb-10 pt-14 text-center text-ts-sos-bg [outline-offset:-6px]"
      >
        <p className="m-0 text-hero tracking-[-0.015em] [text-wrap:balance]">{CHECKIN_TEXT}</p>
        <CountdownRing seconds={seconds} total={total} tone="sos" size={240} />
        <p className="m-0 text-label">{CHECKIN_FOOTER_TEXT}</p>
      </button>
    </div>
  );
}

/** Frame S2: the status zone for 3 seconds after a cancel. */
export function CancelledZone() {
  return (
    <StatusZone
      text={CANCELLED_TEXT}
      tone={1}
      word="Cancelled"
      glyph={<Icon name="check" size={28} strokeWidth={2.6} />}
      fullSizeHero
    />
  );
}

/** Frame S3: the status zone while an SOS is out. */
export function SosZone() {
  return <StatusZone text={SOS_TEXT} tone="sos" word="SOS" glyph={<Icon name="phone" size={40} strokeWidth={2.4} />} />;
}
