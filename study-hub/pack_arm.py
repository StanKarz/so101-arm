"""Pack the official SO-101 URDFs and STLs into one small JS data file for the study hub.

Usage: uv run --with numpy --with trimesh python pack_arm.py <model_dir> <out_js>

<model_dir> is Simulation/SO101 from https://github.com/TheRobotStudio/SO-ARM100 (Apache-2.0).
"""

from __future__ import annotations

import base64
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import numpy as np
import trimesh

MODEL_DIR = Path(sys.argv[1])
OUT = Path(sys.argv[2])
HEADER = "/* SO-101 meshes and URDF data from TheRobotStudio/SO-ARM100 (Apache-2.0), decimated and quantised by pack_arm.py. Modified from the original files. */\n"
QUANT = 1e-4  # 0.1 mm per integer step
CREASE_DEG = 32.0
CLUSTER = 6e-4  # metres; vertex-snap grid, used only when a mesh has to shrink a lot
KEEP_RATIO = 0.5  # printed parts keep this share of their faces: enough to hide CAD slivers without visible chamfering
MAX_FACES = 16000
TARGET_FACES = {
    "sts3215_03a_v1": 2600,
    "sts3215_03a_no_horn_v1": 2600,
    "waveshare_mounting_plate_so101_v2": 600,
}


def split_normals(mesh: trimesh.Trimesh) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Give each face corner a smooth normal within the crease angle, then dedupe vertices."""
    faces = mesh.faces
    fn = mesh.face_normals
    adj = [[] for _ in range(len(mesh.vertices))]
    for fi, f in enumerate(faces):
        for v in f:
            adj[v].append(fi)
    cos_crease = np.cos(np.radians(CREASE_DEG))
    table: dict[tuple, int] = {}
    pos_out, nrm_out, idx_out = [], [], []
    for fi, f in enumerate(faces):
        for v in f:
            near = [a for a in adj[v] if fn[a] @ fn[fi] > cos_crease]
            n = fn[near].sum(axis=0)
            n = n / (np.linalg.norm(n) + 1e-12)
            q = np.round(mesh.vertices[v] / QUANT).astype(int)
            e = np.round(n * 127).astype(int)
            key = (*q, *e)
            if key not in table:
                table[key] = len(pos_out)
                pos_out.append(q)
                nrm_out.append(e)
            idx_out.append(table[key])
    return (
        np.array(pos_out, np.int16),
        np.array(nrm_out, np.int8),
        np.array(idx_out, np.uint16),
    )


def pack_mesh(path: Path, scale: float = 1.0) -> dict:
    mesh = trimesh.load_mesh(path)
    mesh.apply_scale(scale)
    mesh.merge_vertices()
    stem = path.stem
    target = TARGET_FACES.get(stem) or min(int(len(mesh.faces) * KEEP_RATIO), MAX_FACES)
    if stem in TARGET_FACES and len(mesh.faces) > target:
        # CAD exports are full of long slivers that stall quadric decimation at about half
        # the faces, so going far below that needs vertices snapped to a coarse grid first.
        # Snapping notches sharp edges, which is fine on the dark motors and nowhere else.
        verts = np.round(mesh.vertices / CLUSTER) * CLUSTER
        mesh = trimesh.Trimesh(verts, mesh.faces, process=True)
        mesh.update_faces(mesh.nondegenerate_faces())
        mesh.merge_vertices()
    if len(mesh.faces) > target:
        mesh = mesh.simplify_quadric_decimation(face_count=target)
        mesh.merge_vertices()
    pos, nrm, idx = split_normals(mesh)
    assert len(pos) < 65536
    return {
        "p": base64.b64encode(pos.tobytes()).decode(),
        "n": base64.b64encode(nrm.tobytes()).decode(),
        "i": base64.b64encode(idx.tobytes()).decode(),
        "faces": len(idx) // 3,
    }


def floats(s: str | None, default: list[float]) -> list[float]:
    return [round(float(x), 7) for x in s.split()] if s else default


def parse_urdf(path: Path, geoms: dict[str, dict]) -> dict:
    root = ET.parse(path).getroot()
    colours = {}
    for m in root.findall("material"):
        c = m.find("color")
        if c is not None:
            colours[m.get("name")] = c.get("rgba")
    links = {}
    for link in root.findall("link"):
        visuals = []
        for v in link.findall("visual"):
            mesh = v.find("geometry/mesh")
            if mesh is None:
                continue
            stem = Path(mesh.get("filename")).stem
            if stem not in geoms:
                scale = float((mesh.get("scale") or "1").split()[0])
                geoms[stem] = pack_mesh(path.parent / "assets" / f"{stem}.stl", scale)
            o = v.find("origin")
            mat = v.find("material")
            visuals.append(
                {
                    "g": stem,
                    "xyz": floats(o.get("xyz"), [0, 0, 0]),
                    "rpy": floats(o.get("rpy"), [0, 0, 0]),
                    "mat": mat.get("name") if mat is not None else "3d_printed",
                }
            )
        inertial = link.find("inertial")
        mass, com = 0.0, [0, 0, 0]
        if inertial is not None:
            mass = float(inertial.find("mass").get("value"))
            com = floats(inertial.find("origin").get("xyz"), [0, 0, 0])
        links[link.get("name")] = {"v": visuals, "m": mass, "com": com}
    joints = []
    for j in root.findall("joint"):
        o = j.find("origin")
        lim = j.find("limit")
        axis = j.find("axis")
        joints.append(
            {
                "name": j.get("name"),
                "type": j.get("type"),
                "parent": j.find("parent").get("link"),
                "child": j.find("child").get("link"),
                "xyz": floats(o.get("xyz"), [0, 0, 0]),
                "rpy": floats(o.get("rpy"), [0, 0, 0]),
                "axis": floats(axis.get("xyz"), [0, 0, 1])
                if axis is not None
                else [0, 0, 1],
                "lower": float(lim.get("lower"))
                if lim is not None and lim.get("lower")
                else 0.0,
                "upper": float(lim.get("upper"))
                if lim is not None and lim.get("upper")
                else 0.0,
            }
        )
    return {"links": links, "joints": joints, "colours": colours}


geoms: dict[str, dict] = {}
robots = {
    "follower": parse_urdf(MODEL_DIR / "so101_new_calib_camera.urdf", geoms),
    "leader": parse_urdf(MODEL_DIR / "so101_leader_new_calib.urdf", geoms),
}
data = {
    "quant": QUANT,
    "geoms": geoms,
    "robots": robots,
    "source": "TheRobotStudio/SO-ARM100, Apache-2.0",
}
OUT.write_text(
    HEADER + "window.SO101_ARM=" + json.dumps(data, separators=(",", ":")) + ";\n"
)

print(
    f"wrote {OUT}: {OUT.stat().st_size / 1024:.0f} KB, {sum(g['faces'] for g in geoms.values())} unique faces"
)
for name, g in geoms.items():
    print(f"  {name:42s} {g['faces']:5d}")
for rname, r in robots.items():
    print(rname)
    total = sum(link["m"] for link in r["links"].values())
    print(
        f"  links: {[(k, len(v['v']), round(v['m'], 3)) for k, v in r['links'].items()]}  total mass {total:.3f} kg"
    )
    for j in r["joints"]:
        print(
            f"  {j['name']:22s} {j['type']:9s} {j['parent']} -> {j['child']}  limits {np.degrees(j['lower']):.1f}..{np.degrees(j['upper']):.1f}"
        )
    print("  colours", r["colours"])
