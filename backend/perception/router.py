"""Perception API routes. Implement model calls in this lane."""

from typing import NoReturn

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from ..models import (
    AnalyzeJobResponse,
    ClipEvent,
    ClipResponse,
    DescribeResponse,
    JobResponse,
    ReadSignResponse,
)

router = APIRouter(prefix="/api", tags=["perception"])


def _todo(feature: str) -> NoReturn:
    raise HTTPException(status_code=501, detail=f"{feature} is not implemented yet")


@router.post("/analyze", response_model=AnalyzeJobResponse)
async def analyze_video(video: UploadFile = File(...)) -> AnalyzeJobResponse:
    """Queue a full video for offline analysis.

    Example:
        curl -F 'video=@hike.mp4' http://localhost:8000/api/analyze
    """
    _todo("Video analysis")


@router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job(job_id: str) -> JobResponse:
    """Fetch analysis status and events.

    Example: curl http://localhost:8000/api/jobs/job_123
    """
    _todo("Job lookup")


@router.post("/clip", response_model=ClipResponse)
async def analyze_clip(
    clip: UploadFile = File(...),
    session_id: str = Form(...),
) -> ClipResponse:
    """Analyze one short camera clip.

    Example:
        curl -F 'clip=@clip.webm' -F 'session_id=demo' \\
          http://localhost:8000/api/clip
    """
    _todo("Live clip analysis")


@router.post("/describe", response_model=DescribeResponse)
async def describe_surroundings(
    clip: UploadFile = File(...),
    session_id: str = Form(...),
) -> DescribeResponse:
    """Describe the latest view on demand.

    Example:
        curl -F 'clip=@clip.webm' -F 'session_id=demo' \\
          http://localhost:8000/api/describe
    """
    _todo("Scene description")


@router.post("/read_sign", response_model=ReadSignResponse)
async def read_sign(
    session_id: str = Form(...),
    frame: UploadFile | None = File(default=None),
    clip: UploadFile | None = File(default=None),
) -> ReadSignResponse:
    """Read a sign from a frame or clip.

    Example:
        curl -F 'frame=@frame.jpg' -F 'session_id=demo' \\
          http://localhost:8000/api/read_sign
    """
    _todo("Sign reading")


@router.get("/session/{session_id}/hazards", response_model=list[ClipEvent])
async def get_recent_hazards(session_id: str) -> list[ClipEvent]:
    """Return the session's latest three clip events.

    Example: curl http://localhost:8000/api/session/demo/hazards
    """
    _todo("Session hazard history")
