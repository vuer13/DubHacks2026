"""Tests for the Twilio SOS sender without making network requests."""

from __future__ import annotations

import json
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import parse_qs
from unittest.mock import patch

import httpx

from backend.safety import sos


class SosTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        root = Path(self.temp_dir.name)
        self.log_path = root / "logs" / "sos.log"
        self.session_dir = root / "sessions"
        self.log_patch = patch.object(sos, "SOS_LOG_PATH", self.log_path)
        self.session_patch = patch.object(sos, "SESSION_DIR", self.session_dir)
        self.log_patch.start()
        self.session_patch.start()
        self.addCleanup(self.log_patch.stop)
        self.addCleanup(self.session_patch.stop)
        with sos._STATE_LOCK:
            sos._SOS_STATE.clear()

    async def test_call_sos_posts_twilio_call_with_spoken_alert(self) -> None:
        requests: list[httpx.Request] = []

        def handle_request(request: httpx.Request) -> httpx.Response:
            requests.append(request)
            return httpx.Response(201, json={"sid": "CA-test-123", "status": "queued"})

        transport = httpx.MockTransport(handle_request)
        client_class = httpx.AsyncClient

        def mock_client(*args: object, **kwargs: object) -> httpx.AsyncClient:
            return client_class(*args, transport=transport, **kwargs)

        env = {
            "TWILIO_ACCOUNT_SID": "AC-test-account",
            "TWILIO_AUTH_TOKEN": "test-auth-token",
            "TWILIO_FROM_NUMBER": "+15550000001",
            "EMERGENCY_CONTACT_NUMBER": "+15550000002",
            "SHARE_BASE_URL": "https://example.test",
        }
        with (
            patch.dict("os.environ", env, clear=True),
            patch("backend.safety.sos.httpx.AsyncClient", side_effect=mock_client),
        ):
            result = await sos.call_sos(
                session_id="mock-session",
                reason="TEST ONLY: no emergency; checking voice call & location.",
                lat=49.3,
                lng=-123.1,
                recent_events=[],
            )

        self.assertTrue(result["sent"])
        self.assertEqual(result["sid"], "CA-test-123")
        self.assertEqual(result["to"], "+15550000002")
        self.assertEqual(len(requests), 1)
        request = requests[0]
        self.assertEqual(request.method, "POST")
        self.assertEqual(
            request.url,
            "https://api.twilio.com/2010-04-01/Accounts/AC-test-account/Calls.json",
        )
        self.assertEqual(request.headers["authorization"].split()[0], "Basic")
        form = parse_qs(request.content.decode("utf-8"))
        self.assertEqual(form["To"], ["+15550000002"])
        self.assertEqual(form["From"], ["+15550000001"])
        self.assertEqual(len(form["Twiml"]), 1)
        twiml = ET.fromstring(form["Twiml"][0])
        speech = twiml.findtext("Say") or ""
        self.assertEqual(twiml.tag, "Response")
        self.assertIn("TrailSense test call. No emergency.", speech)
        self.assertIn("voice call & location", speech)
        self.assertIn("latitude 49.300000, longitude -123.100000", speech)
        self.assertIn("https://example.test/share/mock-session", speech)

    async def test_missing_configuration_logs_and_returns_unsent(self) -> None:
        with patch.dict("os.environ", {}, clear=True):
            result = await sos.call_sos(
                session_id="missing-config",
                reason="Test",
                lat=49.3,
                lng=-123.1,
                recent_events=[],
            )

        self.assertFalse(result["sent"])
        self.assertIn("TWILIO_ACCOUNT_SID", result["reason"] or "")
        entries = [json.loads(line) for line in self.log_path.read_text().splitlines()]
        self.assertEqual(entries[0]["status"], "not_configured")
        self.assertIn("TrailSense emergency alert", entries[0]["message"])

    async def test_twilio_rejection_returns_safe_diagnostic(self) -> None:
        transport = httpx.MockTransport(
            lambda request: httpx.Response(
                400,
                json={"code": 12345, "message": "The test destination is not approved."},
            )
        )
        client_class = httpx.AsyncClient

        def mock_client(*args: object, **kwargs: object) -> httpx.AsyncClient:
            return client_class(*args, transport=transport, **kwargs)

        env = {
            "TWILIO_ACCOUNT_SID": "AC-test-account",
            "TWILIO_AUTH_TOKEN": "test-auth-token",
            "TWILIO_FROM_NUMBER": "+15550000001",
            "EMERGENCY_CONTACT_NUMBER": "+15550000002",
        }
        with (
            patch.dict("os.environ", env, clear=True),
            patch("backend.safety.sos.httpx.AsyncClient", side_effect=mock_client),
        ):
            result = await sos.call_sos(
                session_id="rejected-session",
                reason="TEST ONLY: no emergency; checking voice call.",
                lat=49.3,
                lng=-123.1,
                recent_events=[],
            )

        self.assertFalse(result["sent"])
        self.assertIn("HTTP 400 (code 12345)", result["reason"] or "")
        self.assertIn("destination is not approved", result["reason"] or "")

    async def test_cancelled_session_does_not_place_sos_call(self) -> None:
        self.assertTrue(sos.cancel_sos("cancel-session"))
        # Repeated cancellation is safe and remains acknowledged.
        self.assertTrue(sos.cancel_sos("cancel-session"))
        saved = json.loads(
            (self.session_dir / "cancel-session.sos.json").read_text(encoding="utf-8")
        )
        self.assertEqual(saved["state"], "cancelled")

        with patch("backend.safety.sos.httpx.AsyncClient") as client:
            result = await sos.call_sos(
                session_id="cancel-session",
                reason="No response to fall check-in",
                lat=49.3,
                lng=-123.1,
                recent_events=[],
            )

        client.assert_not_called()
        self.assertFalse(result["sent"])
        self.assertEqual(result["reason"], "SOS was cancelled before the call was placed")


if __name__ == "__main__":
    unittest.main()
