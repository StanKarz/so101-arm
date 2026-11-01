# Log

One line per session.

- 2026-10-25: Leader IDs set and checked. `inspect_motors.py` found a 12 V follower motor in the leader. Calibration failed three ways, fixed with `find_mid_pose.py` and `safe_calibrate.py`. Every leader joint now has 193-225 deg of travel.
- 2026-10-26: Follower wired. One socket on the shoulder_pan motor is dead, so that motor moved to the gripper position at the end of the chain. Follower calibrated first time, 194-210 deg per joint.
- 2026-10-29: First teleop, leader to follower, Status 0 everywhere on the 2 A brick. Wrote `camera_index.py` and `check_camera.py`. Wrist 640x480 at 30.3 fps, scene 640x360 at 29.9 fps.
- 2026-10-31: Wrist-cam flap. M3x10 stopped motor 6 going back in. Next try: nuts flush, motor in, M3x8 last, as the mount's README says.
