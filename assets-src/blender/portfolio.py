# assets-src/blender/portfolio.py — procedural portfolio renders for the demo corpus.
#
#   blender --background --python assets-src/blender/portfolio.py -- <jobs.json> <out_dir> [id ...]
#
# Three generators, all parameter-driven from src/corpus.js:
#   chibi  stylized anime character, toon-shaded (EEVEE) with inverted-hull outlines
#   clay   ZBrush-style clay bust built from metaballs, rendered in Cycles
#   prop   stylized game props (potion, mushroom, crystal, chest, lantern), toon-shaded
# Renders are RGBA with a transparent film; assets-src/finalize.py composites the
# gradient backdrop and contact shadow afterwards.

import json
import math
import os
import random
import sys

import bpy
import bmesh
from mathutils import Vector, Euler

argv = sys.argv[sys.argv.index("--") + 1:]
JOBS, OUT = argv[0], argv[1]
ONLY = set(argv[2:])
W, H = int(os.environ.get("PF_W", "960")), int(os.environ.get("PF_H", "720"))
os.makedirs(OUT, exist_ok=True)


def srgb(hexs):
    h = hexs.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


# ---------------------------------------------------------------- materials

_mats = {}
LIGHT = [Vector((-0.55, -0.62, 0.56)).normalized()]  # world-space key light for toon bands


def toon(hexs, soft=False, shadow=0.68, glow=0.0):
    key = (hexs, soft, shadow, glow)
    if key in _mats:
        return _mats[key]
    m = bpy.data.materials.new(f"toon{len(_mats)}")
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    # Toon band from N . L computed directly (engine-independent, unlike Shader-to-RGB).
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    dot = nt.nodes.new("ShaderNodeVectorMath")
    dot.operation = "DOT_PRODUCT"
    dot.inputs[1].default_value = LIGHT[0]
    remap = nt.nodes.new("ShaderNodeMath")
    remap.operation = "MULTIPLY_ADD"
    remap.inputs[1].default_value = 0.5
    remap.inputs[2].default_value = 0.5
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "EASE" if soft else "CONSTANT"
    e0, e1 = ramp.color_ramp.elements
    e0.position, e1.position = 0.0, 0.47 if not soft else 0.62
    e0.color = (shadow, shadow * 0.97, min(1, shadow * 1.06), 1)
    e1.color = (1, 1, 1, 1)
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    mix.inputs["A"].default_value = (*srgb(hexs), 1)
    emi = nt.nodes.new("ShaderNodeEmission")
    emi.inputs["Strength"].default_value = 1.0 + glow
    nt.links.new(geo.outputs["Normal"], dot.inputs[0])
    nt.links.new(dot.outputs["Value"], remap.inputs[0])
    nt.links.new(remap.outputs["Value"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], mix.inputs["B"])
    nt.links.new(mix.outputs["Result"], emi.inputs["Color"])
    nt.links.new(emi.outputs["Emission"], out.inputs["Surface"])
    _mats[key] = m
    return m


def ink(hexs):
    """Outline material: darker version of the fill, backface-culled (inverted hull)."""
    key = ("ink", hexs)
    if key in _mats:
        return _mats[key]
    c = srgb(hexs)
    m = bpy.data.materials.new(f"ink{len(_mats)}")
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emi = nt.nodes.new("ShaderNodeEmission")
    emi.inputs["Color"].default_value = (c[0] * 0.18, c[1] * 0.14, c[2] * 0.2, 1)
    nt.links.new(emi.outputs["Emission"], out.inputs["Surface"])
    m.use_backface_culling = True
    _mats[key] = m
    return m


def principled(hexs, rough=0.5, metal=0.0, sss=0.0, name="p"):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*srgb(hexs), 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if sss:
        b.inputs["Subsurface Weight"].default_value = sss
        b.inputs["Subsurface Radius"].default_value = (0.3, 0.12, 0.08)
        b.inputs["Subsurface Scale"].default_value = 0.08
    return m


