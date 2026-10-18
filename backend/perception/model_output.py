"""What we ask Mk1.5 to produce, and how it becomes a full ClipEvent."""

from pydantic import Field

from ..models import (
    ClipEvent,
    ClockDirection,
    Distance,
    Hazard,
    HazardType,
    TrailSenseModel,
    TrailState,
)


class ModelHazard(TrailSenseModel):
    type: HazardType
    severity: int = Field(strict=True, ge=1, le=3)
    direction: ClockDirection
    distance: Distance
    say: str = Field(min_length=1)


class ModelHazardOutput(TrailSenseModel):
    hazards: list[ModelHazard]
    trail_state: TrailState
    surface: str
    scene: str


def to_clip_event(
    out: ModelHazardOutput,
    *,
    clip_id: str,
    t_start: float,
    t_end: float,
    model: str,
    latency_ms: int,
) -> ClipEvent:
    return ClipEvent(
        clip_id=clip_id,
        t_start=t_start,
        t_end=t_end,
        hazards=[Hazard(**h.model_dump()) for h in out.hazards],
        trail_state=out.trail_state,
        surface=out.surface,
        scene=out.scene,
        model=model,
        latency_ms=latency_ms,
    )