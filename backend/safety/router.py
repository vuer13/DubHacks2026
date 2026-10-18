"""Safety API routes. Implement fall, location, and SOS logic in this lane."""

import asyncio
import json
import logging
import os
import tempfile
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal, NoReturn
from urllib.parse import quote

import cv2
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import Field

from ..models import (
    FallCheckResponse,
    LocationRequest,
    LocationResponse,
    LocationWriteResponse,
    SosCancelRequest,
    SosCancelResponse,
    SosRequest,
    SosResponse,
    TrailSenseModel,
)
from .fall import FallAssessment, FallSignals, assemble_fall_window, assess
from .sos import cancel_sos as cancel_sos_for_session
from .sos import call_sos as deliver_sos

router = APIRouter(prefix="/api", tags=["safety"])
LOGGER = logging.getLogger(__name__)
SESSION_DIR = Path(__file__).resolve().parents[1] / "data" / "sessions"
_FALL_EVENTS_LOCK = threading.Lock()
MAX_FALL_CLIP_BYTES = 25 * 1024 * 1024
MAX_FALL_WINDOWS = 64
FALL_WINDOW_TTL_SECONDS = 30 * 60


@dataclass
class FallClipWindow:
    segments: deque[tuple[bytes, str]] = field(default_factory=lambda: deque(maxlen=3))
    last_sequence: int = -1
    last_used_at: float = field(default_factory=time.monotonic)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


_FALL_WINDOWS: dict[str, FallClipWindow] = {}
_FALL_WINDOWS_LOCK = threading.Lock()


def _get_fall_window(session_id: str) -> FallClipWindow:
    now = time.monotonic()
    with _FALL_WINDOWS_LOCK:
        expired = [
            key
            for key, window in _FALL_WINDOWS.items()
            if now - window.last_used_at > FALL_WINDOW_TTL_SECONDS
            and not window.lock.locked()
        ]
        for key in expired:
            _FALL_WINDOWS.pop(key, None)

        window = _FALL_WINDOWS.get(session_id)
        if window is None:
            window = FallClipWindow()
            _FALL_WINDOWS[session_id] = window
        window.last_used_at = now

        while len(_FALL_WINDOWS) > MAX_FALL_WINDOWS:
            removable = next(
                (
                    key
                    for key, candidate in _FALL_WINDOWS.items()
                    if key != session_id and not candidate.lock.locked()
                ),
                None,
            )
            if removable is None:
                break
            _FALL_WINDOWS.pop(removable, None)
        return window


class FallSuspectedEvent(TrailSenseModel):
    type: Literal["fall_suspected"] = "fall_suspected"
    t: float = Field(ge=0)
    signals: FallSignals
    confidence: float = Field(ge=0, le=1)


_FALL_EVENTS: dict[str, list[FallSuspectedEvent]] = {}


def _session_events_path(session_id: str) -> Path:
    """Encode session IDs so they cannot escape the sessions directory."""
    return SESSION_DIR / f"{quote(session_id, safe='')}.events.json"


def _record_fall_suspected(session_id: str, assessment: FallAssessment) -> None:
    """Keep the event in memory and persist the session's fall event list."""
    event = FallSuspectedEvent(
        t=time.time(),
        signals=assessment.signals,
        confidence=assessment.confidence,
    )
    event_path = _session_events_path(session_id)

    with _FALL_EVENTS_LOCK:
        events = _FALL_EVENTS.get(session_id)
        if events is None:
            try:
                saved = json.loads(event_path.read_text(encoding="utf-8"))
                events = [FallSuspectedEvent.model_validate(item) for item in saved]
            except FileNotFoundError:
                events = []
            except (json.JSONDecodeError, TypeError, ValueError):
                LOGGER.exception("Could not load saved fall events for session")
                events = []

        events.append(event)
        _FALL_EVENTS[session_id] = events

        temp_path: Path | None = None
        try:
            SESSION_DIR.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(
                mode="w",
                encoding="utf-8",
                dir=SESSION_DIR,
                prefix=".fall-events-",
                suffix=".tmp",
                delete=False,
            ) as temp_file:
                temp_path = Path(temp_file.name)
                json.dump([item.model_dump(mode="json") for item in events], temp_file)
                temp_file.write("\n")
            os.replace(temp_path, event_path)
        except OSError:
            LOGGER.exception("Could not persist fall event for session")
            if temp_path is not None:
                temp_path.unlink(missing_ok=True)


def _todo(feature: str) -> NoReturn:
    raise HTTPException(status_code=501, detail=f"{feature} is not implemented yet")


@router.post("/location", response_model=LocationWriteResponse)
async def record_location(point: LocationRequest) -> LocationWriteResponse:
    """Record a GPS point and check whether the hiker is off trail.

    Example:
        curl -H 'Content-Type: application/json' \\
          -d '{\"session_id\":\"demo\",\"lat\":49.3,\"lng\":-123.1,\"ts\":1}' \\
          http://localhost:8000/api/location
    """
    _todo("Location logging")


