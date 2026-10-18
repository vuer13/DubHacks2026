"""Safety API routes. Implement fall, location, and SOS logic in this lane."""

import json
import logging
import os
import tempfile
import threading
import time
from pathlib import Path
from typing import Literal, NoReturn
from urllib.parse import quote

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
from .fall import FallAssessment, FallSignals, assess

router = APIRouter(prefix="/api", tags=["safety"])
LOGGER = logging.getLogger(__name__)
SESSION_DIR = Path(__file__).resolve().parents[1] / "data" / "sessions"
_FALL_EVENTS_LOCK = threading.Lock()


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
) -> FallCheckResponse:
    """Assess a clip for a fall.

    Example:
        curl -F 'clip=@fall.webm' -F 'session_id=demo' \\
          http://localhost:8000/api/fall/check
    """
    suffix = Path(clip.filename or "").suffix.lower()
    if not suffix or len(suffix) > 12 or not suffix[1:].isalnum():
        suffix = ".mp4"

    temp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            prefix="trailsense-fall-", suffix=suffix, delete=False
        ) as temp_file:
            temp_path = Path(temp_file.name)
            while chunk := await clip.read(1024 * 1024):
                temp_file.write(chunk)

        if temp_path.stat().st_size == 0:
            raise HTTPException(status_code=400, detail="Uploaded fall clip is empty")

        try:
            assessment = await assess(temp_path)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        if assessment.fell in ("yes", "unsure"):
            _record_fall_suspected(session_id, assessment)

        return FallCheckResponse(
            fell=assessment.fell,
            confidence=assessment.confidence,
        )
    finally:
        await clip.close()
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)


@router.post("/sos", response_model=SosResponse)
async def send_sos(request: SosRequest) -> SosResponse:
    """Request an SOS message after the voice check-in flow.

    Example:
        curl -H 'Content-Type: application/json' \\
          -d '{\"session_id\":\"demo\",\"reason\":\"No response to fall check-in\",\\
\"lat\":49.3,\"lng\":-123.1,\"recent_events\":[]}' \\
          http://localhost:8000/api/sos
    """
    _todo("SOS delivery")


@router.post("/sos/cancel", response_model=SosCancelResponse)
async def cancel_sos(request: SosCancelRequest) -> SosCancelResponse:
    """Cancel a pending SOS after the hiker responds.

    Example:
        curl -H 'Content-Type: application/json' \\
          -d '{\"session_id\":\"demo\"}' \\
          http://localhost:8000/api/sos/cancel
    """
    _todo("SOS cancellation")
