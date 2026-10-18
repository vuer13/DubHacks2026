"""OpenCV motion clues used by the fall assessor.

This is a low-cost heuristic for finding an abrupt camera movement followed by
stillness. It does not determine by itself whether a person has fallen.
"""

from __future__ import annotations

import math
import asyncio
import json
import logging
import os
from math import ceil
from pathlib import Path
from time import perf_counter
from datetime import datetime, timezone
from typing import Literal, TypedDict

import cv2
import numpy as np
from pydantic import Field

from ..models import TrailSenseModel


class MotionSignature(TypedDict):
    motion_spike: bool
    static_after: bool
    peak_ratio: float


FallLabel = Literal["yes", "no", "unsure"]


class FallConfirmation(TrailSenseModel):
    """Strict JSON returned by Perceptron for one fall-confirmation clip."""

    fell: FallLabel
    confidence: float = Field(ge=0, le=1)
    reason: str


class FallSignals(TrailSenseModel):
    motion_spike: bool
    static_after: bool
    vlm: FallLabel | None = None


class FallAssessment(TrailSenseModel):
    fell: FallLabel
    confidence: float = Field(ge=0, le=1)
    signals: FallSignals


TARGET_FPS = 10.0
FRAME_SIZE = (64, 36)
BASELINE_SECONDS = 1.0
SPIKE_RATIO = 4.0
STATIC_RATIO = 0.5
STATIC_SECONDS = 1.5

# Pixel-difference means are on a 0..255 scale. This floor prevents tiny
# encoding noise in an otherwise still clip from producing an infinite ratio.
MIN_BASELINE_DIFF = 1.0
FALL_PROMPT = (
    "This is a chest camera on a hiker, with sound. Did the wearer fall to the "
    "ground during this clip? A stumble with recovery is no. Consider both the "
    "picture and any impact or vocal sounds. Return only the requested JSON."
)
MODEL_LOG_PATH = Path(__file__).resolve().parents[1] / "data" / "logs" / "fall_model.jsonl"
LOGGER = logging.getLogger(__name__)


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


def _request_fall_confirmation(clip_path: str | Path) -> FallConfirmation:
    """Make one synchronous Mk1.5 request; called in a worker thread."""
    from perceptron import video

    from ..perception.mk1 import get_client, get_model_name

    response = get_client().chat.completions.create(
        model=get_model_name(),
        messages=[{"role": "user", "content": [video(str(clip_path)), FALL_PROMPT]}],
        response_format={
            "type": "json_schema",
            "json_schema": {
                "name": "fall_confirmation",
                "strict": True,
                "schema": FallConfirmation.model_json_schema(),
            },
        },
        reasoning_effort="high",
        vision_config={"enable_audio_in_video": True},
    )

    if response.choices[0].finish_reason != "stop":
        raise ValueError(
            "Perceptron fall confirmation did not finish: "
            f"{response.choices[0].finish_reason}"
        )

    content = response.choices[0].message.content
    if not isinstance(content, str):
        raise ValueError("Perceptron returned empty fall confirmation JSON")
    return FallConfirmation.model_validate_json(content, strict=True)


def _log_model_call(
    *,
    clip_path: str | Path,
    latency_ms: int,
    status: Literal["ok", "error"],
    fell: FallLabel | None = None,
    confidence: float | None = None,
    error_type: str | None = None,
) -> None:
    """Append metadata for each model call without storing footage or secrets."""
    entry: dict[str, object] = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "model": os.getenv("PERCEPTRON_MODEL", "perceptron-mk1.5"),
        "operation": "fall_confirmation",
        "clip": Path(clip_path).name,
        "latency_ms": latency_ms,
        "status": status,
    }
    if fell is not None:
        entry["fell"] = fell
    if confidence is not None:
        entry["confidence"] = confidence
    if error_type is not None:
        entry["error_type"] = error_type

    try:
        MODEL_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with MODEL_LOG_PATH.open("a", encoding="utf-8") as log_file:
            log_file.write(json.dumps(entry) + "\n")
    except OSError:
        LOGGER.exception("Could not write Perceptron fall-call log")


async def vlm_confirm(clip_path: str | Path) -> tuple[FallLabel, float]:
    """Ask Mk1.5 whether a hiker fell, using video and its audio track.

    The blocking SDK request runs in a worker thread so this coroutine does not
    block FastAPI's event loop. Invalid or incomplete model output is rejected.
    """
    path = Path(clip_path)
    if not path.is_file():
        raise ValueError(f"Fall clip does not exist: {path}")

    started = perf_counter()
    try:
        confirmation = await asyncio.to_thread(_request_fall_confirmation, path)
    except Exception as exc:
        _log_model_call(
            clip_path=path,
            latency_ms=round((perf_counter() - started) * 1000),
            status="error",
            error_type=type(exc).__name__,
        )
        raise

    _log_model_call(
        clip_path=path,
        latency_ms=round((perf_counter() - started) * 1000),
        status="ok",
        fell=confirmation.fell,
        confidence=confirmation.confidence,
    )
    return confirmation.fell, confirmation.confidence


async def assess(clip_path: str | Path) -> FallAssessment:
    """Combine OpenCV motion clues with an Mk1.5 confirmation when warranted."""
    signature = await asyncio.to_thread(motion_signature, clip_path)
    motion_spike = signature["motion_spike"]
    static_after = signature["static_after"]

    if not motion_spike and not static_after:
        return FallAssessment(
            fell="no",
            confidence=0.0,
            signals=FallSignals(
                motion_spike=False,
                static_after=False,
                vlm=None,
            ),
        )

    try:
        vlm_result, confidence = await vlm_confirm(clip_path)
    except Exception:
        # The app remains usable if the model or network is unavailable.
        vlm_result = "unsure"
        confidence = 0.0

    supporting_signals = sum(
        (motion_spike, static_after, vlm_result == "yes")
    )
    if supporting_signals >= 2:
        fell: FallLabel = "yes"
    elif vlm_result == "unsure" and (motion_spike or static_after):
        fell = "unsure"
    else:
        fell = "no"

    return FallAssessment(
        fell=fell,
        confidence=confidence,
        signals=FallSignals(
            motion_spike=motion_spike,
            static_after=static_after,
            vlm=vlm_result,
        ),
    )
