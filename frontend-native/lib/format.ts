/** Hike time as m:ss, as the handoff's EventRow `t` expects (not wall-clock). */
export function formatHikeTime(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return minutes + ":" + String(seconds).padStart(2, "0");
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