@router.get("/location/{session_id}", response_model=LocationResponse)
async def get_location(session_id: str) -> LocationResponse:
    """Return the latest GPS point and recorded track.

    Example: curl http://localhost:8000/api/location/demo
    """
    _todo("Location lookup")


@router.post("/fall/check", response_model=FallCheckResponse)
async def check_for_fall(
    clip: UploadFile = File(...),
    session_id: str = Form(..., min_length=1, max_length=128),
    windowed: bool = Form(False),
    sequence: int | None = Form(None, ge=0),
) -> FallCheckResponse:
    """Assess a clip or append a three-second segment to a rolling fall window.

    Example:
        curl -F 'clip=@fall.webm' -F 'session_id=demo' \\
          http://localhost:8000/api/fall/check

    Sliding-window clients upload three-second clips with the same session ID,
    ``windowed=true``, and a zero-based sequence. After the first three clips,
    each request assesses a nine-second window and advances it by three seconds.

    Example:
        curl -F 'clip=@segment_0.mp4' -F 'session_id=demo' \\
          -F 'windowed=true' -F 'sequence=0' http://localhost:8000/api/fall/check
    """
    try:
        clip_bytes = await clip.read(MAX_FALL_CLIP_BYTES + 1)
        if not clip_bytes:
            raise HTTPException(status_code=400, detail="Uploaded fall clip is empty")
        if len(clip_bytes) > MAX_FALL_CLIP_BYTES:
            raise HTTPException(status_code=413, detail="Fall video segments must be under 25 MB")

        if windowed is True:
            if sequence is None:
                raise HTTPException(
                    status_code=422,
                    detail="Sliding fall windows require a clip sequence number",
                )
            window = _get_fall_window(session_id)
            async with window.lock:
                if sequence != window.last_sequence + 1:
                    window.segments.clear()
                window.segments.append((clip_bytes, clip.filename or "camera.mp4"))
                window.last_sequence = sequence
                window.last_used_at = time.monotonic()
                if len(window.segments) < 3:
                    return FallCheckResponse(fell="unsure", confidence=0.0)

                try:
                    temp_path = await asyncio.to_thread(
                        assemble_fall_window, list(window.segments)
                    )
                except (cv2.error, OSError, ValueError) as exc:
                    raise HTTPException(status_code=422, detail=str(exc)) from exc
                try:
                    assessment = await assess(
                        temp_path,
                        video_segments=[segment for segment, _ in window.segments],
                    )
                except ValueError as exc:
                    raise HTTPException(status_code=400, detail=str(exc)) from exc
                finally:
                    temp_path.unlink(missing_ok=True)
        else:
            suffix = Path(clip.filename or "").suffix.lower()
            if not suffix or len(suffix) > 12 or not suffix[1:].isalnum():
                suffix = ".mp4"
            with tempfile.NamedTemporaryFile(
                prefix="trailsense-fall-", suffix=suffix, delete=False
            ) as temp_file:
                temp_path = Path(temp_file.name)
                temp_file.write(clip_bytes)

            try:
                assessment = await assess(temp_path)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            finally:
                temp_path.unlink(missing_ok=True)

        if assessment.fell in ("yes", "unsure"):
            _record_fall_suspected(session_id, assessment)

        return FallCheckResponse(
            fell=assessment.fell,
            confidence=assessment.confidence,
        )
    finally:
        await clip.close()


@router.post("/sos", response_model=SosResponse)
async def send_sos(request: SosRequest) -> SosResponse:
    """Place an SOS call after the voice check-in flow.

    Example:
        curl -H 'Content-Type: application/json' \\
          -d '{\"session_id\":\"demo\",\"reason\":\"No response to fall check-in\",\\
\"lat\":49.3,\"lng\":-123.1,\"recent_events\":[]}' \\
          http://localhost:8000/api/sos
    """
    result = await deliver_sos(
        session_id=request.session_id,
        reason=request.reason,
        lat=request.lat,
        lng=request.lng,
        recent_events=request.recent_events,
    )
    if not result["sent"]:
        LOGGER.warning("SOS call was not placed: %s", result["reason"])
    return SosResponse(sent=result["sent"], to=result["to"])


@router.post("/sos/cancel", response_model=SosCancelResponse)
async def cancel_sos(request: SosCancelRequest) -> SosCancelResponse:
    """Cancel a pending SOS after the hiker responds.

    Example:
        curl -H 'Content-Type: application/json' \\
          -d '{\"session_id\":\"demo\"}' \\
          http://localhost:8000/api/sos/cancel
    """
    return SosCancelResponse(cancelled=cancel_sos_for_session(request.session_id))
