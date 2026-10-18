"""Trail navigation routes. Implement GPX and off-trail logic in this lane."""

from typing import NoReturn

from fastapi import APIRouter, HTTPException, Query

from ..models import TrailBriefResponse, TrailStatusResponse

router = APIRouter(prefix="/api/trail", tags=["navigation"])


def _todo(feature: str) -> NoReturn:
    raise HTTPException(status_code=501, detail=f"{feature} is not implemented yet")


@router.get("/{trail_id}/brief", response_model=TrailBriefResponse)
async def get_trail_brief(trail_id: str) -> TrailBriefResponse:
    """Return a short spoken summary of the trail.

    Example: curl http://localhost:8000/api/trail/demo/brief
    """
    _todo("Trail brief")


@router.get("/{trail_id}/status", response_model=TrailStatusResponse)
async def get_trail_status(
    trail_id: str,
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
) -> TrailStatusResponse:
    """Return distance to the trail and progress along it.

    Example:
        curl 'http://localhost:8000/api/trail/demo/status?lat=49.3&lng=-123.1'
    """
    _todo("Trail status")
