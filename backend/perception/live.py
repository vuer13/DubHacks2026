"""Running-window video analysis for the mobile camera feed."""

from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import tempfile
from collections import OrderedDict, deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from time import monotonic, perf_counter
from typing import Literal
from urllib.parse import quote

import cv2
import numpy as np
from pydantic import Field

from ..models import (
    ClipEvent,
    ClipResponse,
    ClockDirection,
    Distance,
    Earcon,
    GroundingPoint,
    Haptic,
    Hazard,
    HazardType,
    SignReading,
    SpeakEvent,
    TrailSenseModel,
    TrailState,
)
from .mk1 import get_client, get_model_name

WINDOW_SECONDS = 6.0
LIVE_SEGMENT_SECONDS = 1.0
LIVE_ANALYSIS_STRIDE_SEGMENTS = 2
FRAME_INTERVAL_SECONDS = 0.5
FRAME_LONG_EDGE = 480
MAX_SESSION_COUNT = 64
MAX_SAVED_EVENTS = 10
SESSION_TTL_SECONDS = 30 * 60
SESSION_RESET_GAP_SECONDS = 8.0
SPEECH_REPEAT_SECONDS = 20.0
MODEL_LOG_PATH = Path(__file__).resolve().parents[1] / "data" / "logs" / "perception_model.jsonl"
SESSION_DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "sessions"
LOGGER = logging.getLogger(__name__)


class ModelHazard(TrailSenseModel):
    type: HazardType
    severity: int = Field(strict=True, ge=1, le=3)
    direction: ClockDirection
    distance: Distance
    say: str = Field(min_length=1)
    point: GroundingPoint | None


class ModelClipOutput(TrailSenseModel):
    hazards: list[ModelHazard]
    trail_state: TrailState
    surface: str
    scene: str
    sign: SignReading | None


class InvalidClipError(ValueError):
    """The uploaded file is not a readable short video clip."""


@dataclass
class TimedFrame:
    timestamp_ms: int
    jpeg: bytes


@dataclass
class SessionWindow:
    created_at: float = field(default_factory=monotonic)
    last_used_at: float = field(default_factory=monotonic)
    next_clip_number: int = 1
    last_sequence: int | None = None
    frames: deque[TimedFrame] = field(default_factory=deque)
    events: list[ClipEvent] = field(default_factory=list)
    last_spoken: dict[tuple[str, str], tuple[float, str]] = field(default_factory=dict)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


SESSIONS: OrderedDict[str, SessionWindow] = OrderedDict()


def get_session_window(session_id: str) -> SessionWindow:
    """Return bounded in-memory analysis state for this hike."""
    now = monotonic()
    expired = [
        key
        for key, value in SESSIONS.items()
        if now - value.last_used_at > SESSION_TTL_SECONDS and not value.lock.locked()
    ]
    for key in expired:
        SESSIONS.pop(key, None)

    window = SESSIONS.get(session_id)
    if window is None:
        window = SessionWindow()
        window.events = _load_session_events(session_id)
        SESSIONS[session_id] = window
    else:
        window.last_used_at = now
        SESSIONS.move_to_end(session_id)

    while len(SESSIONS) > MAX_SESSION_COUNT:
        removable_key = next(
            (key for key, value in SESSIONS.items() if not value.lock.locked()),
            None,
        )
        if removable_key is None:
            break
        SESSIONS.pop(removable_key, None)
    return window


def _session_events_path(session_id: str) -> Path:
    return SESSION_DATA_PATH / f"{quote(session_id, safe='')}.perception.json"


def _load_session_events(session_id: str) -> list[ClipEvent]:
    try:
        saved = json.loads(_session_events_path(session_id).read_text(encoding="utf-8"))
        if not isinstance(saved, list):
            raise ValueError("Saved perception events must be a list")
        return [ClipEvent.model_validate(item) for item in saved][-MAX_SAVED_EVENTS:]
    except FileNotFoundError:
        return []
    except (OSError, json.JSONDecodeError, TypeError, ValueError):
        LOGGER.exception("Could not load saved perception events for session")
        return []


def _persist_session_events(session_id: str, events: list[ClipEvent]) -> None:
    temp_path: Path | None = None
    try:
        SESSION_DATA_PATH.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=SESSION_DATA_PATH,
            prefix=".perception-events-",
            suffix=".tmp",
            delete=False,
        ) as temp_file:
            temp_path = Path(temp_file.name)
            json.dump([event.model_dump(mode="json") for event in events[-MAX_SAVED_EVENTS:]], temp_file)
            temp_file.write("\n")
        os.replace(temp_path, _session_events_path(session_id))
    except OSError:
        LOGGER.exception("Could not persist perception events for session")
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)


