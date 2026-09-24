# assets-src/blender/emblems.py — renders the five FreeRank tier emblems.
#
#   blender --background --python assets-src/blender/emblems.py -- <out_dir> [tier ...]
#
# Every emblem is the logo's insignia (a lance tip over rank chevrons) struck in
# metal and set in a frame that gets more elaborate with each tier. Geometry is
# built from the same 2D outlines as web/src/brand/Logo.tsx, so the 3D emblems
# and the SVG mark stay one family.

import math
import os
import sys

import bpy
import bmesh
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[0] if argv else os.path.join(os.path.dirname(__file__), "out")
ONLY = set(argv[1:])
SIZE = int(os.environ.get("EMBLEM_SIZE", "1024"))
SAMPLES = int(os.environ.get("EMBLEM_SAMPLES", "96"))
os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------- outlines (2D)
# Same coordinates as the SVG mark, on a 64-unit grid centred at (32, 32), y down.


def g(x, y, s=1 / 28):
    return ((x - 32) * s, (32 - y) * s)


SPEAR = [g(32, 3), g(42, 24), g(32, 34), g(22, 24)]


def chevron(apex_y, t=6, span=14, drop=8):
    return [g(32 - span, apex_y + drop), g(32, apex_y), g(32 + span, apex_y + drop),
            g(32 + span, apex_y + drop + t), g(32, apex_y + t), g(32 - span, apex_y + drop + t)]


def circle(r, n=96, start=math.pi / 2):
    return [(r * math.cos(start + 2 * math.pi * i / n), r * math.sin(start + 2 * math.pi * i / n)) for i in range(n)]


def hexagon(r):
    return circle(r, 6, math.pi / 2)


def shield(w, h):
    top = h * 0.55
    pts = [(-w, top), (-w * 0.35, top + h * 0.12), (0, top + h * 0.2), (w * 0.35, top + h * 0.12), (w, top)]
    pts += [(w, 0.0)]
    # rounded point at the bottom
    for i in range(1, 12):
        a = i / 12
        pts.append((w * (1 - a) ** 1.4, -h * math.sin(a * math.pi / 2)))
    pts += [(0, -h)]
    for i in range(11, 0, -1):
        a = i / 12
        pts.append((-w * (1 - a) ** 1.4, -h * math.sin(a * math.pi / 2)))
    pts += [(-w, 0.0)]
    return pts


def crown(r, points=5, depth=0.34, arc=150, n=360):
    """Circle whose upper `arc` degrees rise into `points` crown peaks."""
    out = []
    half = math.radians(arc) / 2
    for i in range(n):
        a = math.pi / 2 + 2 * math.pi * i / n
        d = math.atan2(math.sin(a - math.pi / 2), math.cos(a - math.pi / 2))  # -pi..pi from straight up
        rr = r
        if abs(d) < half:
            phase = (d + half) / (2 * half) * (points - 1)  # peaks at integer phases
            frac = abs(phase - round(phase))
            envelope = math.cos(d / half * math.pi / 2) ** 0.6
            rr = r + depth * envelope * max(0.0, 1 - frac * 2.2) ** 1.6
        out.append((rr * math.cos(a), rr * math.sin(a)))
    return out


def inset(poly, d):
    """Scale a star-shaped polygon toward its centroid by distance d."""
    cx = sum(p[0] for p in poly) / len(poly)
    cy = sum(p[1] for p in poly) / len(poly)
    res = []
    for x, y in poly:
        vx, vy = x - cx, y - cy
        L = math.hypot(vx, vy) or 1
        res.append((cx + vx * (L - d) / L, cy + vy * (L - d) / L))
    return res


