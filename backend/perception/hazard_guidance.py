"""Shared prompt guidance for obstacles in the hiker's forward path."""

PATH_OBSTACLE_GUIDANCE = (
    "Scan the full forward walking corridor, including eye-level obstacles, not just the ground. "
    "A stationary tree trunk, stump, boulder, or large rock is a hazard when it blocks the route "
    "or the hiker is likely to walk into it; do not dismiss it as scenery just because it is still. "
    "Use roots_steps for trunks, stumps, and fixed objects blocking the path, and loose_rock for "
    "rocks or boulders on the path. Keep low_branch for head-height overhead branches. Name the "
    "object in the short warning, for example: 'Ahead, tree trunk, stop'. Ignore trees and rocks "
    "clearly outside the walking corridor."
)
