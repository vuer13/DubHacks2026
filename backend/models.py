"""Shared Pydantic models for the frozen TrailSense API contract."""

from enum import Enum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class TrailSenseModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class HazardType(str, Enum):
    DROP_OFF = "drop_off"
    STEEP_DESCENT = "steep_descent"
    WATER = "water"
    LOOSE_ROCK = "loose_rock"
    ROOTS_STEPS = "roots_steps"
    LOW_BRANCH = "low_branch"
    FORK = "fork"
    MUD_ICE = "mud_ice"
    WILDLIFE = "wildlife"
    PEOPLE = "people"


class ClockDirection(str, Enum):
    TEN = "10"
    ELEVEN = "11"
    TWELVE = "12"
    ONE = "1"
    TWO = "2"


class Distance(str, Enum):
    NEAR = "near"
    MID = "mid"
    FAR = "far"


class TrailState(str, Enum):
    CLEAR = "clear"
    NARROWING = "narrowing"
    FORK = "fork"
    UNCLEAR = "unclear"


class ArrowDirection(str, Enum):
    LEFT = "left"
    RIGHT = "right"
    AHEAD = "ahead"
    BACK = "back"


class SignKind(str, Enum):
    DIRECTIONAL = "directional"
    WARNING = "warning"
    INFO = "info"
    NONE = "none"


class Earcon(str, Enum):
    NOTE = "note"
    CAUTION = "caution"
    STOP = "stop"
    FORK = "fork"
    SOS = "sos"


class Haptic(str, Enum):
    NONE = "none"
    SHORT = "short"
    DOUBLE = "double"
    LONG = "long"


GridCoordinate = Annotated[int, Field(strict=True, ge=0, le=1000)]
GroundingPoint = tuple[GridCoordinate, GridCoordinate]


class Hazard(TrailSenseModel):
    type: HazardType
    severity: int = Field(strict=True, ge=1, le=3)
    direction: ClockDirection
    distance: Distance
    say: str = Field(min_length=1)
    # Optional addition from 2026-10-17. Old event files may omit it.
    point: GroundingPoint | None = None

    @field_validator("say")
    @classmethod
    def warning_is_short(cls, value: str) -> str:
        if len(value.split()) > 6:
            raise ValueError("hazard say must contain at most 6 words")
        return value


class SignArrow(TrailSenseModel):
    label: str
    direction: ArrowDirection


class SignReading(TrailSenseModel):
    kind: SignKind
    lines: list[str]
    arrows: list[SignArrow]
    say: str = Field(min_length=1)

    @field_validator("say")
    @classmethod
    def sign_readout_is_short(cls, value: str) -> str:
        if len(value.split()) > 12:
            raise ValueError("sign say must contain at most 12 words")
        return value


class ClipEvent(TrailSenseModel):
    clip_id: str
    t_start: float = Field(ge=0)
    t_end: float = Field(ge=0)
    hazards: list[Hazard]
    trail_state: TrailState
    surface: str
    scene: str
    # Optional addition from 2026-10-17. Old event files may omit it.
    sign: SignReading | None = None
    model: str
    latency_ms: int = Field(strict=True, ge=0)

    @model_validator(mode="after")
    def end_follows_start(self) -> "ClipEvent":
        if self.t_end < self.t_start:
            raise ValueError("t_end must be greater than or equal to t_start")
        return self


class SpeakEvent(TrailSenseModel):
    t: float = Field(ge=0)
    priority: int = Field(strict=True, ge=1, le=3)
    say: str = Field(min_length=1)
    earcon: Earcon
    haptic: Haptic


class HealthResponse(TrailSenseModel):
    ok: bool


class AnalyzeJobResponse(TrailSenseModel):
    job_id: str


class JobResponse(TrailSenseModel):
    status: Literal["running", "done", "error"]
    events: list[ClipEvent]
    speak: list[SpeakEvent]


class ClipResponse(TrailSenseModel):
    event: ClipEvent
    speak: list[SpeakEvent]


class DescribeResponse(TrailSenseModel):
    scene: str
    hazards: list[Hazard]


class ReadSignResponse(TrailSenseModel):
    sign: SignReading


class LocationPoint(TrailSenseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    ts: float = Field(ge=0)


class OffTrailEvent(TrailSenseModel):
    type: Literal["off_trail"] = "off_trail"
    t: float = Field(ge=0)
    distance_m: float = Field(ge=0)
    side: Literal["left", "right"]


class LocationRequest(LocationPoint):
    session_id: str = Field(min_length=1)


class LocationWriteResponse(TrailSenseModel):
    ok: bool
    off_trail: OffTrailEvent | None


class LocationResponse(TrailSenseModel):
    latest: LocationPoint | None
    track: list[LocationPoint]


class TrailBriefResponse(TrailSenseModel):
    text: str


class TrailProgress(TrailSenseModel):
    distance_done_m: float = Field(ge=0)
    distance_left_m: float = Field(ge=0)
    pct: float = Field(ge=0, le=100)


class TrailStatusResponse(TrailSenseModel):
    distance_m: float = Field(ge=0)
    side: Literal["left", "right"]
    progress: TrailProgress


class FallCheckResponse(TrailSenseModel):
    fell: Literal["yes", "no", "unsure"]
    confidence: float = Field(ge=0, le=1)


class SosRequest(TrailSenseModel):
    session_id: str = Field(min_length=1)
    reason: str = Field(min_length=1)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    recent_events: list[ClipEvent] = Field(default_factory=list)


class SosResponse(TrailSenseModel):
    sent: bool
    to: str | None = None


class SosCancelRequest(TrailSenseModel):
    session_id: str = Field(min_length=1)


class SosCancelResponse(TrailSenseModel):
    cancelled: bool
