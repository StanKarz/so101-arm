"""Print each motor's factory settings side by side, read-only.

Used to spot a 12 V follower motor hiding in the leader: the 12 V and 7.4 V
STS3215 variants report the same model number, so look for the motor whose
voltage limits differ from the rest.

Usage:
    source ports.sh
    uv run python inspect_motors.py $LEADER_PORT          # all six, IDs 1-6
    uv run python inspect_motors.py $LEADER_PORT 1        # one loose motor (new motors are ID 1)
"""

from __future__ import annotations

import sys

from lerobot.motors import Motor, MotorNormMode
from lerobot.motors.feetech import FeetechMotorsBus

JOINTS = ["shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper"]
REGISTERS = [
    "Model_Number",
    "Firmware_Major_Version",
    "Firmware_Minor_Version",
    "Max_Voltage_Limit",  # units of 0.1 V
    "Min_Voltage_Limit",  # units of 0.1 V
    "Present_Voltage",  # units of 0.1 V
    "Max_Torque_Limit",
    "Protection_Current",
    "Overload_Torque",
    "P_Coefficient",
]


def main(port: str, ids: list[int]) -> None:
    motors = {
        (JOINTS[i - 1] if len(ids) > 1 else f"id{i}"): Motor(i, "sts3215", MotorNormMode.RANGE_M100_100)
        for i in ids
    }
    bus = FeetechMotorsBus(port=port, motors=motors)
    bus.connect(handshake=False)  # read-only: nothing is written
    try:
        names = list(motors)
        print(f"{'register':<24}" + "".join(f"{n:>14}" for n in names))
        for reg in REGISTERS:
            row = [bus.read(reg, n, normalize=False) for n in names]
            flag = "  <- differs" if len(set(row)) > 1 else ""
            print(f"{reg:<24}" + "".join(f"{v:>14}" for v in row) + flag)
    finally:
        bus.disconnect(disable_torque=False)


if __name__ == "__main__":
    if len(sys.argv) not in (2, 3):
        sys.exit("usage: uv run python inspect_motors.py <port> [single_id]")
    main(sys.argv[1], [int(sys.argv[2])] if len(sys.argv) == 3 else list(range(1, 7)))
