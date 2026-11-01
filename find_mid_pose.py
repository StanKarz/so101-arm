"""Find the calibration mid pose by measurement instead of by eye.

lerobot-calibrate sets whatever pose you hold to read 2047, which puts the
encoder's 4095 -> 0 seam half a turn away. If a joint isn't near the middle of
its travel, the sweep crosses the seam and the range comes out as ~0-4095.

This script measures each joint's real travel (unwrapping the seam), then
guides you to the midpoint. Read-only apart from disabling torque.

Usage:
    source ports.sh
    uv run python find_mid_pose.py $LEADER_PORT
"""

from __future__ import annotations

import sys
import threading
import time

from lerobot.motors import Motor, MotorNormMode
from lerobot.motors.feetech import FeetechMotorsBus

JOINTS = ["shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper"]
TRACKED = [j for j in JOINTS if j != "wrist_roll"]  # wrist_roll is calibrated as a full turn
TICKS_PER_TURN = 4096
DEG_PER_TICK = 360 / TICKS_PER_TURN
TOLERANCE_DEG = 8.0
POLL_S = 0.02  # 50 Hz keeps per-poll motion far below half a turn, so unwrapping is safe
REDRAW_EVERY = 5


def unwrap_step(prev_raw: int, raw: int) -> int:
    """Smallest signed change between two raw readings, across the seam if needed."""
    delta = raw - prev_raw
    if delta > TICKS_PER_TURN // 2:
        delta -= TICKS_PER_TURN
    elif delta < -TICKS_PER_TURN // 2:
        delta += TICKS_PER_TURN
    return delta


def bar(value: float, lo: float, hi: float, width: int = 31) -> str:
    """Stop-to-stop bar: '|' is the midpoint, 'o' is where the joint is now."""
    frac = 0.5 if hi == lo else min(1.0, max(0.0, (value - lo) / (hi - lo)))
    cells = ["-"] * width
    cells[width // 2] = "|"
    cells[round(frac * (width - 1))] = "o"
    return "[" + "".join(cells) + "]"


def wait_for_enter(event: threading.Event) -> None:
    input()
    event.set()


def redraw(lines: list[str], first: bool) -> None:
    if not first:
        sys.stdout.write(f"\033[{len(lines)}F")  # cursor up to the start of the block
    for line in lines:
        sys.stdout.write("\033[2K" + line + "\n")
    sys.stdout.flush()


def main(port: str) -> None:
    motors = {name: Motor(i + 1, "sts3215", MotorNormMode.RANGE_M100_100) for i, name in enumerate(JOINTS)}
    bus = FeetechMotorsBus(port=port, motors=motors)
    bus.connect()
    bus.disable_torque()

    last_raw = bus.sync_read("Present_Position", TRACKED, normalize=False)
    pos = {j: 0 for j in TRACKED}  # continuous position, ticks, relative to the start
    lo = dict(pos)
    hi = dict(pos)

    def poll() -> None:
        raw = bus.sync_read("Present_Position", TRACKED, normalize=False)
        for j in TRACKED:
            pos[j] += unwrap_step(last_raw[j], raw[j])
            last_raw[j] = raw[j]
            lo[j] = min(lo[j], pos[j])
            hi[j] = max(hi[j], pos[j])

    try:
        print("STEP 1: sweep every joint (not wrist_roll) slowly to BOTH hard stops. Press Enter when done.\n")
        done = threading.Event()
        threading.Thread(target=wait_for_enter, args=(done,), daemon=True).start()
        first, n = True, 0
        while not done.is_set():
            poll()
            n += 1
            if n % REDRAW_EVERY == 0:
                rows = [f"  {j:<14} travel so far {(hi[j] - lo[j]) * DEG_PER_TICK:6.1f} deg" for j in TRACKED]
                redraw(rows, first)
                first = False
            time.sleep(POLL_S)

        mid = {j: (lo[j] + hi[j]) / 2 for j in TRACKED}
        print("\nSTEP 2: move each joint until it says OK. Then leave the arm still and press Enter.\n")
        done.clear()
        threading.Thread(target=wait_for_enter, args=(done,), daemon=True).start()
        first, n = True, 0
        while not done.is_set():
            poll()
            n += 1
            if n % REDRAW_EVERY == 0:
                rows = []
                for j in TRACKED:
                    travel = (hi[j] - lo[j]) * DEG_PER_TICK
                    off = (pos[j] - mid[j]) * DEG_PER_TICK
                    slack = 180 - travel / 2
                    state = "OK" if abs(off) <= TOLERANCE_DEG else f"{off:+6.1f} deg"
                    rows.append(f"  {j:<14} {bar(pos[j], lo[j], hi[j])}  {state:<11} travel {travel:5.1f}  slack +/-{slack:5.1f}")
                redraw(rows, first)
                first = False
            time.sleep(POLL_S)

        print(
            "\nHold this pose. Now run lerobot-calibrate, type c, and press Enter at the "
            "'middle of its range' prompt WITHOUT moving the arm."
        )
    finally:
        bus.disconnect(disable_torque=False)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: uv run python find_mid_pose.py <port>")
    main(sys.argv[1])
