"""Build the Plaça del Portal well in Blender, independently of the town kit.

Blender --background --factory-startup --python scripts/scenery/build-well.py
Original geometry and solid colours, interpreted from street-data photos 11/05.
Design space: game units, Y up, origin at ground centre; no runtime rescaling.
"""
import json
import math
import random
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'art/scenery'
OUT = ROOT / 'public/assets/scenery'
PREVIEW = ROOT / 'artifacts/scenery'
for directory in (SOURCE, OUT, PREVIEW):
    directory.mkdir(parents=True, exist_ok=True)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version = 0
rng = random.Random(1105)
palette = {}


def material(color):
    if color not in palette:
        rgb = [int(color[i:i+2], 16) / 255 for i in (1, 3, 5)]
        rgb = [v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in rgb]
        mat = bpy.data.materials.new('Well ' + color)
        mat.diffuse_color = (*rgb, 1)
        mat.use_nodes = True
        shader = mat.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value = (*rgb, 1)
        shader.inputs['Roughness'].default_value = .92
        palette[color] = mat
    return palette[color]


def mesh(name, vertices, faces, color):
    data = bpy.data.meshes.new(name)
    data.from_pydata([(x, -z, y) for x, y, z in vertices], [], faces)
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(data)
    bm.free()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    data.materials.append(material(color))
    return obj


def box(name, x, y, z, w, h, d, color):
    return mesh(name, [(x+sx*w/2, y+sy*h/2, z+sz*d/2)
                      for sz in [-1, 1] for sy in [-1, 1] for sx in [-1, 1]],
                [(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)], color)


def wedge(name, a, b, inner, outer, bottom, top, color, worn=False):
    """A solid annular segment: actual inner walls, never a capped cylinder."""
    steps = max(2, round((b-a)*6))
    rings = []
    for y, radius in [(bottom, inner), (bottom, outer), (top, inner), (top, outer)]:
        rings.append([(math.cos(t)*radius, y, math.sin(t)*radius)
                      for t in [a+(b-a)*i/steps for i in range(steps+1)]])
    n = steps+1
    faces = [(0, n, 3*n, 2*n), (steps, 2*n+steps, 3*n+steps, n+steps)]
    for i in range(steps):
        faces += [(i,i+1,n+i+1,n+i), (2*n+i,3*n+i,3*n+i+1,2*n+i+1),
                  (i,2*n+i,2*n+i+1,i+1), (n+i,n+i+1,3*n+i+1,3*n+i)]
    obj = mesh(name, [p for ring in rings for p in ring], faces, color)
    if worn:
        # Small chamfers catch light on chipped ashlar edges without image textures.
        bevel = obj.modifiers.new('Worn stone edges', 'BEVEL')
        bevel.width = rng.uniform(.009, .019)
        bevel.segments = 1
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=bevel.name)
    return obj


def tube(name, points, radius, color, sides=5, closed=False):
    """Low-poly rod or closed oval link, with a stable local cross-section."""
    points = [Vector(p) for p in points]
    vertices = []
    for i, p in enumerate(points):
        prev = points[(i-1) % len(points)] if closed or i else points[0]
        nxt = points[(i+1) % len(points)] if closed or i+1 < len(points) else points[-1]
        tangent = (nxt-prev).normalized()
        guide = Vector((0, 0, 1)) if abs(tangent.z) < .9 else Vector((1, 0, 0))
        u = tangent.cross(guide).normalized()
        v = tangent.cross(u).normalized()
        for j in range(sides):
            angle = j*math.tau/sides
            vertices.append(tuple(p + radius*(math.cos(angle)*u+math.sin(angle)*v)))
    faces = []
    for i in range(len(points) if closed else len(points)-1):
        k = (i+1) % len(points)
        for j in range(sides):
            faces.append((i*sides+j, i*sides+(j+1)%sides, k*sides+(j+1)%sides, k*sides+j))
    if not closed:
        faces += [tuple(range(sides-1, -1, -1)), tuple((len(points)-1)*sides+j for j in range(sides))]
    return mesh(name, vertices, faces, color)


