import copy

import pytest
from pydantic import ValidationError

from backend.models import ClipEvent
from backend.perception.model_output import ModelHazardOutput, to_clip_event

EXAMPLE = {
    "clip_id": "clip_0012",
    "t_start": 36.0,
    "t_end": 39.0,
    "hazards": [
        {
            "type": "drop_off",
            "severity": 3,
            "direction": "11",
            "distance": "near",
            "say": "Drop-off, left, stop",
            "point": [310, 760],
        }
    ],
    "trail_state": "clear",
    "surface": "packed dirt",
    "scene": "Narrow dirt trail with a steep edge on the left, trees on the right.",
    "sign": None,
    "model": "perceptron-mk1.5",
    "latency_ms": 1840,
}


def test_example_round_trips():
    event = ClipEvent.model_validate(EXAMPLE)
    again = ClipEvent.model_validate_json(event.model_dump_json())
    assert again == event


def test_old_event_without_point_and_sign_still_validates():
    old = copy.deepcopy(EXAMPLE)
    del old["hazards"][0]["point"]
    del old["sign"]
    event = ClipEvent.model_validate(old)
    assert event.hazards[0].point is None
    assert event.sign is None


def test_say_longer_than_six_words_is_rejected():
    bad = copy.deepcopy(EXAMPLE)
    bad["hazards"][0]["say"] = "one two three four five six seven"
    with pytest.raises(ValidationError):
        ClipEvent.model_validate(bad)


def test_model_output_becomes_a_clip_event():
    out = ModelHazardOutput.model_validate(
        {
            "hazards": [
                {
                    "type": "roots_steps",
                    "severity": 1,
                    "direction": "12",
                    "distance": "mid",
                    "say": "Ahead, roots",
                }
            ],
            "trail_state": "clear",
            "surface": "packed dirt",
            "scene": "A clear trail with roots ahead.",
        }
    )
    event = to_clip_event(
        out,
        clip_id="clip_0001",
        t_start=0.0,
        t_end=3.0,
        model="perceptron-mk1.5",
        latency_ms=1200,
    )
    assert event.clip_id == "clip_0001"
    assert event.hazards[0].point is None


def test_model_output_rejects_a_bad_direction():
    with pytest.raises(ValidationError):
        ModelHazardOutput.model_validate(
            {
                "hazards": [
                    {
                        "type": "water",
                        "severity": 2,
                        "direction": "left",
                        "distance": "near",
                        "say": "Left, water",
                    }
                ],
                "trail_state": "clear",
                "surface": "mud",
                "scene": "Water on the left.",
            }
        )