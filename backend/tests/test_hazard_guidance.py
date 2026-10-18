from backend.perception.hazard_guidance import PATH_OBSTACLE_GUIDANCE


def test_prompt_covers_stationary_obstacles_in_the_walking_path():
    for phrase in (
        "stationary tree trunk",
        "stump",
        "boulder",
        "large rock",
        "likely to walk into it",
        "roots_steps",
        "loose_rock",
        "head-height overhead branches",
        "outside the walking corridor",
    ):
        assert phrase in PATH_OBSTACLE_GUIDANCE
