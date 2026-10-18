"""Focused tests for the OpenCV fall-motion heuristic."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import cv2
import numpy as np

from backend.safety import fall
from backend.safety.fall import motion_signature


class MotionSignatureTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.temp_path = Path(self.temp_dir.name)

    def write_clip(self, name: str, frame_values: list[int]) -> Path:
        """Write a small deterministic MJPEG clip, or skip if unavailable."""
        clip_path = self.temp_path / name
        writer = cv2.VideoWriter(
            str(clip_path),
            cv2.VideoWriter_fourcc(*"MJPG"),
            10.0,
            (64, 36),
        )
        if not writer.isOpened():
            writer.release()
            self.skipTest("OpenCV MJPEG video writer is unavailable")

        try:
            for value in frame_values:
                frame = np.full((36, 64, 3), value, dtype=np.uint8)
                writer.write(frame)
        finally:
            writer.release()
        return clip_path

    def test_spike_followed_by_stillness_is_detected(self) -> None:
        # A sudden black-to-white scene change followed by a still image.
        clip = self.write_clip("spike_then_still.avi", [0] * 12 + [255] * 28)

        result = motion_signature(clip)

        self.assertTrue(result["motion_spike"])
        self.assertTrue(result["static_after"])
        self.assertGreater(result["peak_ratio"], 4.0)

    def test_spike_without_stillness_does_not_set_static_after(self) -> None:
        moving_values = [0] * 12 + [255 if index % 2 else 0 for index in range(28)]
        clip = self.write_clip("spike_then_motion.avi", moving_values)

        result = motion_signature(clip)

        self.assertTrue(result["motion_spike"])
        self.assertFalse(result["static_after"])

    def test_steady_clip_has_no_motion_spike(self) -> None:
        clip = self.write_clip("steady.avi", [64] * 40)

        result = motion_signature(clip)

        self.assertFalse(result["motion_spike"])
        self.assertFalse(result["static_after"])
        self.assertEqual(result["peak_ratio"], 0.0)

    def test_clip_shorter_than_baseline_is_rejected(self) -> None:
        clip = self.write_clip("too_short.avi", [0] * 8)

        with self.assertRaisesRegex(ValueError, "too short"):
            motion_signature(clip)

    def test_unreadable_clip_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "Could not open"):
            motion_signature(self.temp_path / "missing.avi")


class FallAssessmentTests(unittest.IsolatedAsyncioTestCase):
    def test_vlm_request_uses_sdk_vision_config_shape(self) -> None:
        client = MagicMock()
        client.chat.completions.create.return_value.choices = [
            MagicMock(
                finish_reason="stop",
                message=MagicMock(
                    content='{"fell":"yes","confidence":0.9,"reason":"fall"}'
                ),
            )
        ]
        with (
            patch("perceptron.video", return_value="video-node"),
            patch("backend.perception.mk1.get_client", return_value=client),
            patch("backend.perception.mk1.get_model_name", return_value="perceptron-mk1.5"),
        ):
            result = fall._request_fall_confirmation("fall.mov")

        request = client.chat.completions.create.call_args.kwargs
        self.assertEqual(request["vision_config"], {"enable_audio_in_video": True})
        self.assertNotIn("enable_audio_in_video", request)
        self.assertEqual(result.fell, "yes")

    async def test_no_motion_signals_skip_model_confirmation(self) -> None:
        signature = {"motion_spike": False, "static_after": False, "peak_ratio": 1.0}
        with (
            patch.object(fall, "motion_signature", return_value=signature),
            patch.object(fall, "vlm_confirm", new_callable=AsyncMock) as confirm,
        ):
            result = await fall.assess("walk.mp4")

        confirm.assert_not_awaited()
        self.assertEqual(result.fell, "no")
        self.assertIsNone(result.signals.vlm)

    async def test_vlm_yes_plus_motion_spike_confirms_fall(self) -> None:
        signature = {"motion_spike": True, "static_after": False, "peak_ratio": 5.0}
        with (
            patch.object(fall, "motion_signature", return_value=signature),
            patch.object(
                fall,
                "vlm_confirm",
                new_callable=AsyncMock,
                return_value=("yes", 0.91),
            ),
        ):
            result = await fall.assess("fall.mp4")

        self.assertEqual(result.fell, "yes")
        self.assertEqual(result.confidence, 0.91)

    async def test_one_motion_signal_and_uncertain_vlm_stays_unsure(self) -> None:
        signature = {"motion_spike": True, "static_after": False, "peak_ratio": 5.0}
        with (
            patch.object(fall, "motion_signature", return_value=signature),
            patch.object(
                fall,
                "vlm_confirm",
                new_callable=AsyncMock,
                return_value=("unsure", 0.52),
            ),
        ):
            result = await fall.assess("unclear.mp4")

        self.assertEqual(result.fell, "unsure")
        self.assertEqual(result.signals.vlm, "unsure")

    async def test_model_failure_degrades_to_unsure(self) -> None:
        signature = {"motion_spike": True, "static_after": False, "peak_ratio": 5.0}
        with (
            patch.object(fall, "motion_signature", return_value=signature),
            patch.object(
                fall,
                "vlm_confirm",
                new_callable=AsyncMock,
                side_effect=RuntimeError("API unavailable"),
            ),
        ):
            result = await fall.assess("unclear.mp4")

        self.assertEqual(result.fell, "unsure")
        self.assertEqual(result.confidence, 0.0)
        self.assertEqual(result.signals.vlm, "unsure")


if __name__ == "__main__":
    unittest.main()
