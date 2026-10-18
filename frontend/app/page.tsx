"use client";

import { type ChangeEvent, useEffect, useRef, useState } from "react";

import { EventLogPanel } from "@/components/ui/EventLogPanel";
import type { EventRowProps } from "@/components/ui/EventRow";
import { HealthDot, type HealthStatus } from "@/components/ui/HealthDot";
import { MicButton } from "@/components/ui/MicButton";
import { PillToggle } from "@/components/ui/PillToggle";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { SecondaryButton } from "@/components/ui/SecondaryButton";
import { StatusZone } from "@/components/ui/StatusZone";
import { checkBackendHealth } from "@/lib/api";

const HEALTH_POLL_MS = 5000;

const healthLabels: Record<HealthStatus, string> = {
  ok: "Backend connected",
  fail: "Backend offline",
  off: "Checking backend",
};

// Later app-and-voice steps wire these; for now they render and do nothing.
function notWiredYet() {}

export default function HomePage() {
  const [health, setHealth] = useState<HealthStatus>("off");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoName, setVideoName] = useState<string | null>(null);
  const [logExpanded, setLogExpanded] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const events: EventRowProps[] = [];

  // Poll GET /health every 5 seconds through lib/api.ts.
  useEffect(() => {
    let active = true;
    const poll = async () => {
      const online = await checkBackendHealth();
      if (active) setHealth(online ? "ok" : "fail");
    };
    void poll();
    const timer = window.setInterval(() => void poll(), HEALTH_POLL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(
    () => () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    },
    [videoUrl],
  );

  function handleVideoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoName(file?.name ?? null);
    setVideoUrl(file ? URL.createObjectURL(file) : null);
    event.target.value = "";
  }

  return (
    <main className="flex min-h-dvh flex-col overflow-x-hidden bg-ts-bg text-ts-text">
      <header className="flex h-[52px] shrink-0 items-center justify-between px-4 pt-2">
        <span className="text-secondary font-semibold leading-[26px] text-ts-text-muted">TrailSense</span>
        <HealthDot status={health} label={healthLabels[health]} standalone />
      </header>

      <section aria-label="Trail video" className="aspect-video w-full shrink-0 bg-ts-surface">
        {videoUrl ? (
          <video
            className="h-full w-full bg-black object-contain"
            src={videoUrl}
            controls
            playsInline
            aria-label={videoName ? "Trail video, " + videoName : "Trail video"}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
            <div className="flex w-[280px] max-w-full flex-col gap-3">
              <PrimaryButton label="Use demo hike" ariaLabel="Use the demo hike" onPress={notWiredYet} />
              <SecondaryButton
                label="Load video"
                ariaLabel="Load a video from this phone"
                onPress={() => fileInput.current?.click()}
              />
            </div>
          </div>
        )}
        <input ref={fileInput} type="file" accept="video/*" hidden onChange={handleVideoChange} />
      </section>

      <EventLogPanel
        events={events}
        expanded={logExpanded}
        newCount={0}
        onToggle={() => setLogExpanded((open) => !open)}
      />

      {/* Stays mounted while the log is open so its live region keeps announcing. */}
      <div className={logExpanded ? "sr-only" : "flex min-h-0 flex-1 flex-col"}>
        <StatusZone text="Ready. Tap the mic to talk." tone="plain" />
      </div>

      <footer className="flex h-36 shrink-0 items-center justify-between gap-2 border-t-2 border-ts-divider px-4 pb-6 pt-2">
        <PillToggle label="Live" checked={false} onChange={notWiredYet} />
        <MicButton state="idle" onPress={notWiredYet} />
        <PillToggle label="Low vision" checked={false} onChange={notWiredYet} />
      </footer>
    </main>
  );
}
