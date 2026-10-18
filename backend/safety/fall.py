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
    max_flow: float
    end_flow: float
    peak_vertical_flow: float
    rotation_change_deg: float | None
    opencv_fall_suspected: bool


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
FRAME_LONG_EDGE = 320
BASELINE_SECONDS = 1.0
END_SECONDS = 1.0
HIGH_MOTION = 6.0
LOW_MOTION = 1.5
VERTICAL_SWEEP_LIMIT = 5.0
ROTATION_LIMIT_DEG = 20.0
MIN_ORB_MATCHES = 8
FALL_PROMPT = (
    "This is a chest camera on a hiker, with sound. Did the wearer fall to the "
    "ground during this clip? A stumble with recovery is no. Consider both the "
    "picture and any impact or vocal sounds. Return only the requested JSON."
)
MODEL_LOG_PATH = Path(__file__).resolve().parents[1] / "data" / "logs" / "fall_model.jsonl"
LOGGER = logging.getLogger(__name__)


def motion_signature(clip_path: str | Path) -> MotionSignature:
    """Extract whole-clip optical-flow and camera-rotation features.

    Frames are sampled at up to 10 fps and resized with their aspect ratio
    preserved so the longest edge is 320 pixels. Farneback optical flow gives
    an average pixel displacement per sampled frame. ``max_flow`` is the
    largest displacement in the clip; ``end_flow`` averages the last second.
    ORB matches estimate camera rotation from about one second before the
    largest movement to the final frame.

    The initial OpenCV rule requires high peak flow, low end flow, and a
    measurable rotation above ``ROTATION_LIMIT_DEG``. These are starter
    thresholds for inspection and tuning on labeled fall and non-fall clips.

    Raises:
        ValueError: If OpenCV cannot open the clip, its frame rate is unknown,
            or it is too short to calculate motion across the baseline and end.
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
    frames: list[np.ndarray] = []
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

            height, width = frame.shape[:2]
            scale = FRAME_LONG_EDGE / max(height, width)
            resized_size = (
                max(1, round(width * scale)),
                max(1, round(height * scale)),
            )
            resized = cv2.resize(frame, resized_size, interpolation=cv2.INTER_AREA)
            frames.append(cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY))
    finally:
        capture.release()

    if len(frames) < 2:
        raise ValueError("Fall clip is too short to measure motion")

    flow_magnitudes: list[float] = []
    vertical_flow_means: list[float] = []
    for before, after in zip(frames, frames[1:]):
        flow = cv2.calcOpticalFlowFarneback(
            before,
            after,
            None,
            pyr_scale=0.5,
            levels=3,
            winsize=15,
            iterations=3,
            poly_n=5,
            poly_sigma=1.2,
            flags=0,
        )
        magnitude, _ = cv2.cartToPolar(flow[..., 0], flow[..., 1])
        flow_magnitudes.append(float(np.mean(magnitude)))
        vertical_flow_means.append(float(np.mean(flow[..., 1])))

    baseline_frames = ceil(BASELINE_SECONDS * sample_fps)
    end_frames = max(1, ceil(END_SECONDS * sample_fps))
    if len(flow_magnitudes) < baseline_frames + end_frames:
        raise ValueError("Fall clip is too short to measure motion")

    max_flow_index = int(np.argmax(flow_magnitudes))
    max_flow = flow_magnitudes[max_flow_index]
    end_flow = float(np.mean(flow_magnitudes[-end_frames:]))
    peak_vertical_flow = vertical_flow_means[max_flow_index]
    motion_spike = max_flow > HIGH_MOTION
    static_after = end_flow < LOW_MOTION

    before_spike_index = max(0, max_flow_index - baseline_frames)
    rotation_change_deg = _estimate_rotation_degrees(
        frames[before_spike_index], frames[-1]
    )
    strong_camera_change = (
        abs(peak_vertical_flow) > VERTICAL_SWEEP_LIMIT
        or (
            rotation_change_deg is not None
            and rotation_change_deg > ROTATION_LIMIT_DEG
        )
    )
    opencv_fall_suspected = (
        motion_spike
        and static_after
        # ORB can fail on blur or a featureless final view. In that case, keep
        # high-flow plus post-event stillness as a weaker candidate signal.
        and (strong_camera_change or rotation_change_deg is None)
    )

    return {
        "motion_spike": motion_spike,
        "static_after": static_after,
        "max_flow": max_flow,
        "end_flow": end_flow,
        "peak_vertical_flow": peak_vertical_flow,
        "rotation_change_deg": rotation_change_deg,
        "opencv_fall_suspected": opencv_fall_suspected,
    }


def _estimate_rotation_degrees(before: np.ndarray, after: np.ndarray) -> float | None:
    """Estimate absolute scene rotation using ORB matches and a robust affine fit."""
    orb = cv2.ORB_create(nfeatures=800)
    before_points, before_descriptors = orb.detectAndCompute(before, None)
    after_points, after_descriptors = orb.detectAndCompute(after, None)
    if before_descriptors is None or after_descriptors is None:
        return None

    matcher = cv2.BFMatcher(cv2.NORM_HAMMING)
    pairs = matcher.knnMatch(before_descriptors, after_descriptors, k=2)
    matches = [
        first
        for pair in pairs
        if len(pair) == 2
        for first, second in [pair]
        if first.distance < 0.75 * second.distance
    ]
    if len(matches) < MIN_ORB_MATCHES:
        return None

    source = np.float32([before_points[match.queryIdx].pt for match in matches])
    target = np.float32([after_points[match.trainIdx].pt for match in matches])
    affine, inliers = cv2.estimateAffinePartial2D(
        source,
        target,
        method=cv2.RANSAC,
        ransacReprojThreshold=3.0,
    )
    if affine is None or inliers is None or int(np.sum(inliers)) < MIN_ORB_MATCHES:
        return None

    angle = math.degrees(math.atan2(float(affine[1, 0]), float(affine[0, 0])))
    return abs(angle)


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
    """Run OpenCV feature extraction and ask Mk1.5 to classify every clip."""
    try:
        signature = await asyncio.to_thread(motion_signature, clip_path)
    except (ValueError, cv2.error) as exc:
        # OpenCV is supplemental: a decode or feature error must not veto Mk1.5.
        LOGGER.warning("OpenCV fall features unavailable: %s", exc)
        motion_spike = False
        static_after = False
    else:
        motion_spike = signature["motion_spike"]
        static_after = signature["static_after"]
        LOGGER.info(
            "OpenCV fall features: max_flow=%.3f end_flow=%.3f "
            "peak_vertical_flow=%.3f rotation_change_deg=%s "
            "opencv_fall_suspected=%s",
            signature["max_flow"],
            signature["end_flow"],
            signature["peak_vertical_flow"],
            (
                f"{signature['rotation_change_deg']:.1f}"
                if signature["rotation_change_deg"] is not None
                else "unavailable"
            ),
            signature["opencv_fall_suspected"],
        )

    try:
        vlm_result, confidence = await vlm_confirm(clip_path)
    except Exception:
        # The app remains usable if the model or network is unavailable.
        vlm_result = "unsure"
        confidence = 0.0

    if vlm_result == "yes":
        fell: FallLabel = "yes"
    elif vlm_result == "unsure":
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
