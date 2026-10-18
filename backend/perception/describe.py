"""On-demand scene descriptions for the conversational voice tool."""

import asyncio
import json
import shutil
from pathlib import Path
from tempfile import TemporaryDirectory
from time import perf_counter

from fastapi import HTTPException, UploadFile
from perceptron import image, video_frames
from pydantic import TypeAdapter, ValidationError

from ..models import DescribeResponse, Hazard
from .frames import Frame, extract_frames
from .mk1 import _log_call, get_client, get_model_name

HAZARDS = TypeAdapter(list[Hazard])

PROMPT = (
    "Describe this scene in two sentences for a blind hiker, mentioning "
    "the trail direction and any landmarks. Then list hazards as a JSON "
    "array on the last line. "
    "Use the most recent frame for the current view. Do not invent details. "
    "Do not use Markdown or code fences. "
    "Each hazard must contain: type, severity, direction, distance, say. "
    "type must be one of: drop_off, steep_descent, water, loose_rock, "
    "roots_steps, low_branch, fork, mud_ice, wildlife, people. "
    "severity must be an integer: 1 note, 2 caution, 3 immediate danger. "
    "direction must be a string: '10', '11', '12', '1', or '2'. "
    "distance must be 'near', 'mid', or 'far'. "
    "say must contain at most six words, direction word first "
    "(left, right, ahead). "
    "If there are no visible hazards, the last line must be []."
)


def parse_description(text: str) -> DescribeResponse:
    """Separate the narration from the final JSON hazard array."""
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return DescribeResponse(scene="Description unavailable.", hazards=[])

    try:
        hazards = HAZARDS.validate_json(lines[-1], strict=True)
    except (ValueError, ValidationError):
        # Keep narration, but do not pass malformed hazard data onward.
        scene_lines = lines[:-1] if lines[-1].startswith("[") else lines
        return DescribeResponse(
            scene=" ".join(scene_lines) or "Description unavailable.",
            hazards=[],
        )

    return DescribeResponse(
        scene=" ".join(lines[:-1]) or "Description unavailable.",
        hazards=hazards,
    )


def _describe_frames(frames: list[Frame]) -> DescribeResponse:
    """Make and log one plain-text model request."""
    started = perf_counter()
    usage = None
    finish = None
    raw = ""
    status = "error"

    try:
        asset = video_frames(
            [(image(str(frame.jpeg_path)), frame.t_ms) for frame in frames]
        )
        response = get_client().chat.completions.create(
            model=get_model_name(),
            messages=[{"role": "user", "content": [asset, PROMPT]}],
            reasoning_effort="high",
            max_completion_tokens=2048,
        )
        usage = response.usage
        choice = response.choices[0]
        finish = choice.finish_reason
        raw = choice.message.content or ""

        if finish != "stop":
            raise ValueError(f"finish_reason was {finish}")

        result = parse_description(raw)
        status = "ok"
        return result
    except Exception:
        return DescribeResponse(
            scene="Description unavailable. Please try again.",
            hazards=[],
        )
    finally:
        _log_call(
            {
                "operation": "describe",
                "frames": len(frames),
                "effort": "high",
                "latency_ms": round((perf_counter() - started) * 1000),
                "status": status,
                "finish_reason": finish,
                "in_tokens": getattr(usage, "prompt_tokens", None),
                "out_tokens": getattr(usage, "completion_tokens", None),
                "raw": raw,
            }
        )


async def describe_clip(
    clip: UploadFile, session_id: str
) -> DescribeResponse:
    """Describe an uploaded clip without changing live session state."""
    if not session_id.strip():
        raise HTTPException(status_code=422, detail="session_id cannot be empty")

    with TemporaryDirectory(prefix="trailsense-describe-") as directory:
        folder = Path(directory)
        video_path = folder / "clip.video"

        with video_path.open("wb") as destination:
            await asyncio.to_thread(
                shutil.copyfileobj, clip.file, destination
            )

        try:
            frames = await asyncio.to_thread(
                extract_frames, video_path, folder / "frames"
            )
        except Exception as exc:
            raise HTTPException(
                status_code=400, detail="Could not decode the uploaded video"
            ) from exc

        if len(frames) < 2:
            raise HTTPException(
                status_code=400, detail="Clip must produce at least two frames"
            )

        return await asyncio.to_thread(_describe_frames, frames)