# ---------------------------------------------------------------- mesh helpers


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mesh_from_faces(name, verts2d, faces, depth, z, bevel=0.012, segments=3):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, z)) for x, y in verts2d]
    for f in faces:
        bm.faces.new([vs[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        if f.normal.z < 0:
            f.normal_flip()
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    sol = ob.modifiers.new("solid", "SOLIDIFY")
    sol.thickness = depth
    sol.offset = 1.0
    sol.use_even_offset = True
    if bevel:
        bv = ob.modifiers.new("bevel", "BEVEL")
        bv.width = bevel
        bv.segments = segments
        bv.limit_method = "ANGLE"
        bv.angle_limit = math.radians(30)
        bv.harden_normals = False
    ob.modifiers.new("wn", "WEIGHTED_NORMAL")
    for p in me.polygons:
        p.use_smooth = True
    return ob


def prism(name, poly, depth, z, **kw):
    return mesh_from_faces(name, poly, [list(range(len(poly)))], depth, z, **kw)


def ring(name, outer, inner, depth, z, **kw):
    n = len(outer)
    assert n == len(inner)
    verts = outer + inner
    faces = [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
    return mesh_from_faces(name, verts, faces, depth, z, **kw)


def material(name, color, metallic, rough, coat=0.0, emission=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Metallic"].default_value = metallic
    b.inputs["Roughness"].default_value = rough
    if coat:
        b.inputs["Coat Weight"].default_value = coat
        b.inputs["Coat Roughness"].default_value = 0.05
    if emission:
        b.inputs["Emission Color"].default_value = (*emission[0], 1)
        b.inputs["Emission Strength"].default_value = emission[1]
    return m


def assign(ob, mat):
    ob.data.materials.append(mat)
    return ob


def srgb(hexs):
    h = hexs.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)


# ---------------------------------------------------------------- tiers

TIERS = {
    "freelance": dict(chevrons=1, frame="round", metal=("#8e959e", 0.38), enamel="#2b2f36", accent=None),
    "pro": dict(chevrons=2, frame="round_notched", metal=("#c9835a", 0.3), enamel="#3a2419", accent=None),
    "expert": dict(chevrons=3, frame="hex", metal=("#cfd3d8", 0.22), enamel="#0f6b64", accent=None),
    "elite": dict(chevrons=4, frame="shield", metal=("#d9dde3", 0.18), enamel="#3d1670", accent=None),
    "master": dict(chevrons=4, frame="crown", metal=("#f0c35a", 0.14), enamel="#061f86", accent="#bfe3ff"),
}


def insignia(n_chev, z, depth, mat, height):
    """Lance tip + chevrons, scaled so the whole stack is `height` units tall."""
    scale = height / ((52 + 10 * (n_chev - 1) - 3) / 28)
    parts = [prism("spear", SPEAR, depth, z, bevel=0.018)]
    for i in range(n_chev):
        parts.append(prism(f"chev{i}", chevron(38 + 10 * i), depth, z, bevel=0.016))
    # centre the group vertically inside the frame
    ys = [v[1] for p in [SPEAR] + [chevron(38 + 10 * i) for i in range(n_chev)] for v in p]
    cy = (max(ys) + min(ys)) / 2
    for ob in parts:
        ob.location = (0, -cy * scale, 0)
        ob.scale = (scale, scale, 1)
        assign(ob, mat)
    return parts


def build(tier):
    t = TIERS[tier]
    metal = material("metal", srgb(t["metal"][0]), 1.0, t["metal"][1])
    enamel = material("enamel", srgb(t["enamel"]), 0.0, 0.18, coat=1.0)
    frame = t["frame"]
    root = bpy.data.objects.new("emblem", None)
    bpy.context.collection.objects.link(root)
    objs = []

    if frame in ("round", "round_notched"):
        R = 1.0
        objs.append(assign(prism("plate", circle(R - 0.06), 0.1, 0.0, bevel=0.01), enamel))
        outer = circle(R)
        if frame == "round_notched":
            outer = [(x * (1 + 0.035 * (math.cos(24 * math.atan2(y, x)) > 0.6)), y * (1 + 0.035 * (math.cos(24 * math.atan2(y, x)) > 0.6))) for x, y in circle(R, 192)]
            objs.append(assign(ring("rim", outer, circle(R - 0.14, 192), 0.2, 0.0), metal))
        else:
            objs.append(assign(ring("rim", outer, circle(R - 0.12), 0.18, 0.0), metal))
        objs += insignia(t["chevrons"], 0.08, 0.12, metal, 1.22)
    elif frame == "hex":
        R = 1.08
        objs.append(assign(prism("plate", hexagon(R - 0.08), 0.1, 0.0, bevel=0.01), enamel))
        objs.append(assign(ring("rim", hexagon(R), hexagon(R - 0.15), 0.2, 0.0, bevel=0.02), metal))
        objs.append(assign(ring("rim2", hexagon(R - 0.24), hexagon(R - 0.28), 0.14, 0.0, bevel=0.006), metal))
        objs += insignia(t["chevrons"], 0.08, 0.13, metal, 1.3)
    elif frame == "shield":
        sh = shield(0.95, 1.15)
        objs.append(assign(prism("plate", inset(sh, 0.09), 0.1, 0.0, bevel=0.01), enamel))
        objs.append(assign(ring("rim", sh, inset(sh, 0.13), 0.22, 0.0, bevel=0.02), metal))
        # wings: two swept blades behind the shield
        for side in (-1, 1):
            wing = [(side * 0.7, 0.55), (side * 1.55, 0.95), (side * 1.35, 0.55), (side * 1.62, 0.5), (side * 1.3, 0.2), (side * 1.5, 0.08), (side * 0.85, -0.05)]
            if side < 0:
                wing = wing[::-1]
            objs.append(assign(prism(f"wing{side}", wing, 0.08, -0.06, bevel=0.01), metal))
        ins = insignia(t["chevrons"], 0.08, 0.13, metal, 1.36)
        for o in ins:
            o.location.y += 0.08
        objs += ins
    else:  # crown — master
        R = 1.0
        cr = crown(R + 0.02)
        objs.append(assign(prism("plate", circle(R - 0.1, 128), 0.1, 0.0, bevel=0.01), enamel))
        objs.append(assign(ring("rim", cr, [(x * (R - 0.14) / math.hypot(x, y), y * (R - 0.14) / math.hypot(x, y)) for x, y in cr], 0.22, 0.0, bevel=0.018), metal))
        objs.append(assign(ring("inner", circle(R - 0.2, 128), circle(R - 0.24, 128), 0.15, 0.0, bevel=0.006), metal))
        ins = insignia(t["chevrons"], 0.08, 0.14, metal, 1.22)
        objs += ins
        # a cut gem set into the lance tip
        gem_mat = material("gem", srgb(t["accent"]), 0.0, 0.02, emission=(srgb(t["accent"]), 0.6))
        gem_mat.node_tree.nodes["Principled BSDF"].inputs["Transmission Weight"].default_value = 0.6
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.075, location=(0, 0, 0.26))
        gem = bpy.context.active_object
        gem.name = "gem"
        # place on the lance tip body
        spear = next(o for o in ins if o.name.startswith("spear"))
        sy = spear.location.y + g(32, 22)[1] * spear.scale.y
        gem.location = (0, sy, 0.24)
        gem.scale = (1, 1.25, 0.7)
        assign(gem, gem_mat)
        objs.append(gem)

    for o in objs:
        o.parent = root
    return root


def stage(root):
    scn = bpy.context.scene
    # world: studio HDRI for metal reflections, hidden by the transparent film
    world = bpy.data.worlds.new("w")
    scn.world = world
    world.use_nodes = True
    nt = world.node_tree
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    hdr = os.path.join(bpy.utils.resource_path("LOCAL"), "datafiles", "studiolights", "world", "studio.exr")
    env.image = bpy.data.images.load(hdr)
    bg = nt.nodes["Background"]
    bg.inputs["Strength"].default_value = 0.9
    nt.links.new(env.outputs["Color"], bg.inputs["Color"])

    def area(name, loc, energy, size, color=(1, 1, 1)):
        d = bpy.data.lights.new(name, "AREA")
        d.energy = energy
        d.size = size
        d.color = color
        o = bpy.data.objects.new(name, d)
        o.location = loc
        scn.collection.objects.link(o)
        c = o.constraints.new("TRACK_TO")
        c.target = root
        return o

    area("key", (-2.6, 3.2, 4.2), 520, 2.6)
    area("fill", (3.4, -1.0, 2.8), 160, 3.5, (0.85, 0.9, 1.0))
    area("rim", (0.5, 4.5, -1.2), 380, 2.0)

    cam_d = bpy.data.cameras.new("cam")
    cam_d.lens = 85
    cam = bpy.data.objects.new("cam", cam_d)
    scn.collection.objects.link(cam)
    cam.location = (0, -0.35, 8.6)
    c = cam.constraints.new("TRACK_TO")
    c.target = root
    scn.camera = cam

    root.rotation_euler = (math.radians(-14), math.radians(20), math.radians(0))

    scn.render.engine = "CYCLES"
    scn.cycles.device = "CPU"
    scn.cycles.samples = SAMPLES
    try:
        scn.cycles.use_denoising = True
    except Exception:
        pass
    scn.render.film_transparent = True
    scn.render.resolution_x = SIZE
    scn.render.resolution_y = SIZE
    scn.render.image_settings.file_format = "PNG"
    scn.render.image_settings.color_mode = "RGBA"
    scn.view_settings.view_transform = "AgX"
    scn.view_settings.look = "AgX - Medium High Contrast"


for tier in TIERS:
    if ONLY and tier not in ONLY:
        continue
    reset()
    root = build(tier)
    stage(root)
    path = os.path.join(OUT, f"{tier}.png").replace("\\", "/")
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("WROTE", path)
