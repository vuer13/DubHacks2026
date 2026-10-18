"""OpenCV motion clues used by the fall assessor.

This is a low-cost heuristic for finding an abrupt camera movement followed by
stillness. It does not determine by itself whether a person has fallen.
"""

from __future__ import annotations

import math
from math import ceil
from pathlib import Path
from typing import TypedDict

import cv2
import numpy as np


class MotionSignature(TypedDict):
    motion_spike: bool
    static_after: bool
    peak_ratio: float


TARGET_FPS = 10.0
FRAME_SIZE = (64, 36)
BASELINE_SECONDS = 1.0
SPIKE_RATIO = 4.0
STATIC_RATIO = 0.5
STATIC_SECONDS = 1.5

# Pixel-difference means are on a 0..255 scale. This floor prevents tiny
# encoding noise in an otherwise still clip from producing an infinite ratio.
MIN_BASELINE_DIFF = 1.0


def motion_signature(clip_path: str | Path) -> MotionSignature:
    """Measure a motion spike and subsequent stillness in a video clip.

    Frames are sampled at approximately 10 fps, resized to 64x36 grayscale,
    and compared with the preceding sampled frame. A spike is a difference
    greater than 4x the mean difference over the preceding second. Stillness
    is a complete 1.5-second window after a spike whose differences are all
    below half of that spike's pre-event baseline.

    Raises:
        ValueError: If OpenCV cannot open the clip, its frame rate is unknown,
            or it contains too few readable frames to calculate motion.
    """
    capture = cv2.VideoCapture(str(clip_path))
    if not capture.isOpened():
        capture.release()
        raise ValueError(f"Could not open fall clip: {clip_path}")

    source_fps = float(capture.get(cv2.CAP_PROP_FPS))
    if not math.isfinite(source_fps) or source_fps <= 0:
        capture.release()
        raise ValueError("Could not determine the fall clip frame rate")

    sample_fps = min(TARGET_FPS, source_fps)
    frame_diffs: list[float] = []
    previous_gray: np.ndarray | None = None
    frame_index = 0
    next_sample_time = 0.0
    sample_interval = 1.0 / sample_fps

    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                break

            timestamp = frame_index / source_fps
            frame_index += 1
            if timestamp + 1e-9 < next_sample_time:
                continue
            next_sample_time += sample_interval

            small = cv2.resize(frame, FRAME_SIZE, interpolation=cv2.INTER_AREA)
            gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
            if previous_gray is not None:
                difference = cv2.absdiff(gray, previous_gray)
                frame_diffs.append(float(np.mean(difference)))
            previous_gray = gray
    finally:
        capture.release()

    baseline_frames = ceil(BASELINE_SECONDS * sample_fps)
    still_frames = ceil(STATIC_SECONDS * sample_fps)
    if len(frame_diffs) <= baseline_frames:
        raise ValueError("Fall clip is too short to measure motion")

    spike_events: list[tuple[int, float]] = []
    ratios: list[float] = []
    for index in range(baseline_frames, len(frame_diffs)):
        pre_spike_mean = float(np.mean(frame_diffs[index - baseline_frames : index]))
        baseline = max(pre_spike_mean, MIN_BASELINE_DIFF)
        ratio = frame_diffs[index] / baseline
        ratios.append(ratio)
        if ratio > SPIKE_RATIO:
            spike_events.append((index, baseline))

    static_after = False
    for index, baseline in spike_events:
        following = frame_diffs[index + 1 : index + 1 + still_frames]
        if len(following) == still_frames and all(
            difference < STATIC_RATIO * baseline for difference in following
        ):
            static_after = True
            break

    return {
        "motion_spike": bool(spike_events),
        "static_after": static_after,
        "peak_ratio": max(ratios, default=0.0),
    }