# ---------------------------------------------------------------- primitives

def outline(ob, hexs, t=0.022):
    ob.data.materials.append(ink(hexs))
    mod = ob.modifiers.new("outline", "SOLIDIFY")
    mod.thickness = t
    mod.offset = 1.0
    mod.use_flip_normals = True
    mod.material_offset = len(ob.data.materials) - 1
    mod.use_rim = False


def finish(ob, mat, parent, line=True, smooth=True, t=0.022, subdiv=1):
    ob.data.materials.append(mat)
    if smooth:
        for p in ob.data.polygons:
            p.use_smooth = True
    if subdiv:
        s = ob.modifiers.new("sub", "SUBSURF")
        s.levels = subdiv
        s.render_levels = subdiv
    if line:
        base = mat.node_tree.nodes.get("Mix")
        hexs = "#303030"
        if base is not None:
            c = base.inputs["A"].default_value
            hexs = "#%02x%02x%02x" % tuple(int(min(1, x) ** (1 / 2.2) * 255) for x in c[:3])
        outline(ob, hexs, t)
    ob.parent = parent
    return ob


def ellipsoid(loc, scale, rot=(0, 0, 0), seg=32):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2, radius=1, location=loc)
    ob = bpy.context.active_object
    ob.scale = scale
    ob.rotation_euler = [math.radians(a) for a in rot]
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return ob


def cylinder(loc, r, depth, rot=(0, 0, 0), verts=32, r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=depth, location=loc)
    ob = bpy.context.active_object
    ob.rotation_euler = [math.radians(a) for a in rot]
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return ob


def cone(loc, r, depth, rot=(0, 0, 0), verts=24):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=0, depth=depth, location=loc)
    ob = bpy.context.active_object
    ob.rotation_euler = [math.radians(a) for a in rot]
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return ob


def torus(loc, R, r, rot=(0, 0, 0), arc=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=48, minor_segments=12, location=loc)
    ob = bpy.context.active_object
    ob.rotation_euler = [math.radians(a) for a in rot]
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return ob


def box(loc, size, rot=(0, 0, 0), bevel=0.04):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    ob = bpy.context.active_object
    ob.scale = size
    ob.rotation_euler = [math.radians(a) for a in rot]
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if bevel:
        b = ob.modifiers.new("bev", "BEVEL")
        b.width = bevel
        b.segments = 3
    return ob


def tube(points, radii, seg=16):
    """Loft circles along a polyline; tapering radii give horns, tails, locks."""
    bm = bmesh.new()
    rings = []
    for i, (p, r) in enumerate(zip(points, radii)):
        p = Vector(p)
        d = (Vector(points[min(i + 1, len(points) - 1)]) - Vector(points[max(i - 1, 0)])).normalized()
        a = d.orthogonal().normalized()
        b = d.cross(a).normalized()
        ring = [bm.verts.new(p + r * (math.cos(t) * a + math.sin(t) * b)) for t in [2 * math.pi * k / seg for k in range(seg)]]
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(seg):
            bm.faces.new([r0[k], r0[(k + 1) % seg], r1[(k + 1) % seg], r1[k]])
    bm.faces.new(list(reversed(rings[0])))
    tip = bm.verts.new(Vector(points[-1]) + (Vector(points[-1]) - Vector(points[-2])).normalized() * radii[-1])
    for k in range(seg):
        bm.faces.new([rings[-1][k], rings[-1][(k + 1) % seg], tip])
    me = bpy.data.meshes.new("tube")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("tube", me)
    bpy.context.collection.objects.link(ob)
    return ob


def empty(name="root"):
    e = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(e)
    return e


# ---------------------------------------------------------------- chibi

def head_point(dx, dz, head_c, head_s):
    """Point on the head ellipsoid in direction (dx, -1, dz) — i.e. on the face."""
    d = Vector((dx, -1.0, dz)).normalized()
    return Vector((head_c[0] + d.x * head_s[0], head_c[1] + d.y * head_s[1], head_c[2] + d.z * head_s[2]))


