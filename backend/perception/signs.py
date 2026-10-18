"""Format validated sign readings for display and speech."""

from ..models import SignKind, SignReading

SIGN_PROMPT = (
    " Also detect trail signs visible in the newest frame. "
    "Populate sign with its kind, readable lines in reading order, labeled "
    "arrows, and a spoken summary of at most 12 words. "
    "Use kind directional, warning, or info. Arrow directions are left, "
    "right, ahead, or back, relative to the camera. Associate an arrow "
    "with text only when the pairing is clear. Preserve exact readable "
    "names, decimal distances, and units. Never guess missing text. "
    "If a sign is visible but unreadable, use kind info, empty lines "
    "and arrows, and say 'Sign visible, text unreadable'. "
    "If no sign is visible in the newest frame, return sign null, "
    "even if one appeared in an older frame."
)


def normalize_sign(sign: SignReading | None) -> SignReading | None:
    """Preserve full readable text and keep the spoken summary short."""
    if sign is None or sign.kind == SignKind.NONE:
        return None

    lines = list(dict.fromkeys(
        " ".join(line.split()) for line in sign.lines if line.strip()
    ))
    arrows = [
        arrow.model_copy(update={"label": " ".join(arrow.label.split())})
        for arrow in sign.arrows if arrow.label.strip()
    ]

    if not lines and not arrows:
        say = "Sign visible, text unreadable"
    elif len(arrows) > 1:
        say = "Sign has multiple trail directions"
    elif len(arrows) == 1:
        say = f"{arrows[0].direction.value.capitalize()}, {arrows[0].label}"
    elif sign.kind == SignKind.WARNING:
        say = f"Warning sign: {lines[0]}"
    else:
        say = f"Sign: {lines[0]}"

    if len(say.split()) > 12:
        say = "Sign detected. Full text available."

    return SignReading(
        kind=sign.kind, lines=lines, arrows=arrows, say=say
    )
