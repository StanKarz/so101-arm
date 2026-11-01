"""lerobot-calibrate, guarded against Enter presses queued before range recording.

LeRobot ends range recording when it finds a blank line waiting on stdin. An
extra Enter typed at the mid-pose prompt is still in the buffer when recording
starts, so recording stops on its first pass and every joint gets min == max.
This wrapper drops anything typed before recording began and ignores Enter for
the first few seconds. Everything else is LeRobot's own calibration.

Usage (same arguments as lerobot-calibrate):
    source ports.sh
    uv run python safe_calibrate.py --teleop.type=so101_leader --teleop.port=$LEADER_PORT --teleop.id=leader
"""

from __future__ import annotations

import sys
import termios
import time

from lerobot.motors import motors_bus
from lerobot.scripts import lerobot_calibrate

MIN_RECORD_S = 3.0

_original_enter_pressed = motors_bus.enter_pressed
_record_start: float | None = None


def _guarded_enter_pressed() -> bool:
    global _record_start
    now = time.monotonic()
    if _record_start is None:
        _record_start = now
    if now - _record_start < MIN_RECORD_S:
        termios.tcflush(sys.stdin, termios.TCIFLUSH)  # discard queued keypresses
        return False
    return _original_enter_pressed()


motors_bus.enter_pressed = _guarded_enter_pressed

if __name__ == "__main__":
    print(f"(Enter is ignored for the first {MIN_RECORD_S:.0f} s of range recording.)")
    lerobot_calibrate.main()
