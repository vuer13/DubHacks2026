"""Tests for the multipart fall-check endpoint."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException, UploadFile

import backend.safety.router as safety_router
from backend.safety.fall import FallAssessment, FallSignals


class FallCheckRouteTests(unittest.IsolatedAsyncioTestCase):
    async def test_upload_is_assessed_and_suspected_fall_is_logged(self) -> None:
        assessment = FallAssessment(
            fell="yes",
            confidence=0.9,
            signals=FallSignals(
                motion_spike=True,
                static_after=True,
                vlm="yes",
            ),
        )
        temp_paths: list[Path] = []

        async def fake_assess(path: str | Path) -> FallAssessment:
            temp_path = Path(path)
            temp_paths.append(temp_path)
            self.assertEqual(temp_path.read_bytes(), b"sample-video")
            return assessment

        upload = UploadFile(filename="fall.MOV", file=BytesIO(b"sample-video"))
        with (
            patch.object(safety_router, "assess", new=AsyncMock(side_effect=fake_assess)),
            patch.object(safety_router, "_record_fall_suspected") as record_event,
        ):
            response = await safety_router.check_for_fall(upload, "session_1")

        self.assertEqual(response.fell, "yes")
        self.assertEqual(response.confidence, 0.9)
        record_event.assert_called_once_with("session_1", assessment)
        self.assertFalse(temp_paths[0].exists())

    async def test_invalid_video_returns_bad_request(self) -> None:
        upload = UploadFile(filename="broken.mp4", file=BytesIO(b"not-a-video"))
        with patch.object(
            safety_router,
            "assess",
            new=AsyncMock(side_effect=ValueError("Could not open fall clip")),
        ):
            with self.assertRaises(HTTPException) as raised:
                await safety_router.check_for_fall(upload, "session_1")

        self.assertEqual(raised.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