IRON = '#343b38'
STONE = ['#ad7967', '#b68470', '#b68c77', '#a97967', '#bf927c', '#ad806c']
# A shallow irregular paved footing and the low side steps seen in photo 05.
for i in range(12):
    wedge(f'Footing | slab {i+1:02}', i*math.tau/12+.004, (i+1)*math.tau/12-.004,
          .01, .85+rng.uniform(-.015, .015), -.16, .085, rng.choice(STONE), True)
box('Side step | lower sandstone', .75, .10, 0, .52, .24, .64, '#ad8871')
box('Side step | upper sandstone', .79, .235, 0, .35, .17, .49, '#b49b80')

wedge('Shaft | recessed mortar backing', 0, math.tau, .49, .69, .045, .76, '#a49780')
for row, (bottom, top, count) in enumerate([(.08,.255,11),(.267,.455,10),(.466,.648,11)]):
    shift = (row % 2)*.26
    for i in range(count):
        a = i*math.tau/count+shift+.012
        b = (i+1)*math.tau/count+shift-.012
        wedge(f'Sandstone | course {row+1} block {i+1:02}', a, b, .487,
              .724+rng.uniform(-.009,.009), bottom+rng.uniform(-.003,.003),
              top+rng.uniform(-.004,.004), rng.choice(STONE), True)
# Oversailing heavy, individually jointed red coping; the opening stays visible.
for i in range(9):
    wedge(f'Coping | rim block {i+1:02}', i*math.tau/9+.009, (i+1)*math.tau/9-.009,
          .46, .775+rng.uniform(-.006,.006), .657, .817+rng.uniform(-.004,.004),
          rng.choice(['#ac7966','#b4826d','#a77865','#ba8d75']), True)
# Dark bottom hides the continuous game terrain inside the hollow well.
mesh('Shaft | dark recessed bottom', [(0,.105,0)]+[
    (.492*math.cos(i*math.tau/32),.105,.492*math.sin(i*math.tau/32)) for i in range(32)],
    [(0,i+1,(i+1)%32+1) for i in range(32)], '#343a30')

# Flat forged iron uprights, broad in the plane of the arch.
for side in [-1, 1]:
    box('Ironwork | anchor plate', side*.61, .835, 0, .25, .024, .16, IRON)
    box('Ironwork | upright', side*.61, 1.294, 0, .038, .91, .052, IRON)
    for z in [-.052, .052]:
        box('Ironwork | anchor bolt', side*.61, .852, z, .018, .016, .018, '#55594f')
# A flattened arch that curves into the two uprights; reference has no roof.
arch = [(.61*math.cos(i*math.pi/28), 1.746+.53*math.sin(i*math.pi/28), 0) for i in range(29)]
verts = [(x, y+dy, z+dz) for x,y,z in arch for dy,dz in [(-.018,-.024),(.018,-.024),(.018,.024),(-.018,.024)]]
faces = [(0,3,2,1), tuple((len(arch)-1)*4+i for i in range(4))]
for i in range(len(arch)-1):
    for j in range(4):
        faces.append((i*4+j,i*4+(j+1)%4,(i+1)*4+(j+1)%4,(i+1)*4+j))
mesh('Ironwork | curved arch', verts, faces, IRON)

# Extruded fleur-de-lis silhouette, traced by interpretation of the reference.
outline = [(-.025,2.26),(-.025,2.44),(-.055,2.50),(-.118,2.52),(-.086,2.555),
           (-.045,2.545),(-.025,2.51),(-.04,2.60),(0,2.73),(.04,2.60),
           (.025,2.51),(.045,2.545),(.086,2.555),(.118,2.52),(.055,2.50),(.025,2.44),(.025,2.26)]
n = len(outline)
mesh('Ironwork | fleur-de-lis finial', [(x,y,z) for z in [-.016,.016] for x,y in outline],
     [tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)], IRON)
box('Pulley | hanger', 0, 2.175, 0, .025, .20, .034, '#4d5146')
for z in [-.037,.037]:
    tube('Pulley | fork', [(0,2.16,z),(0,2.025,z)], .019, '#7b7c68', 6)
