"""Place and record TrailSense SOS calls through Twilio."""

from __future__ import annotations

import json
import logging
import os
import threading
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Literal, TypedDict
from urllib.parse import quote
from xml.sax.saxutils import escape

import httpx

from .. import config as _config  # Load the repository-root .env for local runs.
from ..models import ClipEvent

LOGGER = logging.getLogger(__name__)
SOS_LOG_PATH = Path(__file__).resolve().parents[1] / "data" / "logs" / "sos.log"
SESSION_DIR = Path(__file__).resolve().parents[1] / "data" / "sessions"
_STATE_LOCK = threading.Lock()
_SOS_STATE: dict[str, Literal["cancelled", "sent"]] = {}


class SosResult(TypedDict):
    sent: bool
    to: str | None
    sid: str | None
    reason: str | None


def _state_path(session_id: str) -> Path:
    """Return a session state path that cannot escape the sessions directory."""
    return SESSION_DIR / f"{quote(session_id, safe='')}.sos.json"


def _get_state(session_id: str) -> Literal["cancelled", "sent"] | None:
    state = _SOS_STATE.get(session_id)
    if state is not None:
        return state
    try:
        saved = json.loads(_state_path(session_id).read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except (OSError, json.JSONDecodeError):
        LOGGER.exception("Could not read saved SOS state")
        return None

    state = saved.get("state") if isinstance(saved, dict) else None
    if state in ("cancelled", "sent"):
        _SOS_STATE[session_id] = state
        return state
    return None


def _set_state(session_id: str, state: Literal["cancelled", "sent"]) -> None:
    _SOS_STATE[session_id] = state
    temp_path: Path | None = None
    try:
        SESSION_DIR.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=SESSION_DIR,
            prefix=".sos-state-",
            suffix=".tmp",
            delete=False,
        ) as temp_file:
            temp_path = Path(temp_file.name)
            json.dump({"session_id": session_id, "state": state}, temp_file)
            temp_file.write("\n")
        os.replace(temp_path, _state_path(session_id))
    except OSError:
        LOGGER.exception("Could not persist SOS state")
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)


def _recent_say(recent_events: list[ClipEvent]) -> list[str]:
    """Extract at most three short spoken summaries from recent events."""
    sayings: list[str] = []
    for event in recent_events:
        for hazard in event.hazards:
            sayings.append(hazard.say)
        if event.sign is not None:
            sayings.append(event.sign.say)
    return sayings[-3:]


def _build_call_speech(
    session_id: str,
    reason: str,
    lat: float,
    lng: float,
    recent_events: list[ClipEvent],
) -> str:
    local_time = datetime.now().astimezone().strftime("%Y-%m-%d %H:%M %Z")
    share_base = os.getenv("SHARE_BASE_URL", "http://localhost:3000").rstrip("/")
    share_url = f"{share_base}/share/{quote(session_id, safe='')}"

    is_test = reason.strip().upper().startswith("TEST ONLY:")
    if is_test:
        parts = [
            "TrailSense test call. No emergency. Voice check. A fall was detected."
        ]
    else:
        parts = ["TrailSense emergency alert. A hiker may need help."]
        if reason.strip():
            parts.append(f"Reason: {reason.strip()}.")
    parts.append(
        f"Last known location: latitude {lat:.6f}, longitude {lng:.6f}, recorded at {local_time}."
    )
    recent = _recent_say(recent_events)
    if recent:
        parts.append("Recent trail warnings: " + "; ".join(recent) + ".")
    parts.append(f"For live tracking, open {share_url}.")
    return " ".join(parts)


def _build_twiml(speech: str) -> str:
    """Wrap plain speech in safe TwiML for Twilio's ``<Say>`` verb."""
    return f"<Response><Say>{escape(speech)}</Say></Response>"


def _write_log(
    *,
    event: str,
    session_id: str,
    status: str,
    message: str | None = None,
    to: str | None = None,
    sid: str | None = None,
    reason: str | None = None,
) -> None:
    """Append an SOS event without writing credentials to disk."""
    entry: dict[str, object] = {
        "timestamp": datetime.now().astimezone().isoformat(),
        "type": event,
        "session_id": session_id,
        "status": status,
    }
    if message is not None:
        entry["message"] = message
    if to is not None:
        entry["to"] = to
    if sid is not None:
        entry["sid"] = sid
    if reason is not None:
        entry["reason"] = reason

    try:
        SOS_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with SOS_LOG_PATH.open("a", encoding="utf-8") as log_file:
            log_file.write(json.dumps(entry) + "\n")
    except OSError:
        LOGGER.exception("Could not write SOS event log")


