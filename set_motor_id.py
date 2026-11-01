"""Set the ID (and baud rate) of one motor, for swapping a single motor.

Connect only the new motor to the board, then name the joint it will become.
Same procedure as one prompt of lerobot-setup-motors.

Usage:
    source ports.sh
    uv run python set_motor_id.py $LEADER_PORT wrist_roll
"""

from __future__ import annotations

import sys

from lerobot.motors import Motor, MotorNormMode
from lerobot.motors.feetech import FeetechMotorsBus

JOINTS = ["shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper"]


def main(port: str, joint: str) -> None:
    motors = {name: Motor(i + 1, "sts3215", MotorNormMode.RANGE_M100_100) for i, name in enumerate(JOINTS)}
    bus = FeetechMotorsBus(port=port, motors=motors)
    bus.setup_motor(joint)  # finds the single connected motor, writes ID and baud rate
    print(f"'{joint}' motor id set to {motors[joint].id}")
    bus.disconnect(disable_torque=False)


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[2] not in JOINTS:
        sys.exit(f"usage: uv run python set_motor_id.py <port> <{'|'.join(JOINTS)}>")
    main(sys.argv[1], sys.argv[2])
