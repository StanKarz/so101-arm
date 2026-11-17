# Study hub

One page for working through the SO-101 bench and the theory behind it: a catch-up course on classical robotics and ACT, a rig checklist, bench reference, failure log and glossary. The sims run in the browser: a 3D arm built from the official URDF, a servo-bus fault finder, a one-joint teleop loop, wrist and scene camera views, and ACT's tensor shapes on this rig's camera modes.

Written with Claude from my bench notes and measurements.

## Open it

```sh
python3 -m http.server -d study-hub 8000
```

Then open http://localhost:8000/so101-study.html. Three.js and MathJax load from jsDelivr.

## Arm model

`so101-arm-data.js` is derived from the SO-101 URDFs and STLs in [TheRobotStudio/SO-ARM100](https://github.com/TheRobotStudio/SO-ARM100), licensed under Apache-2.0 (copy in `LICENSE-SO-ARM100`). `pack_arm.py` decimates the meshes, quantises vertices to 0.1 mm and packs both arms into one 2.8 MB file. To rebuild it from a clone of that repo:

```sh
uv run --with numpy --with trimesh python study-hub/pack_arm.py ../SO-ARM100/Simulation/SO101 study-hub/so101-arm-data.js
```
