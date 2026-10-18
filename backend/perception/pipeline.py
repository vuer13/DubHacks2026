"""Turn a whole trail video into a job file: events plus spoken warnings.

Run from the project root:
    python -m backend.perception.pipeline footage/test-video.MOV --job test
"""

import argparse
import asyncio
from pathlib import Path

import backend.config  # noqa: F401  (loads the root .env)

from ..models import ClipEvent, JobResponse
from .frames import STRIDE_S, WINDOW_S, Frame, extract_frames
from .mk1 import analyze_window
from .smoothing import run_smoother

DATA_DIR = Path(__file__).resolve().parents[1] / "data"


def make_windows(frames: list[Frame]) -> list[tuple[str, list[Frame]]]:
    """Slide a window along the video.

    One tick every STRIDE_S seconds. Each tick's window holds the frames
    from (tick - WINDOW_S) up to tick. Early ticks get partial windows.
    Windows with fewer than 2 frames are skipped, because the model
    needs at least 2.
    """
    if not frames:
        return []
    last_ms = frames[-1].t_ms
    stride_ms = int(STRIDE_S * 1000)
    window_ms = int(WINDOW_S * 1000)

    windows: list[tuple[str, list[Frame]]] = []
    tick_ms = stride_ms
    while tick_ms <= last_ms + stride_ms:
        chunk = [f for f in frames if tick_ms - window_ms < f.t_ms <= tick_ms]
        if len(chunk) >= 2:
            windows.append((f"clip_{len(windows) + 1:04d}", chunk))
        tick_ms += stride_ms
    return windows


async def analyze_video(
    video_path: Path, job_id: str, concurrency: int = 4
) -> list[ClipEvent]:
    """Run analyze_window over every window and save progress as we go."""
    frames_dir = DATA_DIR / "frames" / job_id
    frames = await asyncio.to_thread(extract_frames, video_path, frames_dir)
    windows = make_windows(frames)
    print(f"{len(frames)} frames, {len(windows)} windows")

    job_path = DATA_DIR / "jobs" / f"{job_id}.json"
    job_path.parent.mkdir(parents=True, exist_ok=True)

    semaphore = asyncio.Semaphore(concurrency)
    results: list[ClipEvent | None] = [None] * len(windows)

    def save(status: str) -> None:
        """Write the job file: status, events so far, and spoken warnings."""
        done = [e for e in results if e is not None]
        # The smoother needs events in order with no gaps, so it only sees
        # the unbroken run of finished windows from the start.
        prefix: list[ClipEvent] = []
        for e in results:
            if e is None:
                break
            prefix.append(e)
        job = JobResponse(
            status=status, events=done, speak=run_smoother(prefix)
        )
        job_path.write_text(job.model_dump_json(indent=2))

    async def run(index: int, clip_id: str, chunk: list[Frame]) -> None:
        async with semaphore:
            results[index] = await analyze_window(chunk, clip_id=clip_id)
            save("running")
            print(f"  done {clip_id}")

    try:
        await asyncio.gather(
            *(run(i, cid, chunk) for i, (cid, chunk) in enumerate(windows))
        )
    except Exception:
        save("error")
        raise
    save("done")
    return [e for e in results if e is not None]


def print_summary(events: list[ClipEvent]) -> None:
    print(f"\n{'clip':<10}{'start':>7}{'end':>7}{'n':>3}  {'top hazard':<22}{'ms':>6}")
    for e in events:
        top = max(e.hazards, key=lambda h: h.severity, default=None)
        label = f"{top.type.value} (s{top.severity})" if top else "-"
        print(
            f"{e.clip_id:<10}{e.t_start:>7.1f}{e.t_end:>7.1f}"
            f"{len(e.hazards):>3}  {label:<22}{e.latency_ms:>6}"
        )

    speak = run_smoother(events)
    print(f"\n{len(speak)} spoken warnings")
    for s in speak:
        print(f"  t={s.t:>6.1f}  priority {s.priority}  {s.say}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("video")
    parser.add_argument("--job", required=True)
    parser.add_argument("--concurrency", type=int, default=4)
    args = parser.parse_args()
    events = asyncio.run(
        analyze_video(Path(args.video), args.job, args.concurrency)
    )
    print_summary(events)


if __name__ == "__main__":
    main()
