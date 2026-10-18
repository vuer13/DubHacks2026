"""Perception API routes."""

import re
import shutil
import uuid
from pathlib import Path
from typing import NoReturn

from fastapi import (
    APIRouter,
    BackgroundTasks,
    File,
    Form,
    HTTPException,
    UploadFile,
)

from ..models import (
    AnalyzeJobResponse,
    ClipEvent,
    ClipResponse,
    DescribeResponse,
    JobResponse,
    ReadSignResponse,
)
from .pipeline import DATA_DIR, analyze_video
from .describe import describe_clip

router = APIRouter(prefix="/api", tags=["perception"])
MAX_LIVE_CLIP_BYTES = 25 * 1024 * 1024

JOBS_DIR = DATA_DIR / "jobs"
# footage/ is ignored by git, so uploaded videos never get committed.
UPLOADS_DIR = DATA_DIR.parents[1] / "footage" / "uploads"
JOB_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]+$")


def _todo(feature: str) -> NoReturn:
    raise HTTPException(status_code=501, detail=f"{feature} is not implemented yet")


def _job_path(job_id: str) -> Path:
    if not JOB_ID_PATTERN.match(job_id):
        raise HTTPException(status_code=400, detail="Invalid job id")
    return JOBS_DIR / f"{job_id}.json"


async def _run_job(video_path: Path, job_id: str) -> None:
    """Run the pipeline in the background. If it crashes, mark the job as error."""
    try:
        await analyze_video(video_path, job_id)
    except Exception:
        path = _job_path(job_id)
        try:
            job = JobResponse.model_validate_json(path.read_text())
        except Exception:
            job = JobResponse(status="error", events=[], speak=[])
        path.write_text(job.model_copy(update={"status": "error"}).model_dump_json(indent=2))


@router.post("/analyze", response_model=AnalyzeJobResponse)
async def analyze_video_upload(
    background_tasks: BackgroundTasks, video: UploadFile = File(...)
) -> AnalyzeJobResponse:
    """Queue a full video for offline analysis.

    Example:
        curl -F 'video=@hike.mp4' http://localhost:8000/api/analyze
    """
    job_id = f"job_{uuid.uuid4().hex[:8]}"
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    JOBS_DIR.mkdir(parents=True, exist_ok=True)

    suffix = Path(video.filename or "").suffix or ".mp4"
    video_path = UPLOADS_DIR / f"{job_id}{suffix}"
    with video_path.open("wb") as out:
        shutil.copyfileobj(video.file, out)

    # Create the job file now so GET /api/jobs/<id> works immediately.
    _job_path(job_id).write_text(
        JobResponse(status="running", events=[], speak=[]).model_dump_json(indent=2)
    )
    background_tasks.add_task(_run_job, video_path, job_id)
    return AnalyzeJobResponse(job_id=job_id)


@router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job(job_id: str) -> JobResponse:
    """Fetch analysis status and events.

    Example: curl http://localhost:8000/api/jobs/hike1
    """
    path = _job_path(job_id)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Job not found")
    try:
        return JobResponse.model_validate_json(path.read_text())
    except ValueError:
        # The file was being rewritten at that exact moment. Ask again.
        raise HTTPException(status_code=503, detail="Job file busy, try again")


@router.post("/clip", response_model=ClipResponse)
async def analyze_clip(
    clip: UploadFile = File(...),
    session_id: str = Form(...),
    sequence: int | None = Form(None, ge=0),
) -> ClipResponse:
    """Analyze a camera segment and update the rolling trail window.

    Example:
        curl -F 'clip=@clip.webm' -F 'session_id=demo' \\
          http://localhost:8000/api/clip

    Live clients can include a zero-based ``sequence`` for one-second segments
    so event timestamps follow capture order rather than model response latency.
    """
    if not session_id.strip():
        raise HTTPException(status_code=422, detail="session_id cannot be empty")

    from .live import InvalidClipError, analyze_live_clip, get_session_window

    window = get_session_window(session_id)
    if window.lock.locked():
        raise HTTPException(
            status_code=429,
            detail="A clip for this hike is still being analyzed; retry the latest clip shortly",
        )

    try:
        async with window.lock:
            clip_bytes = await clip.read(MAX_LIVE_CLIP_BYTES + 1)
            if not clip_bytes:
                raise HTTPException(status_code=422, detail="Uploaded clip is empty")
            if len(clip_bytes) > MAX_LIVE_CLIP_BYTES:
                raise HTTPException(status_code=413, detail="Camera clips must be under 25 MB")
            return await analyze_live_clip(
                session_id=session_id,
                clip_bytes=clip_bytes,
                filename=clip.filename or "camera.mp4",
                window=window,
                sequence=sequence,
            )
    except InvalidClipError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Trail clip analysis is temporarily unavailable",
        ) from exc


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
    return await describe_clip(clip, session_id)


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
    from .live import get_session_window

    return get_session_window(session_id).events[-3:]
