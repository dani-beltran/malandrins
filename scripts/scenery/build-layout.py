"""Rebuild the reviewed scenery dataset. Requires Pillow + Shapely (offline at runtime).

Run from the repository root with Node 24 available for the source map import.
Source coordinates are retained in blocks.json; no Google pixels are bundled.
"""
import json, math, random, hashlib, subprocess
from pathlib import Path
from shapely.geometry import Polygon, LineString, Point, box
from shapely.ops import unary_union
from shapely import affinity, set_precision
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
raw = json.loads((ROOT/'scripts/scenery/blocks.json').read_text())
source = json.loads(subprocess.check_output(['node','--input-type=module','-e',
    "import {LA_POBLA_MAP} from './src/data/laPoblaMap.ts'; console.log(JSON.stringify(LA_POBLA_MAP));"],cwd=ROOT,text=True))
profiles = json.loads((ROOT/'src/data/scenery/road-profiles.json').read_text())
sat = json.loads((ROOT/'references/satellite-data/manifest.json').read_text())['images'][-1]
bbox = sat['bbox_epsg3857']
scale = .7
lon_scale = 111320 * math.cos(math.radians(40.1017)) * scale
lat_scale = 111320 * scale

def project(ll):
    return ((ll[0]+.0012)*lon_scale, -(ll[1]-40.1017)*lat_scale)

def pixel(p):
    mx=bbox[0]+(p[0]+.5)/3072*(bbox[2]-bbox[0])
    my=bbox[3]-(p[1]+.5)/3072*(bbox[3]-bbox[1])
    return project((math.degrees(mx/6378137), math.degrees(2*math.atan(math.exp(my/6378137))-math.pi/2)))

def to_pixel(p):
    lon=p[0]/lon_scale-.0012;lat=40.1017-p[1]/lat_scale
    mx=math.radians(lon)*6378137;my=math.log(math.tan(math.pi/4+math.radians(lat)/2))*6378137
    return ((mx-bbox[0])/(bbox[2]-bbox[0])*3072, (bbox[3]-my)/(bbox[3]-bbox[1])*3072)

def coords(p):
    return [[round(x,6),round(z,6)] for x,z in list(p.exterior.coords)[:-1]]

def polygons(g):
    if g.is_empty:return []
    if g.geom_type=='Polygon':return [g]
    return [p for sub in getattr(g,'geoms',[]) for p in polygons(sub)]

def width(t):
    if t.startswith('motorway') or t=='primary':return 12
    if t in ['tertiary','secondary']:return 9
    if t in ['footway','steps','path','cycleway']:return 2.7
    return 4.4 if t=='track' else 6.6

roads=[]
for i,r in enumerate(source['roads']):
    profile=profiles.get(r['n'],{})
    w=profile.get('width',width(r['t']))
    walk=profile.get('sidewalk', .3 if r['t'] in ['path','steps','footway','track','cycleway'] else .8)
    for line in [r['c']] if isinstance(r['c'][0][0],(int,float)) else r['c']:
        roads.append({'index':i,'name':r['n'],'line':LineString([project(p) for p in line]),'width':w,'walk':walk})
corridors=unary_union([r['line'].buffer(r['width']/2+r['walk']+.08, join_style=2) for r in roads])
near_road=lambda p:min(roads,key=lambda r:r['line'].distance(p))

# Landmarks use source footprints where present. Church is traced from PNOA and
# aligned with the east-facing facade in Street View 22/23. Model origins are
# centered on the street-facing wall, local +Z out of the entrance.
landmarks=[]
def landmark(id, origin, heading, w, d, refs, source_index=None):
    x,z=project(origin);angle=math.radians(180-heading)
    def transform(u,v):return [x+math.cos(angle)*u+math.sin(angle)*v,z-math.sin(angle)*u+math.cos(angle)*v]
    poly=Polygon([transform(-w/2,0),transform(w/2,0),transform(w/2,-d),transform(-w/2,-d)])
    landmarks.append({'id':id,'position':[x,z],'rotation':angle,'width':w,'depth':d,'points':coords(poly),'references':refs,'sourceIndex':source_index})
    return poly
special=[
    landmark('church',[-.00116,40.101310],80,11.7,21.8,['22','23']),
    landmark('prison',[-.001201,40.101497],72,4.65,4.9,['24'],15),
    landmark('townhall',[-.001054,40.101352],260,7.8,6.8,['19'],2),
    landmark('publichall',[-.001565,40.101367],250,5.1,4.4,['18'],16),
]
# The covered passage is traversable. Only its supporting side walls collide.
landmark('passage',[-.00109,40.101515],280,5.6,5.7,['04'])
special.append(Polygon(landmarks[-1]['points']))
square_polys=[Polygon([pixel(p) for p in sq['p']]) for sq in raw['squares']]
aprons=[]
for b in landmarks:
    x,z=b['position'];angle=b['rotation'];w=b['width']
    def transform(u,v):return [x+math.cos(angle)*u+math.sin(angle)*v,z-math.sin(angle)*u+math.cos(angle)*v]
    front=Polygon([transform(-w/2,0),transform(w/2,0),transform(w/2,2.1),transform(-w/2,2.1)])
    aprons.append(front)
    if b['id']=='passage':
        rear=Polygon([transform(-w/2,-b['depth']),transform(w/2,-b['depth']),transform(w/2,-b['depth']-1.7),transform(-w/2,-b['depth']-1.7)])
        aprons.append(rear)
        end=Point(transform(0,-b['depth']-1))
        lane=next(r['line'] for r in roads if r['index']==28)
        connection=lane.interpolate(lane.project(end))
        aprons.append(LineString([end,connection]).buffer(1.15))
