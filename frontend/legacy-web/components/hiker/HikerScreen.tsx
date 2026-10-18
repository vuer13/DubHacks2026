"use client";

import { useEffect, useRef } from "react";

import { CancelledZone, CheckinOverlay, SosZone } from "@/components/hiker/CheckinOverlay";
import { EventLog } from "@/components/hiker/EventLog";
import { LowVisionView } from "@/components/hiker/LowVisionView";
import { ShareTile } from "@/components/hiker/ShareTile";
import { HikerStatusZone } from "@/components/hiker/StatusZone";
import { VideoZone } from "@/components/hiker/VideoZone";
import { HealthDot } from "@/components/ui/HealthDot";
import { MicButton } from "@/components/ui/MicButton";
import { PillToggle } from "@/components/ui/PillToggle";
import { StatusBanner } from "@/components/ui/StatusBanner";
import type { LowVisionView as LowVisionViewModel } from "@/lib/ui/lowvision";
import { OFFLINE_TEXT, formatClockTime, type HikerState, type HikerView } from "@/lib/ui/state";

export type HikerScreenHandlers = {
  onUseDemo: () => void;
  onVideoSelected: (file: File) => void;
  onTimeUpdate?: (seconds: number) => void;
  onToggleLog: () => void;
  onMicPress: () => void;
  onLiveChange: (on: boolean) => void;
  onLowVisionChange: (on: boolean) => void;
  onCheckinCancel: () => void;
  onSosCancel: () => void;
  /** Development only: starts a 20 second check-in. Omit to hide the button. */
  onTestCheckin?: () => void;
};

export type HikerScreenProps = {
  state: HikerState;
  view: HikerView;
  lowVision: LowVisionViewModel;
  sessionId?: string;
  videoUrl?: string;
  videoName?: string;
  /** Fixed 390 x 844 frame for the dev gallery; otherwise fills the viewport. */
  framed?: boolean;
  handlers: HikerScreenHandlers;
};

/** The whole hiker screen as a pure render of state and its derived views. */
export function HikerScreen({
  state,
  view,
  lowVision,
  sessionId,
  videoUrl,
  videoName,
  framed = false,
  handlers,
}: HikerScreenProps) {
  const content = useRef<HTMLDivElement>(null);
  const counting = state.checkin === "counting";
  const sos = state.checkin === "sos_sent";
  // Low-vision mode covers everything except the safety screens (S2, S3 still show normally).
  const lowVisionOn = state.lowVision && !sos && state.checkin !== "cancelled";

  // While the check-in overlay is up, nothing underneath can be reached.
  useEffect(() => {
    if (content.current) content.current.inert = counting;
  }, [counting]);

  return (
    <main
      className={
        "relative flex flex-col overflow-x-hidden bg-ts-bg text-ts-text " +
        (framed ? "h-[844px] w-[390px] shrink-0 overflow-hidden" : "min-h-dvh")
      }
    >
      <div ref={content} aria-hidden={counting || undefined} className="flex min-h-0 flex-1 flex-col">
        {lowVisionOn ? <LowVisionView view={lowVision} onLowVisionChange={handlers.onLowVisionChange} /> : null}

        {/* Hidden, not unmounted, in low-vision mode so a replay keeps playing. */}
        <div className={lowVisionOn ? "hidden" : "flex min-h-0 flex-1 flex-col"}>
          <header className="flex h-[52px] shrink-0 items-center justify-between px-4 pt-2">
            <span className="text-secondary font-semibold leading-[26px] text-ts-text-muted">TrailSense</span>
            <HealthDot status={view.healthDot} label={view.healthLabel} standalone />
          </header>

          {sos && state.sosSentAt !== undefined ? (
            <StatusBanner
              tone="sos"
              text={"Help contacted at " + formatClockTime(state.sosSentAt)}
              action={{ label: "Cancel SOS", ariaLabel: "Cancel SOS, asks you to confirm", onPress: handlers.onSosCancel }}
            />
          ) : null}

          {/* Frame S3 has no video zone or log; they stay mounted so playback is not lost. */}
          <div className={sos ? "hidden" : "contents"}>
            <VideoZone
              mode={state.mode}
              {...(videoUrl ? { videoUrl } : {})}
              {...(videoName ? { videoName } : {})}
              analysing={state.analysing}
              onUseDemo={handlers.onUseDemo}
              onVideoSelected={handlers.onVideoSelected}
              {...(handlers.onTimeUpdate ? { onTimeUpdate: handlers.onTimeUpdate } : {})}
            />
            <EventLog log={state.log} open={state.logOpen} newCount={view.newCount} onToggle={handlers.onToggleLog} />
            {view.offline ? (
              <div className="mx-4 mt-4 shrink-0">
                <StatusBanner tone="offline" text={OFFLINE_TEXT} />
              </div>
            ) : null}
          </div>

          {/* Stays mounted while the log is open so its live region keeps announcing. */}
          <div className={state.logOpen && !sos ? "sr-only" : "flex min-h-0 flex-1 flex-col"}>
            {sos ? (
              <SosZone />
            ) : state.checkin === "cancelled" ? (
              <CancelledZone />
            ) : (
              <HikerStatusZone view={view} {...(sessionId ? { share: <ShareTile sessionId={sessionId} /> } : {})} />
            )}
          </div>

          <footer className="flex h-36 shrink-0 items-center justify-between gap-2 border-t-2 border-ts-divider px-4 pb-6 pt-2">
            <PillToggle label="Live" checked={state.mode === "live"} onChange={handlers.onLiveChange} />
            <MicButton state={view.mic} onPress={handlers.onMicPress} />
            <PillToggle label="Low vision" checked={state.lowVision} onChange={handlers.onLowVisionChange} />
          </footer>
        </div>
      </div>

      {counting ? <CheckinOverlay seconds={state.countdownSeconds} onCancel={handlers.onCheckinCancel} /> : null}

      {/* The NODE_ENV check lets production builds drop this button entirely. */}
      {process.env.NODE_ENV !== "production" && handlers.onTestCheckin && !counting ? (
        <button
          type="button"
          onClick={handlers.onTestCheckin}
          className="fixed right-4 top-[60px] z-40 min-h-touch min-w-touch rounded-control border-[3px] border-dashed border-ts-sos-bg bg-black px-4 text-meta font-semibold text-ts-sos-bg"
        >
          Test check-in
        </button>
      ) : null}
    </main>
  );
}
