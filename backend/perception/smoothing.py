"""Decide which hazards are worth saying out loud.

Takes ClipEvents (what the AI saw) one at a time and returns SpeakEvents
(what to say). Silence is a feature: most events produce nothing.
"""

import os

from ..models import (
    ClipEvent,
    Distance,
    Earcon,
    Haptic,
    HazardType,
    SignKind,
    SpeakEvent,
    TrailState,
)

# Settings you can tune. Times are in seconds.
SPEAK_DELAY_S = float(os.getenv("REPLAY_SPEAK_DELAY_S", "0.5"))
REPEAT_WINDOW_S = 20.0   # do not repeat the same hazard type within this time
FORGET_AFTER_S = 60.0    # forget a hazard type if it has not appeared for this long
FORK_REPEAT_S = 30.0     # say "Fork ahead" at most once per this time
SIGN_DELAY_S = 1.5       # read a sign this long after "Fork ahead"

DISTANCE_RANK = {Distance.FAR: 0, Distance.MID: 1, Distance.NEAR: 2}

# priority -> (earcon sound, vibration pattern)
PRIORITY_STYLE = {
    1: (Earcon.NOTE, Haptic.SHORT),
    2: (Earcon.CAUTION, Haptic.DOUBLE),
    3: (Earcon.STOP, Haptic.LONG),
}


class Smoother:
    """Remembers what has happened so far in ONE hike (one session)."""

    def __init__(self) -> None:
        self._prev_types: set[HazardType] = set()
        self._last_spoken: dict[HazardType, tuple[float, int]] = {}
        self._last_seen: dict[HazardType, float] = {}
        self._last_fork_t: float | None = None
        self._awaiting_sign = False

    def push(self, event: ClipEvent) -> list[SpeakEvent]:
        """Look at one new ClipEvent and return what to say (often nothing)."""
        now = event.t_end
        speak_t = now + SPEAK_DELAY_S
        out: list[SpeakEvent] = []

        # Remember when each hazard type was last seen.
        for h in event.hazards:
            self._last_seen[h.type] = now

        # Rule 6: forget hazard types that have been gone for a long time.
        for htype in list(self._last_spoken):
            if now - self._last_seen.get(htype, now) > FORGET_AFTER_S:
                del self._last_spoken[htype]

        # Rules 1, 2, 3, 5: pick at most one hazard to speak.
        best = None
        for h in event.hazards:
            if h.type == HazardType.FORK:
                continue  # forks are handled below through trail_state
            # Rule 2: severity 1 and 2 must also be in the previous event.
            if h.severity < 3 and h.type not in self._prev_types:
                continue
            priority = h.severity
            rank = DISTANCE_RANK[h.distance]
            # Rule 3: no repeats within 20 s unless it got closer.
            last = self._last_spoken.get(h.type)
            if last is not None and now - last[0] < REPEAT_WINDOW_S:
                if rank <= last[1]:
                    continue
                priority = min(3, priority + 1)
            # Rule 5: keep the highest priority, nearest hazard.
            key = (priority, rank)
            if best is None or key > best[0]:
                best = (key, h, priority, rank)

        if best is not None:
            _, h, priority, rank = best
            earcon, haptic = PRIORITY_STYLE[priority]
            out.append(
                SpeakEvent(
                    t=speak_t, priority=priority, say=h.say,
                    earcon=earcon, haptic=haptic,
                )
            )
            self._last_spoken[h.type] = (now, rank)

        # Rule 4: a fork gets "Fork ahead", then the sign is read.
        fork_now = False
        if event.trail_state == TrailState.FORK and (
            self._last_fork_t is None or now - self._last_fork_t >= FORK_REPEAT_S
        ):
            out.append(
                SpeakEvent(
                    t=speak_t, priority=2, say="Fork ahead",
                    earcon=Earcon.FORK, haptic=Haptic.DOUBLE,
                )
            )
            self._last_fork_t = now
            self._awaiting_sign = True
            fork_now = True

        if self._awaiting_sign:
            sign = event.sign
            if sign is not None and sign.kind == SignKind.DIRECTIONAL:
                out.append(
                    SpeakEvent(
                        t=speak_t + (SIGN_DELAY_S if fork_now else 0.0),
                        priority=1, say=sign.say,
                        earcon=Earcon.NOTE, haptic=Haptic.NONE,
                    )
                )
                self._awaiting_sign = False
            elif not fork_now:
                self._awaiting_sign = False  # waited one extra event, give up

        self._prev_types = {h.type for h in event.hazards}
        out.sort(key=lambda s: s.t)
        return out


def run_smoother(events: list[ClipEvent]) -> list[SpeakEvent]:
    """Run a whole hike's events (in time order) through a fresh Smoother."""
    smoother = Smoother()
    speak: list[SpeakEvent] = []
    for event in events:
        speak.extend(smoother.push(event))
    return speak
