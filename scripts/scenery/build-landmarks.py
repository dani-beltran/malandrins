"""Blender background generator for original low-poly, reference-matched landmarks.
Run: Blender --background --python scripts/scenery/build-landmarks.py
All dimensions are game units. Design space is X right, Y up, +Z out of facade.
"""
import bpy, math, random, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'public/assets/scenery'
SOURCE=ROOT/'art/scenery'
OUT.mkdir(parents=True,exist_ok=True);SOURCE.mkdir(parents=True,exist_ok=True)
palette={}
stats={}

def mat(hex):
    if hex in palette:return palette[hex]
    m=bpy.data.materials.new('Town '+hex);c=hex.lstrip('#');rgb=[int(c[i:i+2],16)/255 for i in (0,2,4)]
    # Blender material base colors are linear; convert the chosen sRGB palette.
    rgb=[x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in rgb]
    m.diffuse_color=(*rgb,1);m.use_nodes=True
    bsdf=m.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(*rgb,1);bsdf.inputs['Roughness'].default_value=.88
    palette[hex]=m;return m

def mesh(name,verts,faces,color):
    me=bpy.data.meshes.new(name);me.from_pydata([(x,-z,y) for x,y,z in verts],[],faces);me.update()
    ob=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(ob);me.materials.append(mat(color))
    import bmesh
    bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(me);bm.free()
    return ob

def box(name,x,y,z,w,h,d,color):
    vs=[(x+sx*w/2,y+sy*h/2,z+sz*d/2) for sz in [-1,1] for sy in [-1,1] for sx in [-1,1]]
    return mesh(name,vs,[(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)],color)