def build_chibi(p, root):
    soft = p.get("shade") == "soft"
    T = lambda c, **k: toon(c, soft=soft, **k)
    skin, hair, hair2 = p["skin"], p["hair"], p.get("hair2", p["hair"])
    outfit, outfit2 = p["outfit"], p.get("outfit2", p["outfit"])
    style, acc = p.get("style", "short"), p.get("acc", "none")
    robot = style == "robot"

    hc, hs = (0, 0, 1.42), (0.66, 0.6, 0.62)
    finish(ellipsoid(hc, hs), T(skin), root)
    # face
    for side in (-1, 1):
        e = head_point(side * 0.36, -0.12, hc, hs)
        finish(ellipsoid(e + Vector((0, 0.03, 0)), (0.1, 0.05, 0.15)), toon(p["eyes"], shadow=0.8), root, t=0.012)
        finish(ellipsoid(e + Vector((side * 0.02, -0.03, 0.06)), (0.035, 0.02, 0.045)), toon("#ffffff", shadow=1.0), root, line=False)
        finish(ellipsoid(head_point(side * 0.55, -0.33, hc, hs) + Vector((0, 0.02, 0)), (0.08, 0.02, 0.04)), toon("#ff9fb2", shadow=1.0), root, line=False)
    finish(ellipsoid(head_point(0, -0.36, hc, hs) + Vector((0, 0.01, 0)), (0.045, 0.02, 0.02)), toon("#7a2e3a", shadow=1.0), root, line=False)

    if robot:
        finish(ellipsoid((0, -0.2, 1.46), (0.55, 0.36, 0.3)), toon("#1b2a3a", shadow=0.9), root)
        for side in (-1, 1):
            finish(ellipsoid((side * 0.2, -0.53, 1.46), (0.1, 0.04, 0.07)), toon(p["eyes"], glow=0.6, shadow=1.0), root, line=False)
    else:
        # hair cap + bangs + side locks
        finish(ellipsoid((0, 0.1, 1.5), (0.71, 0.66, 0.66)), T(hair), root)
        for i, dx in enumerate([-0.42, -0.2, 0.02, 0.24, 0.44]):
            finish(ellipsoid((dx, -0.46, 1.78 - abs(dx) * 0.25), (0.17, 0.12, 0.26), rot=(18, 0, dx * 40)), T(hair if i % 2 else hair2), root)
        for side in (-1, 1):
            finish(ellipsoid((side * 0.6, -0.2, 1.18), (0.13, 0.13, 0.36), rot=(0, side * -8, 0)), T(hair), root)

    if style == "twintails":
        for side in (-1, 1):
            finish(tube([(side * 0.5, 0.42, 1.92), (side * 0.85, 0.5, 1.62), (side * 0.95, 0.5, 1.05), (side * 0.82, 0.45, 0.4)], [0.13, 0.25, 0.21, 0.07]), T(hair), root)
            finish(ellipsoid((side * 0.52, 0.36, 1.94), (0.1, 0.1, 0.1)), T(outfit2), root)
    elif style == "long":
        finish(ellipsoid((0, 0.34, 0.95), (0.64, 0.3, 0.72)), T(hair2), root)
    elif style == "ponytail":
        finish(tube([(0, 0.55, 1.62), (0, 0.85, 1.35), (0, 0.9, 0.95), (0, 0.8, 0.6)], [0.18, 0.2, 0.15, 0.05]), T(hair), root)
    elif style == "bun":
        finish(ellipsoid((0, 0.18, 2.1), (0.25, 0.25, 0.22)), T(hair2), root)

    # body
    finish(ellipsoid((0, 0, 0.62), (0.38, 0.3, 0.42)), T(outfit), root)
    finish(cylinder((0, 0, 0.3), 0.44, 0.34, r2=0.3), T(outfit2 if not robot else outfit), root)
    finish(ellipsoid((0, -0.28, 0.82), (0.14, 0.05, 0.08)), T(outfit2), root, t=0.012)  # collar / bow
    for side in (-1, 1):
        finish(ellipsoid((side * 0.42, 0, 0.62), (0.11, 0.11, 0.27), rot=(0, side * 18, 0)), T(outfit), root)
        finish(ellipsoid((side * 0.5, -0.02, 0.36), (0.1, 0.1, 0.1)), T(skin), root)
        finish(ellipsoid((side * 0.15, 0, 0.08), (0.12, 0.12, 0.16)), T(skin if not robot else outfit2), root)
        finish(ellipsoid((side * 0.16, -0.06, -0.06), (0.14, 0.18, 0.08)), T("#3a2b35" if not robot else outfit2), root)

    # accessories
    if acc in ("catears", "foxears", "bunnyears"):
        for side in (-1, 1):
            if acc == "bunnyears":
                finish(ellipsoid((side * 0.25, 0.05, 2.25), (0.1, 0.06, 0.38), rot=(0, side * 12, 0)), T(hair), root)
            else:
                finish(cone((side * 0.42, 0.05, 2.0), 0.2 if acc == "catears" else 0.22, 0.42 if acc == "catears" else 0.52, rot=(0, side * 22, 0), verts=4), T(hair), root, subdiv=1)
                finish(cone((side * 0.42, -0.04, 1.98), 0.1, 0.26, rot=(0, side * 22, 0), verts=4), T(outfit2), root, line=False, subdiv=1)
    elif acc == "elfears":
        for side in (-1, 1):
            finish(cone((side * 0.72, 0.02, 1.45), 0.1, 0.5, rot=(0, side * -70, 0), verts=12), T(skin), root)
    elif acc == "witchhat":
        finish(cylinder((0, 0.05, 1.98), 0.95, 0.05), T(outfit), root, subdiv=0)
        finish(tube([(0, 0.05, 2.0), (0, 0.1, 2.4), (0.15, 0.2, 2.75), (0.4, 0.3, 2.9)], [0.52, 0.34, 0.18, 0.05]), T(outfit), root)
        finish(torus((0, 0.05, 2.05), 0.5, 0.06), T(outfit2), root)
    elif acc == "staff":
        finish(cylinder((0.72, -0.05, 0.9), 0.05, 1.9, rot=(0, 8, 0)), T("#8a5a36"), root)
        finish(ellipsoid((0.86, -0.05, 1.9), (0.16, 0.16, 0.16)), toon(outfit2 if outfit2 != "#ffffff" else p["eyes"], glow=0.4), root)
        finish(torus((0.85, -0.05, 1.9), 0.2, 0.03, rot=(90, 0, 0)), T("#f5c542"), root)
    elif acc == "headphones":
        finish(torus((0, 0.05, 1.5), 0.74, 0.05, rot=(90, 0, 90)), T(outfit), root)
        for side in (-1, 1):
            finish(cylinder((side * 0.72, 0.02, 1.4), 0.17, 0.14, rot=(0, 90, 0)), T(outfit2), root)
    elif acc == "helmet":
        finish(ellipsoid((0, 0.05, 1.62), (0.74, 0.7, 0.55)), T(outfit), root)
        finish(cylinder((0, -0.02, 2.2), 0.05, 0.3), T(outfit2), root)
        finish(ellipsoid((0, 0.1, 2.35), (0.08, 0.3, 0.12)), T(outfit2), root)
    elif acc == "hood":
        finish(ellipsoid((0, 0.18, 1.55), (0.78, 0.66, 0.72)), T(outfit), root)
    elif acc == "pirate":
        finish(cylinder((0, 0.05, 2.0), 0.72, 0.12, r2=0.55), T(outfit), root)
        finish(cylinder((0, 0.05, 2.18), 0.46, 0.3, r2=0.38), T(outfit), root)
        finish(torus((0, 0.05, 2.08), 0.56, 0.04), T(outfit2), root)
    elif acc == "ribbon":
        for side in (-1, 1):
            finish(ellipsoid((side * 0.2, 0.62, 1.7), (0.18, 0.06, 0.12), rot=(0, side * 20, 0)), T(outfit2), root)
    elif acc == "star":
        finish(cone((0.45, -0.3, 1.9), 0.12, 0.08, verts=5, rot=(80, 0, 0)), toon("#ffd166", glow=0.3), root)
    elif acc == "antenna":
        finish(cylinder((0, 0.05, 2.15), 0.03, 0.4), T(outfit2), root)
        finish(ellipsoid((0, 0.05, 2.38), (0.08, 0.08, 0.08)), toon(p["eyes"], glow=0.8), root)