wheel = [(math.cos(i*math.tau/28)*.119,2.025+math.sin(i*math.tau/28)*.119,0) for i in range(28)]
tube('Pulley | open wheel rim', wheel, .023, '#656b59', 6, True)
for i in range(4):
    a = i*math.tau/4
    tube('Pulley | spoke', [(0,2.025,0),(.11*math.cos(a),2.025+.11*math.sin(a),0)], .010, '#656b59')
tube('Pulley | axle', [(0,2.025,-.052),(0,2.025,.052)], .018, '#92917a', 8)
for side in [-1,1]:
    for i in range(24):
        y = 2.018-i*.052
        x = side*.12 + (.012*math.sin(i*.23) if side < 0 else 0)
        # Alternating link planes read as chain even from the opposite side.
        oval = []
        for j in range(10):
            a = j*math.tau/10
            width = .014*math.cos(a)
            oval.append((x+(width if i%2 == 0 else 0), y+.031*math.sin(a), width if i%2 else 0))
        tube(f'Chain {side:+} | link {i+1:02}', oval, .0048, '#505247', 4, True)
ring = [(-.108+.030*math.cos(i*math.tau/16), .99+.047*math.sin(i*math.tau/16), .006) for i in range(16)]
tube('Chain | lower grip ring', ring, .007, '#464b40', 5, True)

body = list(bpy.context.scene.objects)
scene = bpy.context.scene
scene['reference'] = 'references/street-data/11-well-and-street-junction-2024.jpg; reverse view: 05-placa-del-portal-2026.jpg'
scene['convention'] = 'Y-up export; origin ground centre. Dimensions already in game units. Iron arch in local XY plane.'
scene['fidelity'] = 'Visual approximation; inferred dimensions and concealed details. No photo textures.'

# Save with individually editable masonry, fittings and chain links, plus a camera.
scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.render.resolution_x = 1000
scene.render.resolution_y = 1000
scene.render.resolution_percentage = 100
scene.world.color = (.32,.32,.32)
scene.world.use_nodes = True
scene.world.node_tree.nodes.get('Background').inputs['Color'].default_value = (.65,.70,.78,1)
scene.world.node_tree.nodes.get('Background').inputs['Strength'].default_value = .55
scene.view_settings.view_transform = 'Standard'
bpy.ops.object.light_add(type='AREA', location=(-3,-4,6))
bpy.context.object.name = 'Preview | softbox'
bpy.context.object.data.energy = 450
bpy.context.object.data.size = 5
bpy.context.object.rotation_euler = (Vector((0,0,1.2))-bpy.context.object.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(3.3,-5.5,3.4))
camera = bpy.context.object
camera.name = 'Preview | well camera'
camera.rotation_euler = (Vector((.05,0,1.30))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 3.55
scene.camera = camera
for area in bpy.context.screen.areas:
    if area.type == 'VIEW_3D':
        area.spaces.active.region_3d.view_distance = 4.5
        area.spaces.active.region_3d.view_location = (0,0,1.3)
bpy.ops.object.select_all(action='DESELECT')
for obj in body:
    obj.select_set(True)
bpy.context.view_layer.objects.active = body[0]
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / 'well.blend'))

# Batch only the export, leaving all editable parts intact in the saved source.
groups = {}
for obj in body:
    groups.setdefault(obj.data.materials[0].name, []).append(obj)
exported = []
for name, objects in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    objects[0].name = name
    exported.append(objects[0])
bpy.ops.object.select_all(action='DESELECT')
for obj in exported:
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT / 'well.glb'), export_format='GLB', use_selection=True,
                          export_yup=True, export_apply=True, export_texcoords=False,
                          export_normals=True, export_animations=False)
stats = {'file':'well.glb','source':'art/scenery/well.blend',
         'triangles':sum(len(p.vertices)-2 for obj in exported for p in obj.data.polygons),
         'materials':len(exported),'height':2.73,'rimRadius':.781,
         'reference':'references/street-data/11-well-and-street-junction-2024.jpg'}
(OUT / 'well.json').write_text(json.dumps(stats, indent=2)+'\n')
box('Preview | ground', 0, -.045, 0, 200, .05, 200, '#c1b9a5')
scene.render.filepath = str(PREVIEW / 'blender-well.png')
bpy.ops.render.render(write_still=True)
print('WELL_STATS', json.dumps(stats))
