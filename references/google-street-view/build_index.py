"""Rebuild the offline Street View catalog from saved UI observations.

No network access. Requires Pillow for image integrity and dimension checks.
Road distances use the same local projection as MapAdapter, without gameplay scaling.
"""
import csv
import hashlib
import html
import json
import math
import re
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parents[1]
MAP_PATH = PROJECT / "src/data/laPoblaMap.ts"
ADAPTER_PATH = PROJECT / "src/world/MapAdapter.ts"
ORIGIN = [-0.0012, 40.1017]
SCALE = 0.7
KX = 111320 * math.cos(math.radians(ORIGIN[1]))
KZ = 111320

# Camera street and visually reviewed subject notes. Indices are zero-based.
ANNOTATIONS = {
    "01": (38, "Carrer Cabanes · NE", "Plaster facades, stone-clad ground floor, balconies, tiled pavement and distant hills.", "street-corridor,facades,balconies,pavement", []),
    "02": (43, "Plaça del Raval · SW", "Broad junction, ochre facades and balconies, with hills behind the west side. Google labels this CV-1601; the project labels the camera road Plaça del Raval.", "junction,facades,hills", []),
    "03": (67, "Carrer d’Enmig · SSE", "Long paved street corridor with narrow sidewalks, bollards, shutters and balconies.", "street-corridor,paving,bollards,facades", []),
    "04": (67, "Barreretes covered passage · E", "Covered entrance with a visible Carreró de Barreretes sign, yellow plaster, balconies, paving and a stone trough. Camera remains on Carrer d’Enmig.", "covered-passage,facades,paving,street-sign", [("roads", 28, "visible passage entrance", "high")]),
    "05": (67, "Enmig west-side facades · W", "Pink residential frontage and part of the Antiga Presó stone wall on the left. The whole image must not be assigned to the prison footprint.", "facade-detail,masonry,shutters", [("buildings", 15, "partial stone wall at left edge", "medium")]),
    "06": (27, "School entrance by Dalt la Vila · WSW", "School entrance sign, stairs with colored railings, retaining wall and a paved crossing. Camera on Dalt la Vila, beside the mapped square boundary.", "school,stairs,retaining-wall,paving", [("pois", 22, "school entrance and sign", "high"), ("roads", 33, "adjacent square boundary", "high")]),
    "07": (44, "Plaça del Portal · WSW", "Trees, red bench, stone retaining walls and a playground at the left edge; part of the Casa de la Cultura frontage is behind the trees.", "square,trees,bench,playground,masonry", [("pois", 4, "playground partly visible at left", "high"), ("pois", 15, "building behind trees; partly obscured", "medium")]),
    "08": (44, "Plaça del Portal · NNW", "Street corridor toward Baix la Vila, stone wall with a drinking fountain, speed bump and hillside backdrop.", "street-corridor,stone-wall,speed-bump,hills", []),
    "09": (87, "Carrer de Baix la Vila · NNW", "Paved residential street, narrow sidewalks, balconies, a large red doorway and exposed masonry.", "street-corridor,facades,doorway,masonry", []),
    "10": (37, "Baix les Cases corner detail · S", "Close plaster wall and green door numbered 21, with the narrow lane visible to the left. Use image 20 for a clearer view along the lane.", "facade-detail,doorway,narrow-lane,paving", []),
    "11": (65, "Tossal de la Vila · SSE", "Matching rows of brick-and-plaster housing, balconies and recessed ground floors. The construction date is not established by this image.", "housing-rows,balconies,street-corridor", []),
    "12": (11, "Carrer de Vilafamés · NW", "Broader approach road, low buildings, planted sidewalks, railing and hillside backdrop.", "approach-road,pavement,trees,hills", []),
    "13": (31, "Calvari–Constitució junction · NNW", "View along Calvari with a landscaped rise, cypresses, steps, retaining wall and curbside bins. Camera is nearest the Constitució road feature.", "junction,slope,cypresses,stairs,retaining-wall", [("roads", 32, "road corridor extending northwest", "high")]),
    "14": (89, "Plaça de l’Hospital · E", "Paved street and small square with balconies, street trees, parked cars and painted play surfacing at the right edge.", "square,paving,facades,trees", []),
    "15": (23, "Carrer de Benicàssim · WNW", "Detached homes, gardens, fences, terracotta roofs and a view toward the hills. Google displays the spelling Beniassim.", "detached-housing,gardens,fences,hills", []),
    "16": (92, "Carrer de les Eres west facade · WSW", "Close white facade, green-framed window, exterior wiring, sidewalk and drain. The requested Riu junction resolves to a camera just south on Eres; this image does not show the Riu street corridor.", "facade-detail,pavement,drain", []),
    "17": (50, "Molí de Foc south approach · NNE", "Broad approach road, palms, housing, curbside parking and puddles. Google labels the road CV-1600.", "approach-road,palms,facades,parking", []),
    "18": (27, "Plaça de l’Ajuntament public building · NE", "Public building with ochre plaster, red window trim, crest, balcony and accessible ramp; matches the unnamed public footprint in the dataset. Do not confuse it with the separately mapped current town hall.", "public-building,facade-detail,ramp,paving", [("buildings", 16, "public facade directly northeast", "high"), ("roads", 33, "adjacent square boundary", "high")]),
    "19": (67, "Ajuntament / Casa de la Vila · SE", "Town-hall frontage with visible CASA DE LA VILA lettering, tall windows, planters and paved sidewalk.", "town-hall,facade-detail,signage,paving", [("buildings", 2, "town hall with visible lettering", "high")]),
    "20": (37, "Carrer de Baix les Cases · SSE", "Narrow paved lane with worn plaster, drainage channels, small windows and a corner wall on the right.", "narrow-lane,paving,facades,drainage", []),
    "21": (92, "Carrer de les Eres · NNE", "Northward corridor with apartment facades on the left and cultivated trees on the right, plus streetlights and a utility pole.", "street-corridor,orchard,facades,utility-pole", []),
    "22": (67, "Church entrance · W", "Stone church doorway and steps between cypresses. A municipal pickup partly obscures the lower frontage. The church footprint is absent from the dataset; use the camera point and bearing, not another building’s ID.", "church,stonework,doorway,stairs,occlusion", []),
    "23": (67, "Church facade and tower · W, +30°", "Upward view of the same church: masonry facade, doorway, statue niche, clock and bell tower. The Google information panel obscures part of the tower; a vehicle remains at the bottom.", "church,stonework,tower,clock,occlusion", []),
    "24": (67, "Antiga Presó · SW", "Stone facade with wooden door, barred windows and a visible Presó plaque; matches the Antiga Presó footprint.", "historic-building,stonework,doorway,barred-window", [("buildings", 15, "facade and plaque", "high")]),
}


