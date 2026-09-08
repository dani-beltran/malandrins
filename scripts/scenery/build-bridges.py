"""Original masonry bridges inspired by references/street-data/14-bridge-coll-de-la-mola.jpg.
Run Blender --background --factory-startup --python scripts/scenery/build-bridges.py
Editable sources include preview barriers; GLBs contain the reusable arch/deck shells.
Runtime adds terrain-fitted approaches without barriers. No image pixels are used as textures.
"""
import bpy
import math
import json
import random
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'art/scenery'
OUT = ROOT / 'public/assets/scenery'
PREVIEW = ROOT / 'artifacts/bridges'
for directory in [SOURCE, OUT, PREVIEW]:
    directory.mkdir(parents=True, exist_ok=True)

materials = {}
def material(color):
    if color in materials:
        return materials[color]
    rgb = [int(color[i:i+2], 16)/255 for i in (1, 3, 5)]
    linear = [x/12.92 if x <= .04045 else ((x+.055)/1.055)**2.4 for x in rgb]
    m = bpy.data.materials.new('Bridge ' + color)
    m.diffuse_color = (*linear, 1)
    m.use_nodes = True
    shader = m.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*linear, 1)
    shader.inputs['Roughness'].default_value = .9
    materials[color] = m
    return m

def mesh(name, vertices, faces, color):
    data = bpy.data.meshes.new(name)
    # Author in game coordinates (Y up, Z along the road), convert to Blender.
    data.from_pydata([(x, -z, y) for x, y, z in vertices], [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    data.materials.append(material(color))
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(data)
    bm.free()
    return obj

def box(name, x, y, z, w, h, length, color):
    vertices = [(x+sx*w/2, y+sy*h/2, z+sz*length/2) for sz in [-1,1] for sy in [-1,1] for sx in [-1,1]]
    return mesh(name, vertices, [(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)], color)

def prism(name, profile, x0, x1, color):
    n = len(profile)
    vertices = [(x, y, z) for x in [x0, x1] for z, y in profile]
    return mesh(name, vertices, [tuple(range(n-1,-1,-1)), tuple(range(n,2*n))] + [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)], color)

stats = {}
for length, arches in [(8,1),(16,2),(32,3),(64,5),(128,9)]:
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    rng = random.Random(1409)
    name = f'bridge-stone-{length}'
    width, pier = 5, .65
    opening = (length - (arches+1)*pier) / arches
    rise = min(3.3, opening*.43)
    spring = -.7-rise
    intervals = []
    box('Deck | pale paving', 0, -.225, 0, width, .45, length, '#c6b99e')
    for i in range(arches+1):
        z = -length/2 + pier/2 + i*(opening+pier)
        box(f'Pier {i+1:02} | bank foundation', 0, -4.25, z, width, 7.6, pier, '#a79574')
    for i in range(arches):
        center = -length/2 + pier + opening/2 + i*(opening+pier)
        intervals.append((center, opening/2))
        for j in range(16):
            a, b = j*math.pi/16, (j+1)*math.pi/16
            za, zb = center+math.cos(a)*opening/2, center+math.cos(b)*opening/2
            ya, yb = spring+math.sin(a)*rise, spring+math.sin(b)*rise
            prism(f'Arch {i+1:02} | vault {j:02}', [(za,ya),(zb,yb),(zb,-.45),(za,-.45)], -width/2, width/2, rng.choice(['#af9d7d','#b6a384','#a39173']))
            for side in [-1, 1]:
                x = side*(width/2+.015)
                prism(f'Arch {i+1:02} | ring stone {j:02}', [(za,ya),(zb,yb),(zb,yb+.27),(za,ya+.27)], x-.025, x+.025, rng.choice(['#c4b494','#bcaa87','#aa9778']))
    def underside(z):
        for center, half in intervals:
            t = (z-center)/half
            if abs(t) <= 1:
                return spring+math.sqrt(max(0,1-t*t))*rise
        return -8
    # Sparse original masonry courses. Keep each stone entirely outside the arch.
    for side in [-1, 1]:
        for row in range(10):
            y = -.7-row*.36
            z = -length/2+.1-(.3 if row%2 else 0)
            while z < length/2-.1:
                w = rng.uniform(.6,1.1)
                left, right = max(-length/2+.015,z), min(length/2-.015,z+w-.035)
                if right > left and all(y-.15 > underside(v)+.29 for v in [left,(left+right)/2,right]):
                    box('Masonry | weathered facing', side*(width/2+.026), y, (left+right)/2, .045, .28, right-left, rng.choice(['#b6a584','#bbaa89','#a99879','#c0b08e']))
                z += w
    body = list(bpy.context.scene.objects)
    for side in [-1,1]:
        for j in range(math.ceil(length/3)+1):
            z = -length/2+length*j/math.ceil(length/3)
            box('Preview only | iron post', side*2.38, .6, z, .065, 1.05, .065, '#55574e')
            box('Preview only | red post tip', side*2.38, 1.1, z, .073, .2, .073, '#9b4f44')
        for y in [.45,.86]:
            box('Preview only | wire', side*2.38, y, 0, .025, .025, length, '#51534a')
    bpy.context.scene['reference'] = 'references/street-data/14-bridge-coll-de-la-mola.jpg'
    bpy.context.scene['convention'] = 'Export Y up, +Z along road, deck centre at (0,0,0). Width 5 game units. No further geographic scaling.'
    bpy.context.scene['nominal_length'] = length
    bpy.context.scene['arches'] = arches
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / (name+'.blend')))
    bpy.ops.object.select_all(action='DESELECT')
    for obj in body:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT / (name+'.glb')), export_format='GLB', use_selection=True, export_yup=True, export_apply=True, export_texcoords=False, export_normals=True, export_animations=False)
    stats[name] = {'length':length, 'width':width, 'arches':arches, 'deck_thickness':.45, 'source':f'art/scenery/{name}.blend', 'triangles':sum(len(o.data.polygons)*2 for o in body), 'reference':'references/street-data/14-bridge-coll-de-la-mola.jpg'}
    if length == 16:
        box('Preview | bank', 0, -5.3, 0, 26, 1, 30, '#7e8966')
        box('Preview | channel', 0, -4.68, 0, 26, .08, 9, '#78948a')
        scene = bpy.context.scene
        scene.render.engine = 'CYCLES'
        scene.cycles.samples = 32
        scene.render.resolution_x = 1200
        scene.render.resolution_y = 850
        scene.render.resolution_percentage = 100
        scene.world.color = (.3,.3,.3)
        bpy.ops.object.light_add(type='AREA', location=(4,-3,14))
        bpy.context.object.data.energy = 2300
        bpy.context.object.data.shape = 'DISK'
        bpy.context.object.data.size = 10
        bpy.ops.object.camera_add(location=(19,19,12))
        camera = bpy.context.object
        camera.rotation_euler = (Vector((0,0,-1.1))-camera.location).to_track_quat('-Z','Y').to_euler()
        camera.data.type = 'ORTHO'
        camera.data.ortho_scale = 24
        scene.camera = camera
        scene.render.filepath = str(PREVIEW / 'blender-stone-bridge.png')
        bpy.ops.render.render(write_still=True)

(OUT / 'bridges.json').write_text(json.dumps(stats, indent=2)+'\n')