def decode_clip_frames(clip_bytes: bytes, filename: str) -> tuple[list[tuple[float, bytes]], float]:
    """Sample a short uploaded video at 2 fps and JPEG-encode its frames."""
    suffix = Path(filename).suffix.lower()
    if suffix not in {".mp4", ".mov", ".webm", ".m4v"}:
        suffix = ".mp4"

    temp_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_file:
            temp_file.write(clip_bytes)
            temp_path = temp_file.name

        capture = cv2.VideoCapture(temp_path)
        if not capture.isOpened():
            raise ValueError("Could not open the uploaded camera clip")

        fps = float(capture.get(cv2.CAP_PROP_FPS))
        frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
        if not math.isfinite(fps) or fps <= 0 or frame_count < 2:
            capture.release()
            raise ValueError("Could not read frames from the uploaded camera clip")

        duration = frame_count / fps
        if duration > 10.0:
            capture.release()
            raise ValueError("Camera clips must be 10 seconds or shorter")

        sampled: list[tuple[float, bytes]] = []
        next_sample = 0.0
        frame_index = 0
        try:
            while True:
                ok, frame = capture.read()
                if not ok:
                    break
                frame_time = frame_index / fps
                frame_index += 1
                if frame_time + 1e-6 < next_sample:
                    continue
                next_sample += FRAME_INTERVAL_SECONDS

                height, width = frame.shape[:2]
                scale = FRAME_LONG_EDGE / max(height, width)
                resized = cv2.resize(
                    frame,
                    (max(1, round(width * scale)), max(1, round(height * scale))),
                    interpolation=cv2.INTER_AREA,
                )
                ok, encoded = cv2.imencode(
                    ".jpg", resized, [int(cv2.IMWRITE_JPEG_QUALITY), 80]
                )
                if ok:
                    sampled.append((frame_time, encoded.tobytes()))
        finally:
            capture.release()

        if len(sampled) < 2:
            raise ValueError("Camera clip was too short to analyze")
        return sampled, duration
    finally:
        if temp_path is not None:
            Path(temp_path).unlink(missing_ok=True)


def _request_clip_analysis(frames: list[TimedFrame]) -> ModelClipOutput:
    """Send the rolling image window to Perceptron and validate its JSON."""
    from perceptron import image, video_frames

    video = video_frames(
        [(image(frame.jpeg), frame.timestamp_ms) for frame in frames]
    )
    response = get_client().chat.completions.create(
        model=get_model_name(),
        messages=[
            {
                "role": "user",
                "content": [
                    video,
                    "You are analyzing a chest-mounted camera for a visually impaired hiker. "
                    "These timestamped frames show the recent trail. Identify only visible "
                    "immediate trail hazards from this list: drop_off, steep_descent, water, "
                    "loose_rock, roots_steps, low_branch, fork, mud_ice, wildlife, people. "
                    "Estimate severity 1 (note), 2 (caution), or 3 (stop now), direction by "
                    "clock position, and distance near (<2m), mid (2-6m), or far (>6m). "
                    "Write each warning in at most 6 words, direction first, as a short imperative. "
                    "Use point [x,y] on a 0-1000 image grid when the hazard can be grounded; "
                    "otherwise point is null. Include a one-sentence scene description and the "
                    "visible surface. Include a hazard only when it is clearly visible and on or "
                    "immediately beside the hiker's path. If evidence is uncertain or no hazard "
                    "is visible, return an empty hazards list. Do not infer hazards from motion, "
                    "scene context, or the absence of a clear path.",
                ],
            }
        ],
        response_format={
            "type": "json_schema",
            "json_schema": {
                "name": "trail_clip_analysis",
                "strict": True,
                "schema": ModelClipOutput.model_json_schema(),
            },
        },
        reasoning_effort="low",
    )
    choice = response.choices[0]
    if choice.finish_reason != "stop":
        raise ValueError(f"Perceptron analysis did not finish: {choice.finish_reason}")
    if not isinstance(choice.message.content, str):
        raise ValueError("Perceptron returned no JSON for the trail clip")
    return ModelClipOutput.model_validate_json(choice.message.content, strict=True)


