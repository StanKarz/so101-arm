"""Check that each motor ID sits on the joint it was named for.

Connects to all six motors on one bus, then prints which joint moved whenever
you turn one by hand. Works for both arms (same names and IDs).

Usage:
    source ports.sh
    uv run python check_ids.py $LEADER_PORT
"""

from __future__ import annotations

import sys
import time

from lerobot.motors import Motor, MotorNormMode
from lerobot.motors.feetech import FeetechMotorsBus

JOINTS = ["shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper"]
MOVE_THRESHOLD = 40  # raw ticks; 4096 ticks per turn, so ~3.5 degrees
POLL_S = 0.05


def main(port: str) -> None:
    motors = {name: Motor(i + 1, "sts3215", MotorNormMode.RANGE_M100_100) for i, name in enumerate(JOINTS)}
    bus = FeetechMotorsBus(port=port, motors=motors)
    bus.connect()  # handshake raises if any of IDs 1-6 is missing
    bus.disable_torque()
    print("All six IDs answered. Move one joint at a time by hand; Ctrl+C to stop.\n")

    last = bus.sync_read("Present_Position", normalize=False)
    try:
        while True:
            now = bus.sync_read("Present_Position", normalize=False)
            for name in JOINTS:
                if abs(now[name] - last[name]) > MOVE_THRESHOLD:
                    print(f"  moved: {name:<14} (id {motors[name].id})  raw {last[name]} -> {now[name]}")
                    last[name] = now[name]
            time.sleep(POLL_S)
    except KeyboardInterrupt:
        pass
    finally:
        bus.disconnect()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: uv run python check_ids.py <port>")
    main(sys.argv[1])
