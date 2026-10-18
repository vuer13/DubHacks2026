"""Check description parsing without making model calls."""

from backend.perception.describe import parse_description


def test_valid_hazard():
    result = parse_description(
        'A trail forks ahead.\n'
        '[{"type":"fork","severity":2,"direction":"12",'
        '"distance":"near","say":"ahead fork"}]'
    )
    assert result.scene == "A trail forks ahead."
    assert len(result.hazards) == 1
    assert result.hazards[0].type.value == "fork"


def test_no_hazards():
    result = parse_description("A clear dirt trail continues ahead.\n[]")
    assert result.scene == "A clear dirt trail continues ahead."
    assert result.hazards == []


def test_broken_json_keeps_description():
    result = parse_description('Trees surround the trail.\n[{"type":')
    assert result.scene == "Trees surround the trail."
    assert result.hazards == []


def test_invalid_hazard_is_discarded():
    result = parse_description(
        'A trail continues ahead.\n'
        '[{"type":"fork","severity":9,"direction":"12",'
        '"distance":"near","say":"ahead fork"}]'
    )
    assert result.scene == "A trail continues ahead."
    assert result.hazards == []