"""Find each camera's OpenCV index by name, read-only (no camera is opened).

On macOS, OpenCV lists the video and muxed devices, sorts them by uniqueID
string, and the index is the position in that sorted list. USB cameras have
IDs like 0x13000029930858, which sort before the built-in camera's UUID, and
an iPhone with Continuity Camera adds devices that come and go. So the same
camera gets a different index depending on what else is connected. Its name
stays the same.

Usage:
    uv run python camera_index.py                          # index, name, uniqueID
    eval "$(uv run python camera_index.py --export)"       # sets WRIST_CAM, FRONT_CAM
"""

from __future__ import annotations

import argparse
import sys

import AVFoundation as AV

# env var -> lowercase substring of the camera's name
CAMERAS = {"WRIST_CAM": "icspring", "FRONT_CAM": "insta360"}


def opencv_order() -> list[tuple[str, str]]:
    """Return (name, uniqueID) per camera, in OpenCV's index order."""
    devices = [
        *AV.AVCaptureDevice.devicesWithMediaType_(AV.AVMediaTypeVideo),
        *AV.AVCaptureDevice.devicesWithMediaType_(AV.AVMediaTypeMuxed),
    ]
    devices.sort(key=lambda d: d.uniqueID())
    return [(str(d.localizedName()), str(d.uniqueID())) for d in devices]


def main(should_export: bool) -> None:
    devices = opencv_order()
    if not should_export:
        for i, (name, uid) in enumerate(devices):
            print(f"{i:>3}  {name:<28} {uid}")
        return
    # stdout is eval'd by the shell, so messages go to stderr
    for var, needle in CAMERAS.items():
        matches = [i for i, (name, _) in enumerate(devices) if needle in name.lower()]
        if len(matches) == 1:
            print(f"export {var}={matches[0]}")
            print(f"{var}={matches[0]}", file=sys.stderr)
        else:
            print(f"unset {var}")
            print(
                f"{var} not set: {len(matches)} cameras match {needle!r}",
                file=sys.stderr,
            )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--export", action="store_true", help="print shell exports by name"
    )
    main(parser.parse_args().export)