# ---------------------------------------------------------------- clay bust

def build_clay(p, root):
    """Overlapping ellipsoids fused by a voxel remesh, then smoothed and displaced:
    the same blockout-then-refine path a ZBrush bust takes."""
    rnd = random.Random(p.get("seed", 1))
    low = p.get("lowpoly", False)
    j = lambda s: (rnd.random() - 0.5) * s
    parts = [
        ellipsoid((0, 0.06, 1.62), (0.6, 0.68, 0.7)),                       # cranium
        ellipsoid((0, -0.2, 1.22), (0.44, 0.46, 0.46)),                      # jaw
        ellipsoid((0, -0.36, 1.02), (0.24, 0.2, 0.16)),                      # chin
        ellipsoid((0, -0.6, 1.46 + j(0.04)), (0.09, 0.16, 0.2), rot=(-18, 0, 0)),  # nose
        ellipsoid((0, -0.06, 0.82), (0.3, 0.3, 0.34)),                       # neck
        ellipsoid((0, 0.05, 0.36), (1.05, 0.52, 0.42)),                      # chest / shoulders
    ]
    for s in (-1, 1):
        parts += [
            ellipsoid((s * 0.26, -0.5, 1.72), (0.24, 0.12, 0.1), rot=(0, s * -12, 0)),   # brow
            ellipsoid((s * 0.34, -0.38, 1.4), (0.18, 0.14, 0.14)),                        # cheekbone
            ellipsoid((s * 0.6, 0.02, 1.48), (0.06, 0.14, 0.2)),                          # ear
            ellipsoid((s * 0.62, 0.05, 0.52), (0.36, 0.34, 0.3)),                         # deltoid
            ellipsoid((s * 0.3, -0.12, 0.72), (0.3, 0.2, 0.26), rot=(0, s * 30, 0)),      # trapezius
        ]
    if p.get("beard"):
        parts.append(ellipsoid((0, -0.34, 1.06), (0.46, 0.3, 0.34)))
        parts.append(ellipsoid((0, -0.42, 0.9), (0.3, 0.22, 0.26)))
        for s in (-1, 1):
            parts.append(ellipsoid((s * 0.16, -0.58, 1.3), (0.16, 0.07, 0.06), rot=(0, s * 20, 0)))  # moustache
    if p.get("horns"):
        for s in (-1, 1):
            pts = [(s * (0.32 + 0.42 * math.sin(t * 1.3)), 0.12 + 0.45 * t, 2.02 + 0.5 * math.sin(t * 2.1) - 0.35 * t * t) for t in [k / 10 for k in range(11)]]
            parts.append(tube(pts, [0.14 * (1 - k / 11) ** 0.9 + 0.012 for k in range(11)], seg=18))
    bpy.ops.object.select_all(action="DESELECT")
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    bust = bpy.context.active_object
    rm = bust.modifiers.new("fuse", "REMESH")
    rm.mode = "VOXEL"
    rm.voxel_size = 0.06 if low else 0.018
    if not low:
        sm = bust.modifiers.new("soften", "SMOOTH")
        sm.factor = 0.8
        sm.iterations = 6
        tex = bpy.data.textures.new("skin", "CLOUDS")
        tex.noise_scale = 0.06
        tex.noise_depth = 4
        d = bust.modifiers.new("skin", "DISPLACE")
        d.texture = tex
        d.strength = 0.012
        tex2 = bpy.data.textures.new("form", "VORONOI")
        tex2.noise_scale = 0.28
        d2 = bust.modifiers.new("form", "DISPLACE")
        d2.texture = tex2
        d2.strength = -0.025
    for poly in bust.data.polygons:
        poly.use_smooth = not low
    bust.data.materials.append(principled(p["clay"], rough=0.62, sss=0.0 if low else 0.12, name="clay"))
    bust.parent = root
    # eye sockets read as shadowed cavities: dark inset discs
    if not low:
        for s in (-1, 1):
            eye = ellipsoid((s * 0.22, -0.5, 1.56), (0.09, 0.05, 0.06))
            eye.data.materials.append(principled(p["clay"], rough=0.3, name="eye"))
            for poly in eye.data.polygons:
                poly.use_smooth = True
            eye.parent = root
    if p.get("helmet"):
        hel = ellipsoid((0, 0.06, 1.7), (0.7, 0.8, 0.74))
        bm = bmesh.new()
        bm.from_mesh(hel.data)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < 0.08], context="VERTS")  # local coords
        bm.to_mesh(hel.data)
        bm.free()
        sol = hel.modifiers.new("sol", "SOLIDIFY")
        sol.thickness = 0.06
        hel.modifiers.new("sub", "SUBSURF").levels = 2
        ridge = torus((0, 0.06, 1.8), 0.66, 0.05, rot=(0, 0, 0))
        ridge.scale = (1.0, 1.12, 1)
        for o in (hel, ridge):
            o.data.materials.append(principled("#8a8f96", rough=0.28, metal=1.0, name="steel"))
            for poly in o.data.polygons:
                poly.use_smooth = not low
            o.parent = root