def face(name,points,z,color,depth=.03):
    n=len(points);vs=[(x,y,z-d) for d in [0,depth] for x,y in points]
    return mesh(name,vs,[tuple(range(n)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],color)

def arch(name,x,bottom,z,w,h,color):
    r=w/2;spring=bottom+h-r
    points=[(x-r,bottom),(x+r,bottom),(x+r,spring)]+[(x+math.cos(t)*r,spring+math.sin(t)*r) for t in [i*math.pi/12 for i in range(1,13)]]
    return face(name,points,z,color)

def trim_arch(x,bottom,z,w,h,stone='#c8bda5',thick=.22):
    r=w/2;spring=bottom+h-r
    box('arch left pier',x-r-thick/2,(bottom+spring)/2,z,thick,spring-bottom,.2,stone)
    box('arch right pier',x+r+thick/2,(bottom+spring)/2,z,thick,spring-bottom,.2,stone)
    for i in range(12):
        a=i*math.pi/12;b=(i+1)*math.pi/12
        ps=[(x+math.cos(t)*radius,spring+math.sin(t)*radius) for radius,t in [(r,a),(r,b),(r+thick,b),(r+thick,a)]]
        face('arch voussoir',ps,z+.1,stone,.2)

def stonework(w,h,z,base=0,x0=0,coarse=False):
    rng=random.Random(823 if coarse else 251)
    step=.42 if coarse else .51
    for row in range(int(h/step)):
        y=base+(row+.5)*step;x=-w/2+x0-(.29 if row%2 else 0)
        while x<x0+w/2:
            width=rng.uniform(.34,.8) if coarse else rng.uniform(.48,1.02)
            left=max(x,x0-w/2)+.018;right=min(x+width,x0+w/2)-.018
            if right>left:
                colors=['#bbae95','#c3b69d','#ac9c82','#baac91','#cdbfa5'] if coarse else (['#b59482','#ad8c78','#c8b39b','#a98f7c'] if y<3 else ['#bdb7a6','#cbc5b1','#b2b0a2','#c5bfac'])
                bevel=.045
                points=[(left+bevel,y-step*.45),(right-bevel,y-step*.46),(right,y-step*.25),(right-.025,y+step*.39),(left+.02,y+step*.42),(left,y)]
                face('masonry',points,z+rng.uniform(.009,.03),rng.choice(colors),.035)
            x+=width

def window(x,y,z,w=1,h=1.35,trim='#eee9dc',bars=False,shutter=False):
    box('window surround',x,y,z,w+.18,h+.18,.09,trim)
    box('window recess',x,y,z+.06,w,h,.055,'#424943')
    box('window glass',x-.05,y+.02,z+.09,w-.14,h-.12,.018,'#6a7979')
    box('window mullion',x,y,z+.11,.065,h,.045,'#666153')
    box('window sill',x,y-h/2-.06,z+.10,w+.26,.12,.25,trim)
    if shutter:
        box('roller shutter',x,y+h*.24,z+.13,w-.06,h*.49,.025,'#ada894')
        for i in range(5):box('shutter slat',x,y+i*h*.048,z+.15,w-.06,.016,.022,'#898777')
    if bars:
        for i in range(5):box('window iron',x-w*.42+i*w*.21,y,z+.19,.033,h,.035,'#343c38')

def rail(x,y,z,w,h=.65):
    for yy in [y,y+h]:box('rail horizontal',x,yy,z,w,.045,.045,'#343d38')
    count=max(1,int(w/.18))
    for i in range(count+1):box('rail upright',x-w/2+i*w/count,y+h/2,z,.029,h,.035,'#343d38')

def text(label,x,y,z,size,color='#383d36'):
    cu=bpy.data.curves.new(label,'FONT');cu.body=label;cu.size=size;cu.align_x='CENTER';cu.extrude=.001;cu.resolution_u=1
    ob=bpy.data.objects.new(label,cu);bpy.context.collection.objects.link(ob);ob.location=(x,-z,y);ob.rotation_euler=(math.pi/2,0,0);cu.materials.append(mat(color))
    bpy.context.view_layer.objects.active=ob;ob.select_set(True);bpy.ops.object.convert(target='MESH');ob.select_set(False)

def roof(w,d,h,rise=1.0,z0=0):
    vs=[(-w/2,h,z0),(w/2,h,z0),(-w/2,h,z0-d),(w/2,h,z0-d),(0,h+rise,z0),(0,h+rise,z0-d)]
    mesh('terracotta pitched roof',vs,[(0,2,5,4),(4,5,3,1),(0,4,1),(2,3,5)],'#ad795b')
    # A few long tile channels emphasize roof direction without individual tiles.
    for i in range(1,13):
        xx=-w/2+w*i/13;yy=h+rise*(1-abs(xx)/(w/2))+.02
        box('tile channel',xx,yy,z0-d/2,.025,.025,d,'#94694f')

def church():
    w=11.7;d=21.8
    box('church nave',0,4.4,-d/2,w,8.8,d,'#b6b0a0')
    roof(w+.22,d,8.8,2.0)
    front=[(-w/2,0),(w/2,0),(w/2,8.7),(4,8.7),(3.1,9.1),(2.1,9.5),(.8,10.5),(0,10.8),(-.8,10.5),(-2.2,9.5),(-3.5,9.1),(-w/2,9.0)]
    face('shaped stone facade',front,.04,'#bdb8a7',.35)
    stonework(w,8.6,.09)
    # Decorative silhouette above the masonry plane.
    for a,b in zip(front[3:-1],front[4:]):
        face('pediment coping',[(a[0],a[1]),(b[0],b[1]),(b[0],b[1]+.14),(a[0],a[1]+.14)],.12,'#b98c6f',.28)
    arch('arched timber door',0,.65,.15,2.8,4.1,'#797a6d')
    trim_arch(0,.65,.25,2.8,4.1,thick=.28)
    for x in [-1.06,-.7,-.35,0,.35,.7,1.06]:box('door boards',x,2.15,.29,.026,2.9,.02,'#5e635b')
    for y in [1.1,2.2,3.3]:box('door metal strap',0,y,.3,2.7,.06,.025,'#515951')
    box('door entablature',0,5.08,.35,3.65,.23,.56,'#c9bea7')
    for x in [-1.9,1.9]:box('carved portal pilaster',x,2.9,.25,.32,4.6,.34,'#b9aa91')
    arch('statue niche',0,5.27,.17,.82,1.58,'#8f9285');trim_arch(0,5.27,.22,.82,1.58,thick=.11)
    box('statue base',0,5.28,.39,.58,.12,.38,'#d3c5a9')
    # Deliberately faceted figure inside the niche.
    box('saint robe',0,5.79,.37,.31,.86,.22,'#c4bca6');box('saint head',0,6.35,.37,.21,.25,.23,'#c4bca6')
    window(0,7.7,.2,1.2,1.5,trim='#b9ad94')
    for n in range(4):box('entrance step',0,(n+1)*.15/2,.2+(4-n)*.24,5.0,(n+1)*.15,.55,'#c1bcae')
    rail(-2.42,.5,1.16,.05,.9);rail(2.42,.5,1.16,.05,.9)
    # Tower is on the south side (left when looking at the east facade).
    tx=-4.12;tz=-1.55
    box('bell tower shaft',tx,7.1,tz,3.35,14.2,3.35,'#b8a38c')
    stonework(3.3,10.2,.16,x0=tx)
    box('clock storey plaster',tx,12.7,tz,3.49,2.35,3.49,'#dfcba7')
    for y in [11.5,14.0,17.85]:box('tower cornice',tx,y,tz,3.77,.26,3.77,'#c8a885')
    for sx in [-1,1]:
        for sz in [-1,1]:box('belfry corner pier',tx+sx*1.31,15.8,tz+sz*1.31,.55,3.55,.55,'#bb9576')
    for side in range(4):
        # Arch rings on all four open faces. Rotate front ring around tower.
        before=set(bpy.data.objects);trim_arch(tx,14.2,.28,1.8,3.2,'#c6a27f',.24)
        if side:
            for ob in set(bpy.data.objects)-before:
                for v in ob.data.vertices:
                    gx=v.co.x;gz=-v.co.y;dx=gx-tx;dz=gz-tz;t=side*math.pi/2
                    v.co.x=tx+dx*math.cos(t)+dz*math.sin(t);v.co.y=-(tz-dx*math.sin(t)+dz*math.cos(t))
    box('bell beam',tx,16.7,tz,2.0,.24,.25,'#555446')
    bpy.ops.mesh.primitive_cone_add(vertices=10,radius1=.65,radius2=.29,depth=.86,location=(tx,-tz,15.82))
    bpy.context.object.name='bronze bell';bpy.context.object.data.materials.append(mat('#535448'))
    before=set(bpy.context.scene.objects)
    roof(3.8,3.8,18.0,1.1,tz+1.9)
    # Move the small roof from the center line onto the tower.
    for ob in set(bpy.context.scene.objects)-before:ob.location.x+=tx
    points=[(tx+math.cos(i*math.pi/16)*.59,12.68+math.sin(i*math.pi/16)*.59) for i in range(32)]
    face('clock face',points,.24,'#dddccc')
    for i in range(12):
        t=i*math.pi/6;box('clock hour',tx+math.sin(t)*.46,12.68+math.cos(t)*.46,.28,.05,.07,.022,'#424d52')
    box('clock hand minute',tx,12.86,.30,.05,.37,.028,'#424d52');box('clock hand hour',tx+.13,12.68,.31,.28,.055,.028,'#424d52')

def prison():
    w=4.65;d=4.9
    box('preso masonry',0,2.75,-d/2,w,5.5,d,'#b3a48b');stonework(w,5.5,.04,coarse=True);roof(w+.14,d,5.5,.6)
    box('old timber door',-.97,1.23,.11,1.07,2.46,.08,'#69533d')
    for i in range(5):box('door planks',-1.38+i*.205,1.23,.16,.018,2.44,.02,'#4b4436')
    for x in [-1.66,-.30]:box('sandstone jamb',x,1.3,.16,.27,2.6,.21,'#a68e75')
    box('door lintel',-.98,2.64,.16,1.61,.3,.21,'#ae9079')
    window(.93,1.99,.10,.75,.59,trim='#aa9277',bars=True)
    window(.16,4.03,.10,1.38,1.5,trim='#ad967c',bars=True)
    box('Preso plaque',-.03,1.19,.18,.68,.39,.055,'#d8ccb4');text('PRESÓ',-.03,1.15,.22,.13)
    for y in [2.9,3.0]:box('facade wiring',0,y,.18,w,.023,.028,'#464b40')

def townhall():
    w=7.8;d=6.8
    box('casa de la vila',0,4.3,-d/2,w,8.6,d,'#e6e4d9')
    for y in [1.58,4.13,6.68]:
        window(-2.75,y,.03,1.26,2.12,trim='#f2eee2',bars=True)
        if y>2:window(.77,y+.15,.03,4.03,1.04,trim='#e6e4d9')
    box('entrance recess',.9,1.46,.04,4.1,2.92,.03,'#a5a395')
    box('entrance glazing',-.08,1.45,.08,1.9,2.80,.025,'#606f6a')
    box('entry signage wall',2.04,1.46,.09,1.95,2.92,.05,'#e9e5d9')
    text('CASA',2.0,1.88,.14,.24);text('DE LA',2.0,1.53,.14,.16);text('VILA',2.0,1.18,.14,.24)
    box('roof overhang',0,8.65,-3.0,8.25,.19,7.6,'#a8a18f')
    box('roof parapet',0,8.80,-6.5,7.9,.3,.2,'#ded9cd')

def publichall():
    w=5.1;d=4.4
    box('public hall',0,2.05,-d/2,w,4.1,d,'#e4cba5');roof(w+.15,d,4.1,.75)
    box('stone plinth',0,.4,.04,w,.8,.13,'#b9b7aa')
    for x in [-1.58,0,1.58]:
        window(x,2.95,.1,.90,1.18,trim='#aa7059')
        if x:window(x,1.18,.1,.87,.68,trim='#aa7059')
    box('public doorway',0,1.15,.14,.91,2.3,.08,'#745748');rail(0,2.53,.49,1.28,.57)
    box('balcony slab',0,2.46,.27,1.5,.10,.55,'#c6b596')
    text('AJUNTAMENT',0,4.03,.13,.14)

def passage():
    w=5.6;d=5.7
    for x in [-2.53,2.53]:box('passage support',x,1.45,-d/2,.54,2.9,d,'#d9c780')
    box('rooms over passage',0,4.48,-d/2,w,3.16,d,'#e1d295');roof(w+.12,d,6.06,.75)
    for x in [-1.43,1.43]:window(x,4.63,.08,1.33,1.58,trim='#f1e7d0',shutter=True);rail(x,3.87,.29,1.42,.72)
    for y in [2.85,2.96]:box('utility cable',0,y,.13,w,.026,.025,'#4f5044')
    box('passage sign',2.17,2.1,.16,.51,.56,.07,'#e7deca');text('BARRERETES',2.17,2.04,.21,.071)
    # Small stone trough and potted leaves visible beside the opening in view 04.
    box('stone trough base',.72,.08,.46,.78,.16,.43,'#aaa797')
    for x in [.36,1.08]:box('trough short side',x,.20,.46,.07,.22,.43,'#bbb6a3')
    for z in [.28,.64]:box('trough long side',.72,.20,z,.78,.22,.07,'#bbb6a3')
    box('terracotta planter',-1.81,.23,-.10,.76,.46,.48,'#a5795e')
    for i in range(7):
        t=i*math.pi*2/7;x=-1.81;z=-.10
        mesh('pointed leaves',[(x-.045,.43,z),(x+.045,.43,z),(x+math.cos(t)*.55,1.22,z+math.sin(t)*.43)],[(0,1,2)],'#57734c')

for name,build in [('church',church),('prison',prison),('townhall',townhall),('publichall',publichall),('passage',passage)]:
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);palette={}
    build()
    # Collapse by material before export for a small, predictable draw-call budget.
    groups={}
    for ob in bpy.context.scene.objects:
        if ob.type=='MESH':groups.setdefault(ob.data.materials[0].name,[]).append(ob)
    for material,objects in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for ob in objects:ob.select_set(True)
        bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();objects[0].name=name+' '+material
    bpy.ops.object.select_all(action='SELECT')
    triangles=sum(len(p.vertices)-2 for ob in bpy.context.scene.objects if ob.type=='MESH' for p in ob.data.polygons)
    stats[name]={'triangles':triangles,'materials':len(groups),'file':name+'.glb'}
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/(name+'.blend')))
    bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_texcoords=False,export_normals=True,export_animations=False)
(OUT/'landmarks.json').write_text(json.dumps(stats,indent=2)+'\n')
print('LANDMARK_STATS',json.dumps(stats))