def dump(path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def xy(coord):
    return [(coord[0] - ORIGIN[0]) * KX, -(coord[1] - ORIGIN[1]) * KZ]


def ll(point):
    return [point[0] / KX + ORIGIN[0], ORIGIN[1] - point[1] / KZ]


def closest(p, a, b):
    dx, dz = b[0] - a[0], b[1] - a[1]
    den = dx * dx + dz * dz
    t = max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / den)) if den else 0
    q = [a[0] + t * dx, a[1] + t * dz]
    return math.dist(p, q), q, t


def lines(feature):
    c = feature["c"]
    return [c] if isinstance(c[0][0], (int, float)) else c


def main():
    data = json.loads(MAP_PATH.read_text().split("export const LA_POBLA_MAP: MapDataset = ", 1)[1])
    refs = {}

    def feature_ref(layer, index):
        f = data[layer][index]
        digest = sha(json.dumps(f, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode())
        key = f"{layer}:{digest[:16]}"
        refs[key] = {"id": key, "layer": layer, "source_index": index, "name": f["n"], "type": f["t"], "feature_sha256": digest, "source_feature": f}
        return {k: refs[key][k] for k in ("id", "layer", "source_index", "name", "type", "feature_sha256")}

    def road_match(index, point):
        best = None
        for li, line in enumerate(lines(data["roads"][index])):
            for si, (a, b) in enumerate(zip(line, line[1:])):
                distance, q, fraction = closest(point, xy(a), xy(b))
                candidate = (distance, li, si, q, fraction, [a, b])
                if best is None or distance < best[0]:
                    best = candidate
        return {**feature_ref("roads", index), "distance_m": round(best[0], 3), "line_index": best[1], "segment_index": best[2], "closest_point_lon_lat": ll(best[3]), "fraction_along_segment": best[4], "segment_endpoints_lon_lat": best[5]}

    # Latest capture per ID; discard the superseded first capture and stale request cache.
    raw = {r["id"]: r for r in json.loads((ROOT / "sources/captures.json").read_text())}
    captures = []
    images = []
    geo = []
    for id in sorted(raw):
        r = raw[id]
        r.pop("requested", None)
        index, title, notes, tags, subjects = ANNOTATIONS[id]
        s = (ROOT / f"sources/{id}-page.txt").read_text()
        match = re.search(r"@(-?[\d.]+),(-?[\d.]+),([\d.]+)a,([\d.]+)y,([\d.]+)h,([\d.]+)t", r["url"])
        if not match:
            raise ValueError(f"Missing resolved panorama URL: {id}")
        lat, lon, _, fov, heading, tilt = map(float, match.groups())
        pano = re.search(r"!1s([^!]+)!2e", r["url"])[1]
        point = xy([lon, lat])
        report_heading = float(re.search(r"cbp=1%2C([\d.]+)", r["report_url"])[1])
        assert abs(report_heading - heading) < 0.1
        assert data["bounds"][0] <= lon <= data["bounds"][2] and data["bounds"][1] <= lat <= data["bounds"][3]
        assert r["capture_text"] in s and r["location_label"] in s and pano in s
        path = ROOT / r["file"]
        with Image.open(path) as image:
            width, height = image.size
            assert image.format == "JPEG"
            image.verify()
        with Image.open(path) as image:
            image.load()
            extrema = image.convert("L").getextrema()
            assert extrema[1] - extrema[0] > 100
        primary = road_match(index, point)
        nearby = sorted((road_match(i, point) for i in range(len(data["roads"]))), key=lambda c: c["distance_m"])[:3]
        assert primary["distance_m"] < 10
        visible = [{**feature_ref(layer, idx), "relationship": relation, "confidence": confidence} for layer, idx, relation, confidence in subjects]
        month = re.search(r"Image capture: (.*?) ©", r["capture_text"])[1]
        period = {"May 2026": "2026-05", "Nov 2024": "2024-11"}[month]
        forward = {"x": math.sin(math.radians(heading)) * math.cos(math.radians(tilt - 90)), "y": math.sin(math.radians(tilt - 90)), "z": -math.cos(math.radians(heading)) * math.cos(math.radians(tilt - 90))}
        entry = {"id": id, "file": r["file"], "area": r["group"], "title": title, "visual_notes": notes, "tags": tags.split(","), "provider": "Google Street View", "capture_method": "Unmodified browser screenshot via CUA", "browser": r["browser"], "acquired_at_utc": r["captured_at"], "imagery_month": period, "attribution": r["capture_text"], "google_location_label": r["location_label"], "source_url": r["url"], "panorama_id": pano, "reopen_url": f"https://www.google.com/maps/@?api=1&map_action=pano&pano={pano}&viewpoint={lat},{lon}&heading={heading:g}&pitch={tilt-90:g}&fov={fov:g}", "camera": {"longitude": lon, "latitude": lat, "crs": "EPSG:4326", "heading_degrees_clockwise_from_north": heading, "pitch_degrees_up_from_horizon": tilt - 90, "maps_url_y_parameter": fov, "game_x": round(point[0] * SCALE, 5), "game_z": round(point[1] * SCALE, 5), "game_y": None, "forward_unit_vector_xyz": forward, "position_evidence": "Resolved panorama URL observed in browser; not the requested search position", "position_accuracy_m": None}, "camera_road_match": primary, "nearest_road_candidates": nearby, "visible_mapped_subjects": visible, "unmapped_subjects": ["Church facade west of Carrer d’Enmig; no church footprint in the source dataset"] if id in ("22", "23") else [], "image": {"width": width, "height": height, "mime_type": "image/jpeg", "bytes": path.stat().st_size, "sha256": sha(path.read_bytes())}, "source_observation": f"sources/{id}-page.txt"}
        images.append(entry)
        r["notes"] = notes
        captures.append(r)
        geo.append({"type": "Feature", "id": id, "geometry": {"type": "Point", "coordinates": [lon, lat]}, "properties": {"image_id": id, "file": r["file"], "title": title, "heading_deg": heading, "pitch_deg": tilt - 90, "imagery_month": period, "panorama_id": pano, "road_feature_id": primary["id"], "road_source_index": index, "road_name": primary["name"], "distance_to_road_m": primary["distance_m"], "game_x": entry["camera"]["game_x"], "game_z": entry["camera"]["game_z"], "source_url": entry["source_url"]}})
    referenced_ids = {im["camera_road_match"]["id"] for im in images}
    referenced_ids.update(f["id"] for im in images for f in im["visible_mapped_subjects"])
    referenced_ids.update(f["id"] for im in images for f in im["nearest_road_candidates"])
    refs = {key: val for key, val in refs.items() if key in referenced_ids}
    manifest = {"schema_version": 1, "place": "La Pobla Tornesa, Castelló, Spain", "image_count": len(images), "unique_panorama_count": len({im["panorama_id"] for im in images}), "acquired_date": "2026-09-08", "purpose": "Local visual reference and matching to the existing project map", "project_map": {"path": "src/data/laPoblaMap.ts", "sha256": sha(MAP_PATH.read_bytes()), "bounds_west_south_east_north": data["bounds"], "attribution": "© OpenStreetMap contributors, ODbL 1.0", "source_osm_ids_available": False}, "projection": {"path": "src/world/MapAdapter.ts", "sha256": sha(ADAPTER_PATH.read_bytes()), "origin_lon_lat": ORIGIN, "gameplay_scale": SCALE, "x": "(lon + 0.0012) * 111320 * cos(40.1017*pi/180) * 0.7", "z": "-(lat - 40.1017) * 111320 * 0.7", "axes": "X east, Y up, Z south; distances to roads are real metres before 0.7 scaling", "height": "Unspecified. The URL a parameter is not used as a surveyed camera height."}, "matching_notes": ["Camera positions are provider-reported, not survey-grade measurements.", "Primary road matches describe camera location; visible_mapped_subjects separately describes objects in the image.", "Nearby road candidates expose junction ambiguity. Distances are to dataset centerlines, whose coordinates are rounded.", "Indices are zero-based within the recorded dataset snapshot. Content hashes survive array reordering but change if geometry or attributes change.", "Source OSM IDs were not retained by this project; generated feature IDs are not OSM IDs.", "Re-match against geometry if the map checksum changes. Never identify a facade solely by the nearest road or nearest building.", "Street View screenshots are perspective views, not orthophotos. Camera points and headings do not georeference each image pixel.", "All imagery postdates the 1998 game setting. Building ages and historical appearance are not established.", "The provider information panel, map overlays, attribution and original image obstructions are retained."], "images": images}
    dump(ROOT / "sources/captures.json", captures)
    dump(ROOT / "manifest.json", manifest)
    dump(ROOT / "camera-points.geojson", {"type": "FeatureCollection", "name": "La Pobla Tornesa Street View camera positions", "features": geo})
    dump(ROOT / "matched-features.json", {"map_sha256": manifest["project_map"]["sha256"], "id_convention": "layer + first 16 hex digits of SHA256 of canonical source feature JSON", "canonical_json": "UTF-8, sorted keys, no whitespace, ensure_ascii=False", "features": list(refs.values())})
    with (ROOT / "image-index.csv").open("w", newline="") as out:
        writer = csv.writer(out)
        writer.writerow(["id", "file", "area", "title", "longitude", "latitude", "heading_deg", "pitch_deg", "imagery_month", "game_x", "game_z", "road_source_index", "road_name", "road_distance_m", "panorama_id", "source_url"])
        for im in images:
            c, road = im["camera"], im["camera_road_match"]
            writer.writerow([im["id"], im["file"], im["area"], im["title"], c["longitude"], c["latitude"], c["heading_degrees_clockwise_from_north"], c["pitch_degrees_up_from_horizon"], im["imagery_month"], c["game_x"], c["game_z"], road["source_index"], road["name"], road["distance_m"], im["panorama_id"], im["source_url"]])
    build_gallery(data, images)
    print(json.dumps({"images": len(images), "panoramas": manifest["unique_panorama_count"], "maximum_camera_road_distance_m": max(i["camera_road_match"]["distance_m"] for i in images), "bytes": sum(i["image"]["bytes"] for i in images)}, indent=2))
    for im in images:
        r = im["camera_road_match"]
        print(im["id"], r["source_index"], r["name"], r["distance_m"], "nearest", im["nearest_road_candidates"][0]["source_index"])


def build_gallery(data, images):
    esc = html.escape
    cards = []
    for im in images:
        c, r = im["camera"], im["camera_road_match"]
        cards.append(f'<article id="image-{im["id"]}" data-area="{esc(im["area"])}"><h2>{im["id"]} · {esc(im["title"])}</h2><a href="{esc(im["file"])}"><img loading="lazy" src="{esc(im["file"])}" alt="{esc(im["visual_notes"])}"></a><p>{esc(im["visual_notes"])}</p><p class="meta">{c["latitude"]:.7f}, {c["longitude"]:.7f} · {c["heading_degrees_clockwise_from_north"]:g}° · pitch {c["pitch_degrees_up_from_horizon"]:+g}°<br>Imagery {im["imagery_month"]} · road[{r["source_index"]}] {esc(r["name"])} · {r["distance_m"]:.2f} m from centerline<br>Game X {c["game_x"]:.2f} · Z {c["game_z"]:.2f}</p><a href="{esc(im["reopen_url"])}" target="_blank" rel="noreferrer">Reopen this view in Google Maps ↗</a></article>')
    areas = sorted({im["area"] for im in images})
    options = ''.join(f'<option value="{esc(a)}">{esc(a)}</option>' for a in areas)
    page = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>La Pobla Tornesa · Street View references</title><style>
    *{box-sizing:border-box}body{margin:0;background:#f4f0e8;color:#202b29;font:16px/1.55 system-ui,sans-serif}header,main{max-width:1500px;margin:auto;padding:32px}header{padding-bottom:12px}h1{font-size:clamp(28px,4vw,46px);line-height:1.1;margin:8px 0 20px}header p{max-width:940px}.kicker{letter-spacing:.13em;font-size:12px;font-weight:700;color:#46645b}nav{display:flex;gap:16px;flex-wrap:wrap;align-items:center}a{color:#195d50}select{padding:10px;border:1px solid #b9c4be;background:white;border-radius:6px;font:inherit}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:24px}article{background:white;border:1px solid #d9ddd7;border-radius:8px;padding:18px;scroll-margin-top:20px}article h2{font-size:18px;margin:0 0 14px;min-height:56px}article img{width:100%;height:auto;border-radius:4px;display:block}article p{font-size:14px}.meta{font-size:12px!important;color:#52615b;border-top:1px solid #dde3dc;padding-top:12px}article[hidden]{display:none}footer{padding:24px 32px;font-size:13px}details{margin-top:20px}summary{cursor:pointer;font-weight:600}.maps{display:grid;grid-template-columns:1fr 1fr;gap:16px}.maps object{width:100%;background:#fff;border:1px solid #d9ddd7}@media(max-width:700px){header,main{padding:20px}.maps{grid-template-columns:1fr}}
    </style><header><div class="kicker">MALANDRINS / LOCATION REFERENCES</div><h1>La Pobla Tornesa, at street level</h1><p>24 unmodified Google Street View screenshots, organized into six areas. Camera positions and viewing directions link each image to the project’s map. Imagery dates: May 2026 and November 2024.</p><nav><label>Area <select id="area"><option value="">All areas</option>OPTIONS</select></label><a href="manifest.json">Full metadata</a><a href="camera-points.geojson">GeoJSON camera points</a><a href="image-index.csv">CSV index</a><a href="README.md">Matching guide</a></nav><details open><summary>Camera locations on the project map</summary><p>Numbers group images taken from the same panorama. Arrows show viewing directions, without implying a visible footprint. Roads and buildings: © OpenStreetMap contributors.</p><div class="maps"><object data="coverage-overview.svg" type="image/svg+xml" aria-label="Town coverage map"></object><object data="coverage-historic-core.svg" type="image/svg+xml" aria-label="Historic core coverage map"></object></div></details></header><main class="grid">CARDS</main><footer>Imagery © 2026 Google. Attribution and Street View overlays retained. Local reference collection; no open-content license is asserted for Google imagery.</footer><script>document.querySelector('#area').addEventListener('change',e=>{for(const card of document.querySelectorAll('article'))card.hidden=!!e.target.value&&card.dataset.area!==e.target.value;});</script></html>'''
    (ROOT / "index.html").write_text(page.replace("OPTIONS", options).replace("CARDS", ''.join(cards)))
    for name, bounds in [("overview", [-0.0032, 40.0982, 0.0028, 40.1038]), ("historic-core", [-0.00195, 40.10098, -0.00035, 40.10222])]:
        west, south, east, north = bounds
        xmin, zmin = xy([west, north])
        xmax, zmax = xy([east, south])
        ratio = min(700 / (xmax - xmin), 690 / (zmax - zmin))
        width, height = (xmax - xmin) * ratio + 50, (zmax - zmin) * ratio + 85
        def point(c):
            x, z = xy(c)
            return ((x - xmin) * ratio + 25, (z - zmin) * ratio + 55)
        svg = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img"><title>Street View camera coverage: {name}</title><rect width="100%" height="100%" fill="#faf8f1"/><defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#d85d34"/></marker><clipPath id="map"><rect x="15" y="45" width="{width-30}" height="{height-70}"/></clipPath></defs><text x="25" y="28" font-family="sans-serif" font-size="18" font-weight="bold">{esc(name.replace("-", " ").title())}</text><text x="{width-55}" y="28" font-family="sans-serif" font-size="14">↑ N</text><g clip-path="url(#map)">']
        for r in data["roads"]:
            for line in lines(r):
                coords = ' '.join(f'{x:.2f},{y:.2f}' for x, y in map(point, line))
                svg.append(f'<polyline points="{coords}" fill="none" stroke="#bac7be" stroke-width="{3 if r["t"] == "tertiary" else 1.5}"><title>{esc(r["n"] or r["t"])}</title></polyline>')
        for b in data["buildings"]:
            coords = ' '.join(f'{x:.2f},{y:.2f}' for x, y in map(point, b["c"]))
            svg.append(f'<polygon points="{coords}" fill="#d4cec0" stroke="#b0a795"><title>{esc(b["n"] or b["t"])}</title></polygon>')
        groups = {}
        for im in images:
            groups.setdefault(im["panorama_id"], []).append(im)
        for group in groups.values():
            c = group[0]["camera"]
            lon, lat = c["longitude"], c["latitude"]
            if not (west <= lon <= east and south <= lat <= north):
                continue
            x, y = point([lon, lat])
            for im in group:
                h = math.radians(im["camera"]["heading_degrees_clockwise_from_north"])
                svg.append(f'<path d="M{x},{y} l{math.sin(h)*22},{-math.cos(h)*22}" stroke="#d85d34" stroke-width="2" marker-end="url(#arrow)"/>')
            label = '/'.join(i["id"] for i in group)
            svg.append(f'<circle cx="{x}" cy="{y}" r="4" fill="#195d50"/>')
            in_detail = -0.00195 <= lon <= -0.00035 and 40.10098 <= lat <= 40.10222
            if name != "overview" or not in_detail:
                svg.append(f'<text x="{x+7}" y="{y-8}" font-size="12" font-family="sans-serif" font-weight="bold" stroke="#faf8f1" stroke-width="3" paint-order="stroke" fill="#173e33">{label}</text>')
        if name == "overview":
            ax, ay = point([-0.00195, 40.10222])
            bx, by = point([-0.00035, 40.10098])
            svg.append(f'<rect x="{ax}" y="{ay}" width="{bx-ax}" height="{by-ay}" fill="none" stroke="#195d50" stroke-dasharray="4 4"/><text x="{ax}" y="{by+17}" font-family="sans-serif" font-size="11" fill="#195d50">Historic core → detail map</text>')
        svg.append(f'</g><text x="25" y="{height-10}" font-family="sans-serif" font-size="11" fill="#546057">Map © OpenStreetMap contributors · camera positions from Google Street View</text></svg>')
        (ROOT / f"coverage-{name}.svg").write_text(''.join(svg))


if __name__ == "__main__":
    main()
