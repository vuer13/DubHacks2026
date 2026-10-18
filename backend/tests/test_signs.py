"""Sign formatting tests. No model calls or API credits required."""

from backend.models import SignReading
from backend.perception.signs import normalize_sign


def make_sign(kind="info", lines=None, arrows=None):
    return SignReading.model_validate({
        "kind": kind,
        "lines": lines or [],
        "arrows": arrows or [],
        "say": "Sign",
    })


def test_no_sign():
    assert normalize_sign(None) is None
    assert normalize_sign(make_sign(kind="none")) is None


def test_direction_and_decimal_distance():
    result = normalize_sign(make_sign(
        kind="directional",
        lines=["Lake Trail 2.1 km"],
        arrows=[{
            "label": "Lake Trail 2.1 km",
            "direction": "right",
        }],
    ))
    assert result.say == "Right, Lake Trail 2.1 km"
    assert result.lines == ["Lake Trail 2.1 km"]


def test_unreadable_sign():
    result = normalize_sign(make_sign())
    assert result.say == "Sign visible, text unreadable"
    assert result.lines == []
    assert result.arrows == []


def test_multiple_arrows_preserved():
    result = normalize_sign(make_sign(
        kind="directional",
        arrows=[
            {"label": "Lake Trail", "direction": "right"},
            {"label": "Ridge Trail", "direction": "left"},
        ],
    ))
    assert len(result.arrows) == 2
    assert result.say == "Sign has multiple trail directions"


def test_long_label_is_not_truncated():
    label = " ".join(["Trail"] * 15)
    result = normalize_sign(make_sign(
        kind="directional",
        arrows=[{"label": label, "direction": "ahead"}],
    ))
    assert result.arrows[0].label == label
    assert len(result.say.split()) <= 12


def test_warning_sign():
    result = normalize_sign(make_sign(
        kind="warning",
        lines=["Bridge closed"],
    ))
    assert result.say == "Warning sign: Bridge closed"


def test_whitespace_and_duplicate_lines():
    result = normalize_sign(make_sign(
        lines=["  Lake   Trail  ", "Lake Trail", "   "],
    ))
    assert result.lines == ["Lake Trail"]