async def call_sos(
    session_id: str,
    reason: str,
    lat: float,
    lng: float,
    recent_events: list[ClipEvent],
) -> SosResult:
    """Place an SOS voice call, or log the message and return a failure result.

    The frontend should call this only after the hiker does not respond to the
    fall check-in. Example:

        curl -H 'Content-Type: application/json' \\
          -d '{"session_id":"demo","reason":"No response to fall check-in",\
"lat":49.3,"lng":-123.1,"recent_events":[]}' \\
          http://localhost:8000/api/sos
    """
    speech = _build_call_speech(session_id, reason, lat, lng, recent_events)
    with _STATE_LOCK:
        cancelled = _get_state(session_id) == "cancelled"
    if cancelled:
        detail = "SOS was cancelled before the call was placed"
        _write_log(
            event="sos_sent",
            session_id=session_id,
            status="cancelled",
            message=speech,
            reason=detail,
        )
        return {"sent": False, "to": None, "sid": None, "reason": detail}

    account_sid = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
    auth_token = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
    from_number = os.getenv("TWILIO_FROM_NUMBER", "").strip()
    to_number = os.getenv("EMERGENCY_CONTACT_NUMBER", "").strip()

    missing = [
        name
        for name, value in (
            ("TWILIO_ACCOUNT_SID", account_sid),
            ("TWILIO_AUTH_TOKEN", auth_token),
            ("TWILIO_FROM_NUMBER", from_number),
            ("EMERGENCY_CONTACT_NUMBER", to_number),
        )
        if not value
    ]
    if missing:
        detail = "Missing Twilio Voice configuration: " + ", ".join(missing)
        _write_log(
            event="sos_sent",
            session_id=session_id,
            status="not_configured",
            message=speech,
            reason=detail,
        )
        return {"sent": False, "to": None, "sid": None, "reason": detail}

    url = (
        "https://api.twilio.com/2010-04-01/Accounts/"
        f"{quote(account_sid, safe='')}/Calls.json"
    )
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                url,
                data={
                    "To": to_number,
                    "From": from_number,
                    "Twiml": _build_twiml(speech),
                },
                auth=(account_sid, auth_token),
            )
        response.raise_for_status()
        response_body = response.json()
        sid = response_body.get("sid")
        if not isinstance(sid, str) or not sid:
            raise ValueError("Twilio response did not include a call SID")
    except httpx.HTTPStatusError as exc:
        detail = f"Twilio returned HTTP {exc.response.status_code}"
        try:
            error_body = exc.response.json()
        except ValueError:
            error_body = {}
        if isinstance(error_body, dict):
            error_code = error_body.get("code")
            error_message = error_body.get("message")
            if error_code is not None:
                detail += f" (code {error_code})"
            if isinstance(error_message, str) and error_message:
                detail += f": {error_message}"
        _write_log(
            event="sos_sent",
            session_id=session_id,
            status="failed",
            message=speech,
            to=to_number,
            reason=detail,
        )
        return {"sent": False, "to": None, "sid": None, "reason": detail}
    except (httpx.HTTPError, ValueError) as exc:
        detail = f"Twilio request failed: {type(exc).__name__}"
        _write_log(
            event="sos_sent",
            session_id=session_id,
            status="failed",
            message=speech,
            to=to_number,
            reason=detail,
        )
        return {"sent": False, "to": None, "sid": None, "reason": detail}
    except Exception as exc:
        # SOS failures must not take down the application.
        detail = f"Unexpected SOS error: {type(exc).__name__}"
        LOGGER.exception("Unexpected Twilio SOS failure")
        _write_log(
            event="sos_sent",
            session_id=session_id,
            status="failed",
            message=speech,
            to=to_number,
            reason=detail,
        )
        return {"sent": False, "to": None, "sid": None, "reason": detail}

    with _STATE_LOCK:
        _set_state(session_id, "sent")
    _write_log(
        event="sos_sent",
        session_id=session_id,
        status="initiated",
        to=to_number,
        sid=sid,
    )
    return {"sent": True, "to": to_number, "sid": sid, "reason": None}


def cancel_sos(session_id: str) -> bool:
    """Record that the hiker cancelled a pending fall escalation.

    The frontend owns the check-in countdown and should avoid calling
    ``call_sos`` after this cancellation. A call already initiated by Twilio
    cannot be recalled here.
    """
    with _STATE_LOCK:
        if _get_state(session_id) == "sent":
            return False
        _set_state(session_id, "cancelled")

    _write_log(
        event="fall_cancelled",
        session_id=session_id,
        status="cancelled",
        reason="Hiker responded during the fall check-in",
    )
    return True
