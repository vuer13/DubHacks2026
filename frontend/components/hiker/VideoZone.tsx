"use client";

import { type ChangeEvent, useRef } from "react";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { SecondaryButton } from "@/components/ui/SecondaryButton";
import type { HikerMode } from "@/lib/ui/state";

export type VideoZoneProps = {
  mode: HikerMode;
  videoUrl?: string;
  videoName?: string;
  analysing: boolean;
  onUseDemo: () => void;
  onVideoSelected: (file: File) => void;
  onTimeUpdate?: (seconds: number) => void;
};

/** The 16:9 zone: idle buttons, the playing video, or the live preview placeholder. */
export function VideoZone({ mode, videoUrl, videoName, analysing, onUseDemo, onVideoSelected, onTimeUpdate }: VideoZoneProps) {
  const fileInput = useRef<HTMLInputElement>(null);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) onVideoSelected(file);
    event.target.value = "";
  }

  let body;
  if (mode === "live") {
    // Placeholder until Step B5 adds the camera preview.
    body = (
      <div
        role="img"
        aria-label={analysing ? "Live camera preview, analysing" : "Live camera preview"}
        className="relative flex h-full items-center justify-center text-meta text-ts-text-muted"
      >
        <span aria-hidden="true">Camera preview</span>
        {analysing ? (
          <div className="absolute bottom-3 right-3 flex h-10 items-center gap-2.5 rounded-pill border-2 border-ts-divider bg-ts-bg px-3.5 text-meta font-semibold text-ts-text">
            <span aria-hidden="true" className="ts-blink h-3 w-3 rounded-full bg-ts-accent-bright" />
            <span>Analysing</span>
          </div>
        ) : null}
      </div>
    );
  } else if (mode === "replay" && videoUrl) {
    body = (
      <video
        className="h-full w-full bg-black object-contain"
        src={videoUrl}
        controls
        playsInline
        aria-label={videoName ? "Trail video, " + videoName : "Trail video"}
        onTimeUpdate={(event) => onTimeUpdate?.(event.currentTarget.currentTime)}
      />
    );
  } else if (mode === "replay") {
    // Replay state without a file (dev gallery fixtures).
    body = (
      <div role="img" aria-label="Trail footage" className="flex h-full items-center justify-center text-meta text-ts-text-muted">
        <span aria-hidden="true">Trail footage</span>
      </div>
    );
  } else {
    body = (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
        <div className="flex w-[280px] max-w-full flex-col gap-3">
          <PrimaryButton label="Use demo hike" ariaLabel="Use the demo hike" onPress={onUseDemo} />
          <SecondaryButton
            label="Load video"
            ariaLabel="Load a video from this phone"
            onPress={() => fileInput.current?.click()}
          />
        </div>
      </div>
    );
  }

  return (
    <section aria-label="Trail video" className="aspect-video w-full shrink-0 overflow-hidden bg-ts-surface">
      {body}
      <input ref={fileInput} type="file" accept="video/*" hidden onChange={handleChange} />
    </section>
  );
}
