"""Shared Perceptron client factory for perception and fall confirmation."""

from functools import lru_cache
import asyncio
import os

from perceptron import Client


@lru_cache(maxsize=1)
def get_client() -> Client:
    """Create one API client and reuse it across backend modules."""
    api_key = os.getenv("PERCEPTRON_API_KEY")
    if not api_key:
        raise RuntimeError("PERCEPTRON_API_KEY is not configured")
    return Client(api_key=api_key)


def get_model_name() -> str:
    """Return the configured model name, defaulting to the project model."""
    return os.getenv("PERCEPTRON_MODEL", "perceptron-mk1.5")


# ---------------------------------------------------------------------------
# Hazard analysis over a running window of frames.
# ---------------------------------------------------------------------------

import json
from pathlib import Path
from time import perf_counter

from perceptron import image, video_frames

from .frames import Frame
from .model_output import ModelHazardOutput, to_clip_event

HAZARD_EFFORT = os.getenv("MK1_HAZARD_EFFORT", "low")
LOG_PATH = Path(__file__).resolve().parents[1] / "data" / "logs" / "mk1.jsonl"

SYSTEM_PROMPT = (
    "You are the eyes for a blind hiker wearing a chest camera. You see the "
    "last few seconds as frames in time order; judge hazards by the most "
    "recent frame and use the earlier frames to tell what is getting closer. "
    "Identify hazards for a person walking forward. Hazard types: drop_off, "
    "steep_descent, water, loose_rock, roots_steps, low_branch, fork, "
    "mud_ice, wildlife, people. Severity 3 only for immediate danger within "
    "2 metres, 2 for caution, 1 for a note. Direction: the frame is five "
    "equal vertical bands, left to right '10', '11', '12', '1', '2'. "
    "Distance: near under 2 m, mid 2 to 6 m, far over 6 m. say: at most 6 "
    "words, direction word first (left, right, ahead), imperative. "
    "trail_state: clear, narrowing, fork, or unclear. surface: two or three "
    "words. scene: one sentence for someone who cannot see. An empty hazards "
    "list is a valid and common answer. Prefer saying nothing over "
    "inventing a hazard."
)


def _log_call(entry: dict) -> None:
    """Append one JSON line describing a model call. Never raises."""
    try:
        LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with LOG_PATH.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
    except OSError:
        pass


def _ask_model(frames: list[Frame], effort: str, extra: str = "") -> tuple:
    """Make one request. Returns (text, finish_reason, usage)."""
    asset = video_frames([(image(str(f.jpeg_path)), f.t_ms) for f in frames])
    prompt = SYSTEM_PROMPT + ("\n\n" + extra if extra else "")
    response = get_client().chat.completions.create(
        model=get_model_name(),
        messages=[{"role": "user", "content": [asset, prompt]}],
        response_format={
            "type": "json_schema",
            "json_schema": {
                "name": "hazard_output",
                "strict": True,
                "schema": ModelHazardOutput.model_json_schema(),
            },
        },
        reasoning_effort=effort,
        max_completion_tokens=512,
    )
    choice = response.choices[0]
    return choice.message.content, choice.finish_reason, response.usage


def _analyze_sync(frames: list[Frame], clip_id: str, effort: str):
    """Ask the model, validate the answer, retry once, else return 'unclear'."""
    started = perf_counter()
    error_note = ""
    raw = ""

    for attempt in (1, 2):
        try:
            raw, finish, usage = _ask_model(frames, effort, error_note)
            if finish != "stop":
                raise ValueError(f"finish_reason was {finish}")
            out = ModelHazardOutput.model_validate_json(raw, strict=True)
            status = "ok"
            break
        except Exception as exc:
            status = "error"
            finish, usage = None, None
            error_note = (
                f"Your previous response failed validation: {exc}. "
                "Return corrected JSON only."
            )
    else:
        out = ModelHazardOutput(
            hazards=[], trail_state="unclear", surface="unknown", scene=""
        )

    latency_ms = round((perf_counter() - started) * 1000)
    _log_call(
        {
            "clip_id": clip_id,
            "frames": len(frames),
            "effort": effort,
            "latency_ms": latency_ms,
            "status": status,
            "finish_reason": finish,
            "in_tokens": getattr(usage, "prompt_tokens", None),
            "out_tokens": getattr(usage, "completion_tokens", None),
            "raw": raw,
        }
    )
    return out, latency_ms


async def analyze_window(
    frames: list[Frame], *, clip_id: str, reasoning_effort: str = HAZARD_EFFORT
):
    """Analyze a window of frames and return a validated ClipEvent."""
    if len(frames) < 2:
        raise ValueError("video_frames needs at least 2 frames")
    out, latency_ms = await asyncio.to_thread(
        _analyze_sync, frames, clip_id, reasoning_effort
    )
    return to_clip_event(
        out,
        clip_id=clip_id,
        t_start=frames[0].t_ms / 1000,
        t_end=frames[-1].t_ms / 1000,
        model=get_model_name(),
        latency_ms=latency_ms,
    )
