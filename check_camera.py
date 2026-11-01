"""Open one camera the way teleop and record will, and report what it delivers.

lerobot-find-cameras only opens each camera in its default mode. This opens
the exact mode you plan to put in --robot.cameras, so a refused size or fps
fails here rather than mid-session. It also times the frames, because a
camera can accept fps=30 and still deliver 15 in a dim room.

Width and height are the size after rotation, as in LeRobot's config: with
--rotation 90 or -90, ask for 480x640 to capture 640x480.

Usage:
    uv run python check_camera.py 1                               # 640x480 @ 30
    uv run python check_camera.py 1 --rotation 180
    uv run python check_camera.py 2 --size 640x360 --seconds 30   # soak test
"""

from __future__ import annotations

import argparse
import itertools
import statistics
import time
from pathlib import Path

import cv2
from lerobot.cameras import ColorMode, Cv2Rotation
from lerobot.cameras.opencv import OpenCVCamera, OpenCVCameraConfig

OUT_DIR = Path("outputs/camera_checks")


def main(
    index: int, width: int, height: int, fps: int, rotation: int, seconds: float
) -> None:
    config = OpenCVCameraConfig(
        index_or_path=index,
        fps=fps,
        width=width,
        height=height,
        rotation=Cv2Rotation(rotation),
        color_mode=ColorMode.BGR,  # BGR so cv2.imwrite saves true colours
    )
    cam = OpenCVCamera(config)
    cam.connect()  # raises here if the camera refuses the size or fps
    stamps: list[float] = []
    try:
        end = time.perf_counter() + seconds
        while time.perf_counter() < end:
            frame = cam.async_read(timeout_ms=1000)
            stamps.append(time.perf_counter())
    finally:
        cam.disconnect()

    gaps_ms = [(b - a) * 1e3 for a, b in itertools.pairwise(stamps)]
    slow = sum(g > 1.5e3 / fps for g in gaps_ms)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / f"cam{index}_{width}x{height}_rot{rotation}.png"
    cv2.imwrite(str(path), frame)

    print(f"frame shape     {frame.shape}  (height, width, channels)")
    print(f"delivered fps   {1e3 / statistics.median(gaps_ms):.1f}  (asked for {fps})")
    print(
        f"frame gap ms    median {statistics.median(gaps_ms):.1f}, max {max(gaps_ms):.1f}"
    )
    print(f"slow frames     {slow} of {len(gaps_ms)}  (gap over 1.5x the target)")
    print(f"saved           {path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("index", type=int, help="index from lerobot-find-cameras")
    parser.add_argument("--size", default="640x480", help="WIDTHxHEIGHT after rotation")
    parser.add_argument("--fps", type=int, default=30)
    parser.add_argument("--rotation", type=int, default=0, choices=[0, 90, 180, -90])
    parser.add_argument("--seconds", type=float, default=5.0)
    args = parser.parse_args()
    w, h = (int(v) for v in args.size.lower().split("x"))
    main(args.index, w, h, args.fps, args.rotation, args.seconds)