def _direction_from_point(point: GroundingPoint) -> ClockDirection:
    x, _ = point
    if x <= 199:
        return ClockDirection.TEN
    if x <= 399:
        return ClockDirection.ELEVEN
    if x <= 599:
        return ClockDirection.TWELVE
    if x <= 799:
        return ClockDirection.ONE
    return ClockDirection.TWO


def _make_speak_events(
    *, window: SessionWindow, hazards: list[ModelHazard], time_s: float
) -> list[SpeakEvent]:
    distance_rank = {"far": 0, "mid": 1, "near": 2}
    candidates: list[tuple[int, int, ModelHazard, ClockDirection, tuple[str, str]]] = []
    for hazard in hazards:
        direction = (
            _direction_from_point(hazard.point)
            if hazard.point is not None
            else hazard.direction
        )
        key = (hazard.type.value, direction.value)
        previous = window.last_spoken.get(key)
        if previous is not None and time_s - previous[0] < SPEECH_REPEAT_SECONDS:
            continue
        candidates.append(
            (hazard.severity, distance_rank[hazard.distance.value], hazard, direction, key)
        )

    if not candidates:
        return []

    # Speak only the most urgent candidate. Other detected hazards remain in
    # the ClipEvent and can be inspected in the event log.
    _, _, hazard, direction, key = max(candidates, key=lambda item: (item[0], item[1]))
    priority = hazard.severity
    warning = _align_warning_direction(hazard.say, direction)
    earcon: Earcon = (
        Earcon.FORK
        if hazard.type is HazardType.FORK
        else {1: Earcon.NOTE, 2: Earcon.CAUTION, 3: Earcon.STOP}[priority]
    )
    haptic: Haptic = {1: Haptic.SHORT, 2: Haptic.DOUBLE, 3: Haptic.LONG}[priority]
    window.last_spoken[key] = (time_s, hazard.distance.value)
    return [
        SpeakEvent(
            t=time_s,
            priority=priority,
            say=warning,
            earcon=earcon,
            haptic=haptic,
        )
    ]


def _align_warning_direction(say: str, direction: ClockDirection) -> str:
    """Make the spoken left/ahead/right cue agree with the grounded point."""
    direction_word = {
        ClockDirection.TEN: "left",
        ClockDirection.ELEVEN: "left",
        ClockDirection.TWELVE: "ahead",
        ClockDirection.ONE: "right",
        ClockDirection.TWO: "right",
    }[direction]
    words = say.split()
    directional = {"left", "right", "ahead"}
    content = [word for word in words if word.lower().strip(",.!?") not in directional]
    return " ".join([direction_word + ",", *content[:5]])


def _log_model_call(
    *,
    session_id: str,
    clip_id: str,
    sequence: int | None,
    frame_count: int,
    window_start_s: float,
    window_end_s: float,
    latency_ms: int,
    status: Literal["ok", "error"],
    hazards: list[Hazard] | None = None,
    speak: list[SpeakEvent] | None = None,
    error_type: str | None = None,
) -> None:
    hazard_data = [hazard.model_dump(mode="json") for hazard in (hazards or [])]
    speak_data = [item.model_dump(mode="json") for item in (speak or [])]
    record = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "session_id": session_id,
        "clip_id": clip_id,
        "sequence": sequence,
        "model": get_model_name(),
        "reasoning_effort": "low",
        "frame_count": frame_count,
        "window_start_s": window_start_s,
        "window_end_s": window_end_s,
        "latency_ms": latency_ms,
        "status": status,
        "hazards": hazard_data,
        "speak": speak_data,
        "error_type": error_type,
    }
    try:
        MODEL_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with MODEL_LOG_PATH.open("a", encoding="utf-8") as log_file:
            log_file.write(json.dumps(record) + "\n")
    except OSError:
        LOGGER.exception("Could not write Perceptron call log")
    LOGGER.info(
        "Hazard result: clip=%s sequence=%s status=%s hazards=%s latency_ms=%d",
        clip_id,
        sequence,
        status,
        [
            f"{item['type']} severity={item['severity']} direction={item['direction']} "
            f"distance={item['distance']} say={item['say']!r}"
            for item in hazard_data
        ],
        latency_ms,
    )
    LOGGER.info(
        "Hazard decision: source=perceptron warning=%s latency_ms=%d",
        speak_data[0]["say"] if speak_data else "none",
        latency_ms,
    )