excluded=unary_union(special+square_polys+aprons)
buildings=[]
occupied=[]
rng=random.Random(20260908)

def add_building(poly, id, style, axis, refs=None):
    # Remove sub-millimetre intersection spikes before serializing coordinates.
    # Rounding an unnormalized ring can otherwise turn a tiny spur into a
    # duplicate edge and make an invalid triangulation in the browser.
    poly=set_precision(poly, .00001)
    if poly.geom_type!='Polygon':
        for i,piece in enumerate(polygons(poly)):add_building(piece,f'{id}-piece-{i}',style,axis,refs)
        return
    if poly.area<4 or not poly.is_valid:return
    if poly.interiors:
        # Split rings into simple pieces rather than filling their courtyards.
        minx,miny,maxx,maxy=poly.bounds;cx=poly.interiors[0].centroid.x
        for j,clip in enumerate([box(minx-1,miny-1,cx,maxy+1),box(cx,miny-1,maxx+1,maxy+1)]):
            for k,piece in enumerate(polygons(poly.intersection(clip))):add_building(piece,f'{id}-court-{j}-{k}',style,axis,refs)
        return
    p=poly.representative_point();road=near_road(p)
    if style=='old':
        if road['name']=='Carrer de Baix les Cases':style='worn'
        if road['name']=='Carrer Cabanes':style='white'
    floors=1 if style=='industrial' else (3 if style=='terrace' else rng.choices([1,2,3],[1,6,3])[0])
    if style=='terrace':height=6.55
    else:height=3.0 if style=='industrial' else floors*2.15+.15
    palette={'old':['#e1d5c1','#e8e0d1','#d4c8b2','#e4cfb6','#c4bcad','#eadfd1'],
             'white':['#eeece4','#e5e3da','#f2eee5','#deded7'],
             'worn':['#c4bdab','#d3cdbb','#d9d3c5','#bab6a8'],
             'rose':['#d3a69b','#e1b9a8'], 'ochre':['#e3c680','#dcca9f','#e7d4a6'],
             'terrace':['#ddca9b'], 'industrial':['#c9c4b8']}[style]
    buildings.append({'id':id,'points':coords(poly),'height':height,'floors':floors,'style':style,'color':rng.choice(palette),'axis':axis,'road':road['name'],'source':'PNOA block; inferred lot and height','references':refs or []})
    occupied.append(poly)

for block in raw['blocks']:
    poly=Polygon([pixel(p) for p in block['p']]).buffer(0).difference(corridors).difference(excluded).difference(unary_union(occupied))
    axis=block['axis'];theta=math.degrees(math.atan2(axis[1],axis[0]))
    for part_i,part in enumerate(polygons(poly)):
        if part.area<6:continue
        local=affinity.rotate(part,-theta,origin=(0,0))
        minx,miny,maxx,maxy=local.bounds
        # Parallel party walls give each street a continuous row. Deep blocks
        # have two back-to-back rows, leaving the traced open spaces intact.
        rows=max(1,round((maxy-miny)/12))
        columns=max(1,round((maxx-minx)/(18 if block['style']=='industrial' else 5.5)))
        for row in range(rows):
            for col in range(columns):
                piece=local.intersection(box(minx+(maxx-minx)*col/columns,miny+(maxy-miny)*row/rows,minx+(maxx-minx)*(col+1)/columns,miny+(maxy-miny)*(row+1)/rows))
                for j,p in enumerate(polygons(piece)):
                    add_building(affinity.rotate(p,theta,origin=(0,0)),f"{block['id']}-{part_i}-{row}-{col}-{j}",block['style'],axis)

for i,(x,y,w,d,angle) in enumerate(raw['detached']):
    p=Polygon([pixel(q) for q in [(x-w/2,y-d/2),(x+w/2,y-d/2),(x+w/2,y+d/2),(x-w/2,y+d/2)]])
    p=affinity.rotate(p,-angle).difference(corridors).difference(excluded).difference(unary_union(occupied))
    for j,piece in enumerate(polygons(p)):
        add_building(piece,f'garden-home-{i}-{j}','white',[math.cos(math.radians(angle)),math.sin(math.radians(angle))],['15'])

# Retain mapped outlying structures; replace central source blocks only where
# a reconstructed envelope or a named landmark covers them.
coverage=unary_union(occupied+special).buffer(.3)
for i,b in enumerate(source['buildings']):
    if i in [2,15,16]:continue
    poly=Polygon([project(p) for p in b['c']]).buffer(0)
    remaining=poly.difference(coverage).difference(corridors)
    for j,p in enumerate(polygons(remaining)):
        add_building(p,f'mapped-{i}-{j}','industrial' if b['t']=='industrial' else 'old',[1,0])