# ---------------------------------------------------------------- props

def build_prop(p, root):
    t = p["type"]
    c1, c2, c3 = p["c1"], p["c2"], p["c3"]
    if t == "potion":
        for i, (x, scale, col, shape) in enumerate([(-0.75, 0.8, c1, "round"), (0.05, 1.0, c2, "tall"), (0.85, 0.72, c3, "flask")]):
            z0 = 0
            if shape == "round":
                finish(ellipsoid((x, 0, 0.5 * scale), (0.48 * scale, 0.48 * scale, 0.48 * scale)), toon(col, shadow=0.72), root)
                neck_z = 0.98 * scale
            elif shape == "tall":
                finish(cylinder((x, 0, 0.6 * scale), 0.36 * scale, 1.1 * scale), toon(col, shadow=0.72), root, subdiv=1)
                neck_z = 1.2 * scale
            else:
                finish(cylinder((x, 0, 0.35 * scale), 0.5 * scale, 0.7 * scale, r2=0.18 * scale), toon(col, shadow=0.72), root, subdiv=1)
                neck_z = 0.72 * scale
            finish(cylinder((x, 0, neck_z + 0.12 * scale), 0.14 * scale, 0.26 * scale), toon("#e9f3f5", shadow=0.8), root, subdiv=0)
            finish(cylinder((x, 0, neck_z + 0.3 * scale), 0.12 * scale, 0.14 * scale), toon("#9a6a45"), root, subdiv=0)
            finish(ellipsoid((x - 0.14 * scale, -0.42 * scale, neck_z * 0.55), (0.05 * scale, 0.03, 0.18 * scale), rot=(0, 20, 0)), toon("#ffffff", shadow=1.0), root, line=False)
    elif t == "mushroom":
        for x, y, s in [(-0.2, 0, 1.0), (0.75, -0.25, 0.62), (-0.95, 0.2, 0.5)]:
            finish(cylinder((x, y, 0.38 * s), 0.2 * s, 0.76 * s, r2=0.15 * s), toon(c2), root, subdiv=1)
            cap = ellipsoid((x, y, 0.8 * s), (0.62 * s, 0.62 * s, 0.4 * s))
            finish(cap, toon(c1, shadow=0.66), root)
            for k in range(6):
                a = k * 1.1 + x
                finish(ellipsoid((x + 0.35 * s * math.cos(a), y - 0.25 * s + 0.2 * s * math.sin(a), 0.98 * s + 0.08 * s * math.sin(a)), (0.09 * s, 0.09 * s, 0.05 * s)), toon(c2, shadow=0.9), root, line=False)
        for k in range(9):
            finish(cone((-1.3 + k * 0.33, -0.35 + (k % 3) * 0.12, 0.1), 0.07, 0.3, rot=((k % 3 - 1) * 12, (k % 2) * 10, 0), verts=6), toon(c3), root, subdiv=0)
    elif t == "crystal":
        finish(ellipsoid((0, 0, 0.1), (1.1, 0.8, 0.28)), toon(c3, shadow=0.7), root)
        for k, (x, y, h, r, tilt, col) in enumerate([(0, 0, 1.6, 0.3, 0, c1), (-0.45, 0.1, 1.1, 0.22, -22, c2), (0.45, -0.05, 1.2, 0.24, 20, c1), (-0.15, -0.35, 0.8, 0.18, -8, c2), (0.3, 0.35, 0.9, 0.18, 14, c2)]):
            body = cylinder((x, y, h / 2), r, h * 0.7, rot=(0, tilt, 0), verts=6)
            finish(body, toon(col, shadow=0.62, glow=0.15), root, subdiv=0, smooth=False)
            tip_z = h * 0.7
            tipx = x + math.sin(math.radians(tilt)) * (tip_z - h / 2 + h * 0.35)
            finish(cone((tipx, y, h / 2 + h * 0.35 * math.cos(math.radians(tilt)) + h * 0.15), r, h * 0.3, rot=(0, tilt, 0), verts=6), toon(col, shadow=0.62, glow=0.15), root, subdiv=0, smooth=False)
    elif t == "chest":
        finish(box((0, 0, 0.4), (1.5, 0.95, 0.8)), toon(c1), root, subdiv=0)
        lid = cylinder((0, 0, 0.8), 0.48, 1.5, rot=(0, 90, 0))
        lid.scale = (1, 1, 0.75)
        finish(lid, toon(c1, shadow=0.72), root, subdiv=0)
        for x in (-0.55, 0.55):
            finish(box((x, 0, 0.62), (0.14, 1.0, 1.25), bevel=0.02), toon(c2, shadow=0.6), root, subdiv=0)
        finish(box((0, -0.5, 0.72), (0.26, 0.08, 0.3), bevel=0.02), toon(c2, shadow=0.6), root, subdiv=0)
        for k in range(7):
            finish(ellipsoid((-1.0 + k * 0.33, -0.7 - (k % 2) * 0.1, 0.1), (0.12, 0.12, 0.1)), toon(c3 if k % 2 else "#f2c14e", glow=0.2), root)
    elif t == "lantern":
        finish(cylinder((0, 0, 0.08), 0.55, 0.16), toon(c2), root, subdiv=0)
        finish(ellipsoid((0, 0, 0.75), (0.42, 0.42, 0.55)), toon(c3, glow=1.4, shadow=1.0), root)
        for k in range(6):
            a = k * math.pi / 3
            finish(cylinder((0.45 * math.cos(a), 0.45 * math.sin(a), 0.75), 0.04, 1.2), toon(c2), root, subdiv=0)
        finish(cylinder((0, 0, 1.45), 0.7, 0.35, r2=0.08), toon(c1), root, subdiv=0)
        finish(torus((0, 0, 1.8), 0.22, 0.04, rot=(90, 0, 0)), toon(c2), root)
        light = bpy.data.lights.new("glow", "POINT")
        light.energy = 60
        light.color = srgb(c3)
        lo = bpy.data.objects.new("glow", light)
        lo.location = (0, 0, 0.75)
        bpy.context.collection.objects.link(lo)


