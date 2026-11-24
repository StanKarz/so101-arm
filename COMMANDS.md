# Commands

Run these from this folder. Start every new terminal with:

```bash
source ports.sh
eval "$(uv run python camera_index.py --export)"  # WRIST_CAM and FRONT_CAM, found by name
export CAMS="{ wrist: {type: opencv, index_or_path: $WRIST_CAM, width: 640, height: 480, fps: 30}, front: {type: opencv, index_or_path: $FRONT_CAM, width: 640, height: 360, fps: 30} }"
```

The 12 V brick goes on the follower board and the 5 V brick on the leader board. USB alone doesn't power the motors, and 12 V burns the leader's 7.4 V motors.

## Versions

`pyproject.toml` pins lerobot 0.7.0, the version LeLab runs, with the same extras: `core-scripts` (recording, the Rerun live view, the arrow keys), `feetech` and `training`. Run `uv sync` after pulling.

Keep the two on one version, and change neither from demo 1 until the 20 trials are done, for the same reason calibration stays frozen. To compare:

```bash
uv run python -c "import importlib.metadata as m; print(m.version('lerobot'))"                    # this repo
$(uv tool dir)/lelab/bin/python -c "import importlib.metadata as m; print(m.version('lerobot'))"  # LeLab
```

If LeLab's update button moves it to a newer lerobot, bump the pin here to match (`uv add "lerobot[core-scripts,feetech,training]==<version>"`) and rerun the checks below.

## Teleop

Line the follower up with the leader first, because it moves straight to the leader's pose on start. Ctrl-C stops it and cuts torque, so support the follower or park it low first.

```bash
uv run lerobot-teleoperate \
  --robot.type=so101_follower --robot.port=$FOLLOWER_PORT --robot.id=follower \
  --teleop.type=so101_leader --teleop.port=$LEADER_PORT --teleop.id=leader
```

With both cameras and joints in the Rerun viewer:

```bash
uv run lerobot-teleoperate \
  --robot.type=so101_follower --robot.port=$FOLLOWER_PORT --robot.id=follower \
  --robot.cameras="$CAMS" \
  --teleop.type=so101_leader --teleop.port=$LEADER_PORT --teleop.id=leader \
  --display_data=true
```

Add `--robot.max_relative_target=2` to limit each joint to 2° per loop, about 120°/s at the default 60 Hz.

## Calibration

Clamp both arms first. Calibrating rewrites the motors' offsets and limits and sets the joint units a dataset is recorded in, so calibrate after any motor comes out, then leave it alone once demos exist.

```bash
# Back up the current files
D=../calibration-backups/$(date +%F) && mkdir -p $D
cp ~/.cache/huggingface/lerobot/calibration/robots/so_follower/follower.json \
   ~/.cache/huggingface/lerobot/calibration/teleoperators/so_leader/leader.json $D/

# Follower: move to the pose find_mid_pose.py guides you to, then calibrate
uv run python find_mid_pose.py $FOLLOWER_PORT
uv run python safe_calibrate.py --robot.type=so101_follower --robot.port=$FOLLOWER_PORT --robot.id=follower

# Leader: same again
uv run python find_mid_pose.py $LEADER_PORT
uv run python safe_calibrate.py --teleop.type=so101_leader --teleop.port=$LEADER_PORT --teleop.id=leader
```

To roll back, copy a backup over the file in `~/.cache/huggingface/lerobot/calibration/`, start teleop, and press Enter when LeRobot offers to write the file to the motors.

## LeLab

```bash
lelab            # GUI at http://127.0.0.1:8000, from any folder
lelab --no-open  # same, without opening a browser
lelab --stop     # from another terminal, when Ctrl-C doesn't return the prompt
```

Link the existing `follower` and `leader` files under Calibration > Advanced. A new calibration under either name overwrites that file. LeLab has no `max_relative_target`, so line the arms up before teleop and do the first policy run from the command line.

Name cameras `wrist` and `front`, as in `$CAMS` above. The name becomes the dataset key (`observation.images.wrist`), and a policy looks its images up by that key.

Stop teleop in the GUI before stopping the server. The server's shutdown stops a recording but not teleop, so stopping it mid-teleop leaves the follower's torque on and it holds its pose until the brick goes off. `lelab --stop` sends a terminate signal and kills whatever is left after 5 s.

After pressing LeLab's update button, restart it: the running server keeps the old code in memory, and the update can uninstall packages that code needs.

## Checks

```bash
uv run python check_ids.py $FOLLOWER_PORT       # turn a joint, see which motor moved
uv run python inspect_motors.py $FOLLOWER_PORT  # limits, Present_Voltage (0.1 V), temperature, Status
uv run python camera_index.py                   # index, name and uniqueID of each camera
uv run python check_camera.py $WRIST_CAM        # 640x480 at 30 fps, timed
uv run python check_camera.py $FRONT_CAM --size 640x360 --seconds 600  # scene camera heat test
uv run lerobot-find-port                        # if a port changes, update ports.sh
```

## Record and replay

```bash
uv run lerobot-record \
  --robot.type=so101_follower --robot.port=$FOLLOWER_PORT --robot.id=follower \
  --robot.cameras="$CAMS" \
  --teleop.type=so101_leader --teleop.port=$LEADER_PORT --teleop.id=leader \
  --dataset.repo_id=local/so101_pick_test \
  --dataset.single_task="Pick up the cube and put it in the bin" \
  --dataset.num_episodes=10 --dataset.episode_time_s=30 --dataset.reset_time_s=20 \
  --dataset.push_to_hub=false \
  --display_data=true

uv run lerobot-replay \
  --robot.type=so101_follower --robot.port=$FOLLOWER_PORT --robot.id=follower \
  --dataset.repo_id=local/so101_pick_test --dataset.episode=0

uv run lerobot-dataset-viz --repo-id local/so101_pick_test --episode-index 0
```

While recording, right arrow ends the episode early, left arrow records it again and Esc stops. If LeRobot warns about macOS Accessibility, keep the terminal focused so it can read the keys there. Add `--resume=true` to add episodes to an existing dataset. Datasets are saved in `~/.cache/huggingface/lerobot/`.