async def analyze_live_clip(
    *,
    session_id: str,
    clip_bytes: bytes,
    filename: str,
    window: SessionWindow,
    sequence: int | None = None,
) -> ClipResponse:
    """Append clip frames to the rolling window, analyze, and return events."""
    try:
        sampled, duration = await asyncio.to_thread(decode_clip_frames, clip_bytes, filename)
    except ValueError as exc:
        raise InvalidClipError(str(exc)) from exc
    received_at = monotonic()
    if sequence is not None:
        if sequence == 0 or (
            window.last_sequence is not None
            and (
                sequence <= window.last_sequence
                or sequence - window.last_sequence > LIVE_ANALYSIS_STRIDE_SEGMENTS
            )
        ):
            window.frames.clear()
            window.last_spoken.clear()
        window.last_sequence = sequence
        # Live camera uploads are one-second segments, numbered in capture order.
        clip_start_ms = round(sequence * LIVE_SEGMENT_SECONDS * 1000)
    else:
        if not window.frames:
            window.created_at = received_at - duration
        latest_previous_ms = window.frames[-1].timestamp_ms if window.frames else -1
        clip_start_ms = max(0, int((received_at - window.created_at - duration) * 1000))

        if latest_previous_ms >= 0 and clip_start_ms - latest_previous_ms > SESSION_RESET_GAP_SECONDS * 1000:
            window.frames.clear()
            window.last_spoken.clear()

    for local_time, jpeg in sampled:
        timestamp_ms = clip_start_ms + round(local_time * 1000)
        if window.frames and timestamp_ms <= window.frames[-1].timestamp_ms:
            continue
        window.frames.append(TimedFrame(timestamp_ms=timestamp_ms, jpeg=jpeg))

    if not window.frames:
        raise ValueError("No usable frames were extracted from the camera clip")

    latest_ms = window.frames[-1].timestamp_ms
    cutoff_ms = latest_ms - int(WINDOW_SECONDS * 1000)
    while window.frames and window.frames[0].timestamp_ms < cutoff_ms:
        window.frames.popleft()
    # At 2 fps, 14 frames covers a 6 second window plus clip-boundary rounding.
    while len(window.frames) > 14:
        window.frames.popleft()

    frames = list(window.frames)
    start_s = frames[0].timestamp_ms / 1000
    end_s = frames[-1].timestamp_ms / 1000
    clip_id = f"clip_{window.next_clip_number:06d}"
    window.next_clip_number += 1

    started = perf_counter()
    try:
        model_output = await asyncio.to_thread(_request_clip_analysis, frames)
    except Exception as exc:
        _log_model_call(
            session_id=session_id,
            clip_id=clip_id,
            sequence=sequence,
            frame_count=len(frames),
            window_start_s=start_s,
            window_end_s=end_s,
            latency_ms=round((perf_counter() - started) * 1000),
            status="error",
            error_type=type(exc).__name__,
        )
        raise

    latency_ms = round((perf_counter() - started) * 1000)
    validated_hazards = []
    for hazard in model_output.hazards:
        direction = (
            _direction_from_point(hazard.point)
            if hazard.point is not None
            else hazard.direction
        )
        validated_hazards.append(
            Hazard(
                type=hazard.type,
                severity=hazard.severity,
                direction=direction,
                distance=hazard.distance,
                say=_align_warning_direction(hazard.say, direction),
                point=hazard.point,
            )
        )
    event = ClipEvent(
        clip_id=clip_id,
        t_start=start_s,
        t_end=end_s,
        hazards=validated_hazards,
        trail_state=model_output.trail_state,
        surface=model_output.surface,
        scene=model_output.scene,
        sign=model_output.sign,
        model=get_model_name(),
        latency_ms=latency_ms,
    )
    window.events.append(event)
    window.events = window.events[-MAX_SAVED_EVENTS:]
    _persist_session_events(session_id, window.events)
    speak = _make_speak_events(window=window, hazards=model_output.hazards, time_s=end_s)
    _log_model_call(
        session_id=session_id,
        clip_id=clip_id,
        sequence=sequence,
        frame_count=len(frames),
        window_start_s=start_s,
        window_end_s=end_s,
        latency_ms=latency_ms,
        status="ok",
        hazards=event.hazards,
        speak=speak,
    )
    window.last_used_at = monotonic()
    return ClipResponse(event=event, speak=speak)
