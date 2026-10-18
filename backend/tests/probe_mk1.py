"""Probe: send one 3 s window to Mk1.5 in two ways and time each call.

Run from the project root:
    python backend/tests/probe_mk1.py
"""

import os
import subprocess
import sys
from pathlib import Path
from time import perf_counter

from dotenv import load_dotenv
from perceptron import Client, image, video, video_frames

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / "backend" / ".env")

VIDEO_PATH = ROOT / "footage" / "test_window.mp4"
FRAMES_DIR = ROOT / "footage" / "probe_frames"
MODEL = os.getenv("PERCEPTRON_MODEL", "perceptron-mk1.5")
EFFORTS = ["minimal", "low", "medium"]
FRAME_FPS = 2

PROMPT = (
    "You are the eyes for a blind hiker wearing a chest camera. "
    "List any trail hazards for a person walking forward, with the side "
    "(left, right, ahead) and how close each one is. "
    "If there are no hazards, say so. Keep it under 60 words."
)


def make_frames() -> list[tuple[Path, int]]:
    """Cut the test video into JPEG pictures, FRAME_FPS per second."""
    FRAMES_DIR.mkdir(parents=True, exist_ok=True)
    for old in FRAMES_DIR.glob("*.jpg"):
        old.unlink()
    subprocess.run(
        [
            "ffmpeg", "-y", "-loglevel", "error",
            "-i", str(VIDEO_PATH),
            "-vf", f"fps={FRAME_FPS}",
            str(FRAMES_DIR / "f_%02d.jpg"),
        ],
        check=True,
    )
    paths = sorted(FRAMES_DIR.glob("f_*.jpg"))
    step_ms = int(1000 / FRAME_FPS)
    return [(p, i * step_ms) for i, p in enumerate(paths)]


def run_once(client: Client, mode: str, effort: str, frames) -> dict:
    """Make one model call and return timing, tokens and the answer."""
    if mode == "video":
        asset = video(str(VIDEO_PATH))
    else:
        asset = video_frames([(image(str(p)), ts) for p, ts in frames])

    started = perf_counter()
    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": [asset, PROMPT]}],
            reasoning_effort=effort,
            max_completion_tokens=512,
        )
    except Exception as exc:
        body = getattr(getattr(exc, "response", None), "text", "")
        return {
            "mode": mode, "effort": effort, "ok": False,
            "latency": perf_counter() - started,
            "error": f"{type(exc).__name__}: {exc} {body}",
        }

    latency = perf_counter() - started
    usage = getattr(response, "usage", None)
    return {
        "mode": mode, "effort": effort, "ok": True, "latency": latency,
        "in_tokens": getattr(usage, "prompt_tokens", None),
        "out_tokens": getattr(usage, "completion_tokens", None),
        "finish": response.choices[0].finish_reason,
        "text": response.choices[0].message.content,
    }


def main() -> None:
    if not VIDEO_PATH.is_file():
        sys.exit(f"Missing {VIDEO_PATH}. Make the test window first.")
    api_key = os.getenv("PERCEPTRON_API_KEY")
    if not api_key:
        sys.exit("PERCEPTRON_API_KEY is empty in backend/.env")

    client = Client(api_key=api_key)
    frames = make_frames()
    print(f"Cut {len(frames)} frames from the test window.\n")

    results = []
    for mode in ["video", "frames"]:
        for effort in EFFORTS:
            print(f"Running mode={mode} effort={effort} ...")
            results.append(run_once(client, mode, effort, frames))

    print("\n=== TABLE ===")
    print(f"{'mode':<8}{'effort':<9}{'secs':>6}{'in_tok':>9}{'out_tok':>9}  finish")
    for r in results:
        if r["ok"]:
            print(
                f"{r['mode']:<8}{r['effort']:<9}{r['latency']:>6.2f}"
                f"{str(r['in_tokens']):>9}{str(r['out_tokens']):>9}  {r['finish']}"
            )
        else:
            print(f"{r['mode']:<8}{r['effort']:<9}{r['latency']:>6.2f}  FAILED")

    print("\n=== RAW ANSWERS ===")
    for r in results:
        print(f"\n--- {r['mode']} / {r['effort']} ---")
        print(r["text"] if r["ok"] else r["error"])

    if frames:
        n = len(frames)
        tokens = next((r["in_tokens"] for r in results
                       if r["ok"] and r["mode"] == "frames" and r["in_tokens"]), None)
        if tokens:
            print(f"\nApprox input tokens per frame: {tokens / n:.0f}")


if __name__ == "__main__":
    main()
