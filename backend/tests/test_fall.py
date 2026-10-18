"""Focused tests for the OpenCV fall-motion heuristic."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import cv2
import numpy as np

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


if __name__ == "__main__":
    unittest.main()
