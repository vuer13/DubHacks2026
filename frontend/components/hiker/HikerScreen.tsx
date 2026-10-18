import { EventLog } from "@/components/hiker/EventLog";
import { ShareTile } from "@/components/hiker/ShareTile";
import { HikerStatusZone } from "@/components/hiker/StatusZone";
import { VideoZone } from "@/components/hiker/VideoZone";
import { HealthDot } from "@/components/ui/HealthDot";
import { MicButton } from "@/components/ui/MicButton";
import { PillToggle } from "@/components/ui/PillToggle";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { OFFLINE_TEXT, type HikerState, type HikerView } from "@/lib/ui/state";

export type HikerScreenHandlers = {
  onUseDemo: () => void;
  onVideoSelected: (file: File) => void;
  onTimeUpdate?: (seconds: number) => void;
  onToggleLog: () => void;
  onMicPress: () => void;
  onLiveChange: (on: boolean) => void;
  onLowVisionChange: (on: boolean) => void;
};

export type HikerScreenProps = {
  state: HikerState;
  view: HikerView;
  sessionId?: string;
  videoUrl?: string;
  videoName?: string;
  /** Fixed 390 x 844 frame for the dev gallery; otherwise fills the viewport. */
  framed?: boolean;
  handlers: HikerScreenHandlers;
};

/** The whole hiker screen as a pure render of state and its derived view. */
export function HikerScreen({ state, view, sessionId, videoUrl, videoName, framed = false, handlers }: HikerScreenProps) {
  return (
    <main
      className={
        "flex flex-col overflow-x-hidden bg-ts-bg text-ts-text " +
        (framed ? "h-[844px] w-[390px] shrink-0 overflow-hidden" : "min-h-dvh")
      }
    >
      <header className="flex h-[52px] shrink-0 items-center justify-between px-4 pt-2">
        <span className="text-secondary font-semibold leading-[26px] text-ts-text-muted">TrailSense</span>
        <HealthDot status={view.healthDot} label={view.healthLabel} standalone />
      </header>

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

      {/* Stays mounted while the log is open so its live region keeps announcing. */}
      <div className={state.logOpen ? "sr-only" : "flex min-h-0 flex-1 flex-col"}>
        <HikerStatusZone view={view} {...(sessionId ? { share: <ShareTile sessionId={sessionId} /> } : {})} />
      </div>

      <footer className="flex h-36 shrink-0 items-center justify-between gap-2 border-t-2 border-ts-divider px-4 pb-6 pt-2">
        <PillToggle label="Live" checked={state.mode === "live"} onChange={handlers.onLiveChange} />
        <MicButton state={view.mic} onPress={handlers.onMicPress} />
        <PillToggle label="Low vision" checked={state.lowVision} onChange={handlers.onLowVisionChange} />
      </footer>
    </main>
  );
}
