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

    def write_frame_clip(self, name: str, frames: list[np.ndarray]) -> Path:
        """Write provided color frames to a deterministic MJPEG clip."""
        clip_path = self.temp_path / name
        height, width = frames[0].shape[:2]
        writer = cv2.VideoWriter(
            str(clip_path),
            cv2.VideoWriter_fourcc(*"MJPG"),
            10.0,
            (width, height),
        )
        if not writer.isOpened():
            writer.release()
            self.skipTest("OpenCV MJPEG video writer is unavailable")

        try:
            for frame in frames:
                writer.write(frame)
        finally:
            writer.release()
        return clip_path

    def make_textured_frame(self) -> np.ndarray:
        """Create stable visual features that optical flow and ORB can track."""
        image = np.zeros((180, 320, 3), dtype=np.uint8)
        rng = np.random.default_rng(17)
        for _ in range(320):
            center = (int(rng.integers(0, 320)), int(rng.integers(0, 180)))
            color_value = int(rng.integers(80, 256))
            cv2.circle(image, center, int(rng.integers(1, 4)), (color_value,) * 3, -1)
        return image

    def test_rotated_motion_then_stillness_sets_opencv_fall_rule(self) -> None:
        base = self.make_textured_frame()
        frames = [base.copy() for _ in range(10)]
        for angle in (4, 10, 18, 29, 40):
            transform = cv2.getRotationMatrix2D((160, 90), angle, 1.0)
            frames.append(cv2.warpAffine(base, transform, (320, 180)))
        frames.extend([frames[-1].copy() for _ in range(25)])
        clip = self.write_frame_clip("rotated_fall.avi", frames)

        result = motion_signature(clip)

        self.assertGreater(result["max_flow"], fall.HIGH_MOTION)
        self.assertGreater(result["rotation_change_deg"] or 0.0, fall.ROTATION_LIMIT_DEG)
        self.assertLess(result["end_flow"], fall.LOW_MOTION)
        self.assertTrue(result["static_after"])
        self.assertTrue(result["motion_spike"])
        self.assertTrue(result["opencv_fall_suspected"])

    def test_vertical_scene_sweep_then_stillness_sets_opencv_fall_rule(self) -> None:
        base = self.make_textured_frame()
        frames = [base.copy() for _ in range(10)]
        for offset_y in (4, 10, 18, 29, 40):
            transform = np.float32([[1, 0, 0], [0, 1, offset_y]])
            frames.append(cv2.warpAffine(base, transform, (320, 180)))
        frames.extend([frames[-1].copy() for _ in range(25)])
        clip = self.write_frame_clip("vertical_sweep.avi", frames)

        result = motion_signature(clip)

        self.assertGreater(result["max_flow"], fall.HIGH_MOTION)
        self.assertGreater(
            abs(result["peak_vertical_flow"]), fall.VERTICAL_SWEEP_LIMIT
        )
        self.assertLess(result["end_flow"], fall.LOW_MOTION)
        self.assertTrue(result["opencv_fall_suspected"])

    def test_flow_and_stillness_are_fallback_when_orb_cannot_estimate_rotation(self) -> None:
        base = self.make_textured_frame()
        frames = [base.copy() for _ in range(10)]
        for angle in (4, 10, 18, 29, 40):
            transform = cv2.getRotationMatrix2D((160, 90), angle, 1.0)
            frames.append(cv2.warpAffine(base, transform, (320, 180)))
        frames.extend([frames[-1].copy() for _ in range(25)])
        clip = self.write_frame_clip("orb_unavailable.avi", frames)

        with patch.object(fall, "_estimate_rotation_degrees", return_value=None):
            result = motion_signature(clip)

        self.assertGreater(result["max_flow"], fall.HIGH_MOTION)
        self.assertLess(result["end_flow"], fall.LOW_MOTION)
        self.assertIsNone(result["rotation_change_deg"])
        self.assertTrue(result["opencv_fall_suspected"])

    def test_steady_clip_has_low_flow_and_no_opencv_fall(self) -> None:
        base = self.make_textured_frame()
        clip = self.write_frame_clip("steady.avi", [base.copy() for _ in range(40)])

        result = motion_signature(clip)

        self.assertFalse(result["motion_spike"])
        self.assertTrue(result["static_after"])
        self.assertLess(result["max_flow"], fall.LOW_MOTION)
        self.assertLess(result["end_flow"], fall.LOW_MOTION)
        self.assertFalse(result["opencv_fall_suspected"])

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

    async def test_model_classifies_clip_even_without_opencv_motion_cues(self) -> None:
        signature = {
            "motion_spike": False,
            "static_after": False,
            "max_flow": 0.4,
            "end_flow": 0.2,
            "peak_vertical_flow": 0.0,
            "rotation_change_deg": None,
            "opencv_fall_suspected": False,
        }
        with (
            patch.object(fall, "motion_signature", return_value=signature),
            patch.object(
                fall,
                "vlm_confirm",
                new_callable=AsyncMock,
                return_value=("no", 0.89),
            ) as confirm,
        ):
            result = await fall.assess("walk.mp4")

        confirm.assert_awaited_once_with("walk.mp4")
        self.assertEqual(result.fell, "no")
        self.assertEqual(result.confidence, 0.89)
        self.assertEqual(result.signals.vlm, "no")

    async def test_vlm_yes_plus_motion_spike_confirms_fall(self) -> None:
        signature = {
            "motion_spike": True,
            "static_after": False,
            "max_flow": 8.2,
            "end_flow": 3.4,
            "peak_vertical_flow": 3.1,
            "rotation_change_deg": 12.0,
            "opencv_fall_suspected": False,
        }
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

    async def test_vlm_no_rejects_even_when_both_motion_cues_fire(self) -> None:
        signature = {
            "motion_spike": True,
            "static_after": True,
            "max_flow": 8.2,
            "end_flow": 0.3,
            "peak_vertical_flow": 7.2,
            "rotation_change_deg": 34.0,
            "opencv_fall_suspected": True,
        }
        with (
            patch.object(fall, "motion_signature", return_value=signature),
            patch.object(
                fall,
                "vlm_confirm",
                new_callable=AsyncMock,
                return_value=("no", 0.94),
            ),
        ):
            result = await fall.assess("stumble.mp4")

        self.assertEqual(result.fell, "no")
        self.assertEqual(result.confidence, 0.94)

    async def test_one_motion_signal_and_uncertain_vlm_stays_unsure(self) -> None:
        signature = {
            "motion_spike": True,
            "static_after": False,
            "max_flow": 8.2,
            "end_flow": 3.4,
            "peak_vertical_flow": 0.0,
            "rotation_change_deg": None,
            "opencv_fall_suspected": False,
        }
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
        signature = {
            "motion_spike": True,
            "static_after": False,
            "max_flow": 8.2,
            "end_flow": 3.4,
            "peak_vertical_flow": 0.0,
            "rotation_change_deg": None,
            "opencv_fall_suspected": False,
        }
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

    async def test_opencv_feature_error_does_not_block_model(self) -> None:
        with (
            patch.object(fall, "motion_signature", side_effect=ValueError("bad codec")),
            patch.object(
                fall,
                "vlm_confirm",
                new_callable=AsyncMock,
                return_value=("yes", 0.93),
            ) as confirm,
        ):
            result = await fall.assess("fall.mov")

        confirm.assert_awaited_once_with("fall.mov")
        self.assertEqual(result.fell, "yes")
        self.assertFalse(result.signals.motion_spike)


if __name__ == "__main__":
    unittest.main()
