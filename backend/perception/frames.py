"""Cut videos into frames and keep a running window of the newest ones."""

import os
import subprocess
from dataclasses import dataclass
from pathlib import Path

# Settings. Each can be overridden with an environment variable.
FRAME_FPS = float(os.getenv("FRAME_FPS", "2"))
WINDOW_S = float(os.getenv("WINDOW_S", "3"))
STRIDE_S = float(os.getenv("STRIDE_S", "1.5"))


@dataclass(frozen=True)
class Frame:
    """One still picture and when it happened (milliseconds from video start)."""

    jpeg_path: Path
    t_ms: int


def extract_frames(
    video_path: str | Path,
    out_dir: str | Path,
    fps: float = FRAME_FPS,
    height: int = 480,
    start_s: float = 0.0,
) -> list[Frame]:
    """Cut a video into JPEG pictures using ffmpeg.

    out_dir is the folder the pictures are saved in.
    start_s shifts the timestamps, so a chunk that begins 12 s into a hike
    gets timestamps starting at 12000 ms instead of 0.
    """
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("f_*.jpg"):
        old.unlink()

    subprocess.run(
        [
            "ffmpeg", "-y", "-loglevel", "error",
            "-i", str(video_path),
            "-vf", f"fps={fps},scale=-2:{height}",
            str(out / "f_%05d.jpg"),
        ],
        check=True,
    )

    step_ms = 1000.0 / fps
    paths = sorted(out.glob("f_*.jpg"))
    return [
        Frame(jpeg_path=p, t_ms=int(start_s * 1000 + i * step_ms))
        for i, p in enumerate(paths)
    ]


class RunningWindow:
    """Holds only the newest `seconds` of frames."""

    def __init__(self, seconds: float = WINDOW_S) -> None:
        self.window_ms = int(seconds * 1000)
        self._frames: list[Frame] = []

    def push(self, frames: list[Frame]) -> None:
        """Add new frames, then drop any that are too old."""
        self._frames.extend(frames)
        self._frames.sort(key=lambda f: f.t_ms)
        if self._frames:
            newest = self._frames[-1].t_ms
            self._frames = [
                f for f in self._frames if f.t_ms > newest - self.window_ms
            ]

    def frames(self) -> list[Frame]:
        """The current window, oldest first."""
        return list(self._frames)

    def latest(self) -> Frame | None:
        """The newest frame, or None if the window is empty."""
        return self._frames[-1] if self._frames else None