# ---------------------------------------------------------------- staging

def stage(kind, p, root):
    scn = bpy.context.scene
    world = bpy.data.worlds.new("w")
    scn.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.6, 0.62, 0.66, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.35 if kind == "clay" else 0.12

    root.rotation_euler = (0, 0, math.radians(p.get("turn", 0)))
    light_n = p.get("light", 1)
    sun_d = bpy.data.lights.new("sun", "SUN")
    sun_d.energy = 2.4 if kind != "clay" else 0
    sun = bpy.data.objects.new("sun", sun_d)
    sun.rotation_euler = Euler((math.radians(58), 0, math.radians(-62 + 5 * (light_n - 1))))
    scn.collection.objects.link(sun)

    cam_d = bpy.data.cameras.new("cam")
    cam = bpy.data.objects.new("cam", cam_d)
    scn.collection.objects.link(cam)
    scn.camera = cam
    target = empty("target")
    if kind == "chibi":
        cam_d.lens = 70
        cam.location = (0, -7.0, 1.9)
        target.location = (0, 0, 1.2)
    elif kind == "clay":
        cam_d.lens = 85
        cam.location = (0, -7.4, 1.9)
        target.location = (0, 0, 1.25)
    else:
        cam_d.lens = 60
        cam.location = (0, -5.6, 2.3)
        target.location = (0, 0, 0.6)
    c = cam.constraints.new("TRACK_TO")
    c.target = target

    if kind == "clay":
        def area(name, loc, energy, size, color):
            d = bpy.data.lights.new(name, "AREA")
            d.energy, d.size, d.color = energy, size, color
            o = bpy.data.objects.new(name, d)
            o.location = loc
            scn.collection.objects.link(o)
            k = o.constraints.new("TRACK_TO")
            k.target = target
        area("key", (-3.5, -3.5, 4.5), 900, 2.5, (1.0, 0.94, 0.86))
        area("rim", (3.0, 3.5, 3.0), 700, 1.5, (0.75, 0.85, 1.0))
        area("fill", (4.0, -4.0, 1.0), 120, 4.0, (0.9, 0.95, 1.0))
        scn.render.engine = "CYCLES"
        scn.cycles.device = "CPU"
        scn.cycles.samples = int(os.environ.get("PF_SAMPLES", "64"))
        scn.cycles.use_denoising = True
        scn.view_settings.view_transform = "AgX"
        scn.view_settings.look = "AgX - Punchy"
    else:
        scn.render.engine = "BLENDER_EEVEE"
        scn.view_settings.view_transform = "Standard"
    scn.render.film_transparent = True
    scn.render.resolution_x, scn.render.resolution_y = W, H
    scn.render.image_settings.file_format = "PNG"
    scn.render.image_settings.color_mode = "RGBA"


with open(JOBS, encoding="utf-8") as fh:
    jobs = json.load(fh)
for job in jobs:
    if job["kind"] not in ("chibi", "clay", "prop"):
        continue
    if ONLY and job["id"] not in ONLY:
        continue
    reset()
    _mats.clear()
    a = math.radians(5 * (job.get("light", 1) - 1))
    base = Vector((-0.55, -0.62, 0.56))
    LIGHT[0] = Vector((base.x * math.cos(a) - base.y * math.sin(a), base.x * math.sin(a) + base.y * math.cos(a), base.z)).normalized()
    root = empty()
    {"chibi": build_chibi, "clay": build_clay, "prop": build_prop}[job["kind"]](job, root)
    stage(job["kind"], job, root)
    path = os.path.join(OUT, job["id"] + ".png").replace("\\", "/")
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("WROTE", path)
