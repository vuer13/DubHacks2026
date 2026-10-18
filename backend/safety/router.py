"""Safety API routes. Implement fall, location, and SOS logic in this lane."""

from typing import NoReturn

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from ..models import (
    FallCheckResponse,
    LocationRequest,
    LocationResponse,
    LocationWriteResponse,
    SosCancelRequest,
    SosCancelResponse,
    SosRequest,
    SosResponse,
)

router = APIRouter(prefix="/api", tags=["safety"])


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
    session_id: str = Form(...),
) -> FallCheckResponse:
    """Assess a clip for a fall.

    Example:
        curl -F 'clip=@fall.webm' -F 'session_id=demo' \\
          http://localhost:8000/api/fall/check
    """
    _todo("Fall detection")


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
