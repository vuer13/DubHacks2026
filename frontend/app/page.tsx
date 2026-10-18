"use client";

import { type ChangeEvent, useEffect, useState } from "react";

import { checkBackendHealth } from "@/lib/api";

export default function HomePage() {
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoName, setVideoName] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    void checkBackendHealth().then((isOnline) => {
      if (isMounted) {
        setBackendOnline(isOnline);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(
    () => () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    },
    [videoUrl],
  );

  function handleVideoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
    setVideoName(file?.name ?? null);
    setVideoUrl(file ? URL.createObjectURL(file) : null);
  }

  const connectionText =
    backendOnline === null
      ? "Checking backend"
      : backendOnline
        ? "Backend connected"
        : "Backend offline";

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="TrailSense home">
          <span className="brand-mark" aria-hidden="true">
            T
          </span>
          <span>TrailSense</span>
        </a>
        <div
          className={
            backendOnline === true
              ? "connection-status is-online"
              : "connection-status is-offline"
          }
          role="status"
          aria-live="polite"
        >
          <span className="status-dot" aria-hidden="true" />
          {connectionText}
        </div>
      </header>

      <section className="intro">
        <p className="eyebrow">Trail replay</p>
        <h1>Your trail, spoken clearly.</h1>
        <p className="intro-copy">
          Load a hike video to start building the replay experience. Hazard
          events and voice playback will connect here.
        </p>
      </section>

      <section className="workspace" aria-label="Trail replay workspace">
        <div className="video-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Video</p>
              <h2>Trail footage</h2>
            </div>
            <input
              id="trail-video"
              className="visually-hidden"
              type="file"
              accept="video/*"
              onChange={handleVideoChange}
            />
            <label className="upload-button" htmlFor="trail-video">
              Choose video
            </label>
          </div>

          {videoUrl ? (
            <video
              className="video-player"
              controls
              playsInline
              src={videoUrl}
              aria-label={
                videoName ? "Preview of " + videoName : "Trail video"
              }
            />
          ) : (
            <div className="video-empty">
              <span className="play-symbol" aria-hidden="true">
                ▶
              </span>
              <p>Choose a trail video to preview it here.</p>
              <p className="muted-copy">MP4 and WebM videos are supported.</p>
            </div>
          )}

          <div className="video-footer">
            <span>{videoName ?? "No video selected"}</span>
            <span>Event playback is ready to connect</span>
          </div>
        </div>

        <aside className="status-panel" aria-label="Trail status and events">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Hiker status</p>
              <h2>Listening for events</h2>
            </div>
          </div>
          <div className="trail-state">
            <span className="trail-icon" aria-hidden="true">
              ✓
            </span>
            <div>
              <strong>Ready to begin</strong>
              <p>Hazard messages will appear here.</p>
            </div>
          </div>
          <div className="event-list">
            <div className="event-list-heading">
              <h3>Recent events</h3>
              <span>0</span>
            </div>
            <p className="empty-events">
              No trail events yet. Connect the perception API to populate this
              list.
            </p>
          </div>
          <button className="mic-button" type="button" disabled>
            <span aria-hidden="true">●</span>
            Voice assistant coming next
          </button>
        </aside>
      </section>

      <footer className="page-footer">
        <span>Designed for clear, direction-first trail guidance.</span>
        <a href="/share/demo">Open demo share page</a>
      </footer>
    </main>
  );
}