# Detail only exposed edges. Party walls stay undecorated and completely joined.
union=unary_union(occupied+special)
for b,p in zip(buildings,occupied):
    edges=[]
    ps=list(p.exterior.coords)
    for i in range(len(ps)-1):
        edge=LineString([ps[i],ps[i+1]])
        mid=edge.interpolate(.5,normalized=True)
        road=near_road(mid)
        if edge.length>1.4 and union.boundary.distance(mid)<.04:
            edges.append(i)
    b['facadeEdges']=edges

for b in buildings:
    x,z=Polygon(b['points']).centroid.coords[0]
    if b['id'].startswith('enmig-west'):
        b['floors']=3;b['height']=6.9
    # Specific visible colors/features around the recorded reference cameras.
    if (b['road']=="carrer d'Enmig" or b['id'].startswith('enmig-west-cases')) and -9<x<3 and 7<z<14:
        b.update(color='#dfb6ad',style='old',references=['05'])
    if b['road']=='Carrer de les Eres':b['references']=['16','21']
    if b['road']=='Carrer Tossal de la Vila':b['references']=['11']
    if b['road']=='Carrer de Baix les Cases':b['references']=['10','20']
    if b['road']=="carrer d'Enmig" and not b['references']:b['references']=['03']

cameras=[]
for im in json.loads((ROOT/'references/google-street-view/manifest.json').read_text())['images']:
    c=im['camera']
    cameras.append({'id':im['id'],'title':im['title'],'position':[c['game_x'],c['game_z']],'heading':c['heading_degrees_clockwise_from_north'],'pitch':c['pitch_degrees_up_from_horizon'],'file':im['file']})

data={'version':1,'sourceImage':raw['reference'],'sourceSha256':hashlib.sha256((ROOT/raw['reference']).read_bytes()).hexdigest(),
      'coordinateSystem':'MapAdapter local XZ; original projection and 0.7 scale',
      'accuracy':'Reviewed aerial block envelopes. Parcel divisions, heights, hidden facades and garden details are approximations.',
      'buildings':buildings,'landmarks':landmarks,'orchards':[[list(pixel(p)) for p in ps] for ps in raw['orchards']],
      'squares':[{'id':sq['id'],'points':coords(p),'material':sq['material']} for sq,p in zip(raw['squares'],square_polys)],
      'aprons':[coords(p) for g in aprons for p in polygons(g)],'cameras':cameras}
(ROOT/'src/data/scenery/town-layout.json').write_text(json.dumps(data,separators=(',',':'))+'\n')
persisted=[Polygon(b['points']) for b in buildings]
if any(not p.is_valid for p in persisted):raise ValueError('Invalid serialized scenery polygon')
from shapely.strtree import STRtree
tree=STRtree(persisted);overlaps=[]
for i,p in enumerate(persisted):
    for j in tree.query(p):
        if j>i and p.intersection(persisted[j]).area>.02:overlaps.append([buildings[i]['id'],buildings[j]['id']])
if overlaps:raise ValueError(f'Overlapping scenery polygons: {overlaps}')
(ROOT/'artifacts/scenery/layout-check.json').write_text(json.dumps({'buildingSections':len(buildings),'invalidPolygons':0,'overlapsAbove002SquareUnits':overlaps,'landmarks':len(landmarks),'referenceViews':len(cameras)},indent=2)+'\n')

# A review overlay makes every generated footprint inspectable against its source.
im=Image.open(ROOT/raw['reference']).convert('RGBA');overlay=Image.new('RGBA',im.size);draw=ImageDraw.Draw(overlay)
for b in buildings:
    ps=[to_pixel(p) for p in b['points']];draw.polygon(ps,fill=(234,179,79,80),outline=(255,239,188,240),width=2)
for b in landmarks:
    ps=[to_pixel(p) for p in b['points']];draw.polygon(ps,fill=(81,198,219,110),outline='cyan',width=3);draw.text(ps[0],b['id'],fill='white',stroke_width=2,stroke_fill='black')
Image.alpha_composite(im,overlay).convert('RGB').resize((1536,1536)).save(ROOT/'artifacts/scenery/layout-aerial-review.jpg',quality=94)

# Licensed aerial land cover supplies countryside colors, softened to suit the
# low-poly models. No Street View screenshots or Google assets enter public/.
ground=Image.open(ROOT/'references/satellite-data/05-aerial-game-map-bounds-pnoa.jpg').resize((1024,1024)).filter(ImageFilter.GaussianBlur(1.2))
ground.save(ROOT/'public/assets/scenery/landcover.jpg',quality=83)
print(json.dumps({'buildings':len(buildings),'landmarks':len(landmarks),'facades':sum(len(b['facadeEdges']) for b in buildings),'lotsWithNoFacade':sum(not b['facadeEdges'] for b in buildings)},indent=2))
