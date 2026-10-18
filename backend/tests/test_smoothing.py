"""Tests for the smoothing rules, using hand-written ClipEvents."""

import pytest

from backend.models import ClipEvent, Hazard
from backend.perception.smoothing import run_smoother


def hazard(kind, severity, distance="mid", say="Left, careful"):
    return Hazard(
        type=kind, severity=severity, direction="11", distance=distance, say=say
    )


def make_event(n, hazards=(), trail_state="clear", sign=None):
    """Event number n ends at 1.5 * n seconds (one event per 1.5 s)."""
    t_end = 1.5 * n
    return ClipEvent(
        clip_id=f"clip_{n:04d}",
        t_start=max(0.0, t_end - 3.0),
        t_end=t_end,
        hazards=list(hazards),
        trail_state=trail_state,
        surface="dirt",
        scene="Test scene.",
        sign=sign,
        model="test",
        latency_ms=0,
    )


def test_severity_3_is_spoken_immediately():
    speak = run_smoother([make_event(1, [hazard("drop_off", 3)])])
    assert len(speak) == 1
    assert speak[0].priority == 3
    assert speak[0].earcon.value == "stop"
    assert speak[0].haptic.value == "long"


def test_severity_2_needs_two_events_in_a_row():
    one = run_smoother([make_event(1, [hazard("roots_steps", 2)])])
    two = run_smoother(
        [
            make_event(1, [hazard("roots_steps", 2)]),
            make_event(2, [hazard("roots_steps", 2)]),
        ]
    )
    assert one == []
    assert len(two) == 1
    assert two[0].earcon.value == "caution"


def test_gap_breaks_the_streak():
    speak = run_smoother(
        [
            make_event(1, [hazard("roots_steps", 2)]),
            make_event(2, []),
            make_event(3, [hazard("roots_steps", 2)]),
        ]
    )
    assert speak == []


def test_same_hazard_is_not_repeated_within_20_seconds():
    events = [make_event(n, [hazard("drop_off", 3)]) for n in range(1, 6)]
    assert len(run_smoother(events)) == 1


def test_closer_hazard_is_repeated_with_higher_priority():
    events = [
        make_event(1, [hazard("roots_steps", 1, "far")]),
        make_event(2, [hazard("roots_steps", 1, "far")]),
        make_event(3, [hazard("roots_steps", 1, "mid")]),
    ]
    speak = run_smoother(events)
    assert [s.priority for s in speak] == [1, 2]


def test_only_one_hazard_per_event_and_nearest_wins():
    event = make_event(
        1,
        [
            hazard("drop_off", 3, "mid", say="Left, drop-off"),
            hazard("water", 3, "near", say="Ahead, water"),
        ],
    )
    speak = run_smoother([event])
    assert len(speak) == 1
    assert speak[0].say == "Ahead, water"


def test_fork_is_announced_once_per_30_seconds():
    events = [make_event(n, trail_state="fork") for n in range(1, 5)]
    speak = run_smoother(events)
    assert [s.say for s in speak] == ["Fork ahead"]


def test_fork_with_directional_sign_reads_the_sign_later():
    sign = {
        "kind": "directional",
        "lines": ["Lynn Loop", "2.1 km"],
        "arrows": [{"label": "Lynn Loop", "direction": "right"}],
        "say": "Sign: Lynn Loop, right",
    }
    speak = run_smoother([make_event(1, trail_state="fork", sign=sign)])
    assert [s.say for s in speak] == ["Fork ahead", "Sign: Lynn Loop, right"]
    assert speak[1].t - speak[0].t == pytest.approx(1.5)
