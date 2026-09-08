"""Rebuild offline terrain references from the two original CNIG zone 31 tiles.

Run with Python 3 and the packages in requirements.txt. No network access is used.
"""
from pathlib import Path
from contextlib import ExitStack
import hashlib
import json
import math
import struct

import numpy as np
import rasterio
from rasterio.merge import merge
from rasterio.windows import from_bounds
from rasterio.warp import transform_bounds
from pyproj import Transformer
from scipy.ndimage import map_coordinates
from PIL import Image

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'derived'
BOUNDS = [-0.012, 40.092, 0.012, 40.112]
ORIGIN = [-0.0012, 40.1017]
SCALE = 0.7
PNG_RANGE = [0.0, 1000.0]
TILES = [
    ('MDT50CM-ETRS89-H31-0616-5-3-COB3-V1.tif', '12759405'),
    ('MDT50CM-ETRS89-H31-0616-5-4-COB3-V1.tif', '12759773'),
]
CREDIT = 'Derived from MDT50cm-cob3 2023, CC BY 4.0 scne.es, IGN/CNIG'


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def game_x(lon):
    return (lon - ORIGIN[0]) * 111320 * math.cos(math.radians(ORIGIN[1])) * SCALE


def game_z(lat):
    return -(lat - ORIGIN[1]) * 111320 * SCALE


def write_glb(path, heights, baseline, credit=CREDIT):
    """Minimal glTF 2.0 mesh; game X east, Y up, Z south; scale already applied."""
    n = heights.shape[0]
    west, south, east, north = BOUNDS
    x = np.linspace(game_x(west), game_x(east), n)
    z = np.linspace(game_z(north), game_z(south), n)
    xx, zz = np.meshgrid(x, z)
    yy = (heights - baseline) * SCALE
    pos = np.stack([xx, yy, zz], axis=-1).astype('<f4').reshape(-1, 3)
    dy_dz, dy_dx = np.gradient(yy, z[1] - z[0], x[1] - x[0])
    normals = np.stack([-dy_dx, np.ones_like(yy), -dy_dz], axis=-1)
    normals /= np.linalg.norm(normals, axis=-1, keepdims=True)
    normals = normals.astype('<f4').reshape(-1, 3)
    aa = (np.arange(n - 1)[:, None] * n + np.arange(n - 1)[None, :]).ravel()
    indices = np.stack([aa, aa + n, aa + 1, aa + 1, aa + n, aa + n + 1], axis=1).astype('<u4').ravel()
    parts = [pos.tobytes(), normals.tobytes(), indices.tobytes()]
    offsets = [0, len(parts[0]), len(parts[0]) + len(parts[1])]
    blob = b''.join(parts)
    doc = {
        'asset': {'version': '2.0', 'generator': 'Malandrins terrain reference preparation', 'copyright': credit},
        'scene': 0, 'scenes': [{'nodes': [0]}],
        'nodes': [{'name': 'La Pobla Tornesa ground — current game extent', 'mesh': 0}],
        'meshes': [{'primitives': [{'attributes': {'POSITION': 0, 'NORMAL': 1}, 'indices': 2, 'material': 0}]}],
        'materials': [{'name': 'Neutral terrain reference', 'pbrMetallicRoughness': {'baseColorFactor': [0.45, 0.49, 0.32, 1], 'metallicFactor': 0, 'roughnessFactor': 1}}],
        'buffers': [{'byteLength': len(blob)}],
        'bufferViews': [{'buffer': 0, 'byteOffset': offset, 'byteLength': len(part), 'target': 34962 if i < 2 else 34963} for i, (offset, part) in enumerate(zip(offsets, parts))],
        'accessors': [
            {'bufferView': 0, 'componentType': 5126, 'count': len(pos), 'type': 'VEC3', 'min': pos.min(axis=0).tolist(), 'max': pos.max(axis=0).tolist()},
            {'bufferView': 1, 'componentType': 5126, 'count': len(normals), 'type': 'VEC3'},
            {'bufferView': 2, 'componentType': 5125, 'count': len(indices), 'type': 'SCALAR'},
        ],
        'extras': {'source': credit, 'bounds_wgs84': BOUNDS, 'game_origin_wgs84': ORIGIN, 'game_scale': SCALE, 'baseline_elevation_m': baseline, 'triangles': len(indices) // 3},
    }
    encoded = json.dumps(doc, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    blob += b'\0' * (-len(blob) % 4)
    total = 12 + 8 + len(encoded) + 8 + len(blob)
    path.write_bytes(struct.pack('<4sII', b'glTF', 2, total) + struct.pack('<I4s', len(encoded), b'JSON') + encoded + struct.pack('<I4s', len(blob), b'BIN\0') + blob)
    return {'vertices': len(pos), 'triangles': len(indices) // 3, 'y_formula': '(orthometric_elevation_m - baseline_elevation_m) * 0.7', 'baseline_elevation_m': baseline}


def preview(height, baseline, output_name='terrain-preview.png', source_label='2023 LiDAR ground model · original grid 0.5 m · provisional V1', credit=CREDIT):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.colors import LightSource, Normalize, LinearSegmentedColormap
    n = len(height)
    west, south, east, north = BOUNDS
    x = np.linspace(game_x(west) / SCALE, game_x(east) / SCALE, n)
    z = np.linspace(game_z(north) / SCALE, game_z(south) / SCALE, n)
    norm = Normalize(vmin=float(height.min()), vmax=float(height.max()))
    cmap = LinearSegmentedColormap.from_list('ground', ['#234f41', '#74916a', '#b8b58a', '#d6bd90', '#faf0d6'])
    rgb = LightSource(azdeg=315, altdeg=45).shade(height, cmap=cmap, norm=norm, dx=x[1] - x[0], dy=z[1] - z[0], vert_exag=1, blend_mode='soft')
    fig = plt.figure(figsize=(16, 9), facecolor='#f6f4ec')
    fig.subplots_adjust(left=0.07, right=0.95, bottom=0.13, top=0.86, wspace=0.18)
    ax = fig.add_subplot(1, 2, 1)
    ax.imshow(rgb, extent=[x[0], x[-1], -z[-1], -z[0]], origin='upper')
    contours = ax.contour(x, -z, height, levels=np.arange(math.ceil(float(height.min()) / 20) * 20, float(height.max()), 20), colors='#293a31', linewidths=0.5, alpha=0.65)
    ax.clabel(contours, fontsize=7, fmt='%d m')
    ax.plot(0, 0, 'o', color='#c9452e', markersize=5)
    ax.annotate('Game origin', (0, 0), xytext=(7, 8), textcoords='offset points', fontsize=9)
    ax.set(title='Elevation and 20 m contours · north up', xlabel='Approximate metres east of game origin', ylabel='Approximate metres north of game origin')
    ax2 = fig.add_subplot(1, 2, 2, projection='3d')
    xx, nn = np.meshgrid(x, -z)
    ax2.plot_surface(xx, nn, height, rstride=2, cstride=2, facecolors=rgb, linewidth=0, antialiased=True, shade=False)
    ax2.set_box_aspect((x[-1] - x[0], z[-1] - z[0], float(height.max() - height.min())), zoom=0.82)
    ax2.view_init(elev=35, azim=-135)
    ax2.set(title='Terrain preview · true proportions', xlabel='East (m)', ylabel='North (m)', zlabel='Elevation (m)', zticks=[300, 400, 500], xticks=[-500, 0, 500, 1000], yticks=[-1000, -500, 0, 500, 1000])
    ax2.tick_params(labelsize=8)
    fig.suptitle('La Pobla Tornesa — terrain for Malandrins\n' + source_label, fontsize=17, fontweight='bold')
    fig.text(0.5, 0.04, 'Current game boundary · Preview sampled at 257 × 257 vertices · Colors show elevation, not land cover\n' + credit, ha='center', fontsize=9, linespacing=1.6)
    fig.savefig(OUT / output_name, dpi=160, facecolor=fig.get_facecolor())
    plt.close(fig)


def main():
    OUT.mkdir(exist_ok=True)
    reports = {}
    with ExitStack() as stack:
        datasets = [stack.enter_context(rasterio.open(ROOT / 'raw' / name)) for name, _ in TILES]
        for (name, identifier), src in zip(TILES, datasets):
            assert src.res == (0.5, 0.5)
            assert src.crs.to_epsg() == 3043
            values = src.read(1, masked=True)
            assert values.count() == values.size and np.isfinite(values).all()
            reports[name] = {'cnig_id': identifier, 'metadata_url': f'https://centrodedescargas.cnig.es/CentroDescargas/detalleArchivo?sec={identifier}', 'download_url': 'https://centrodedescargas.cnig.es/CentroDescargas/descargaDir', 'download_method': 'POST', 'download_form': {'secDescDirLA': identifier}, 'year': 2023, 'resolution_m': [0.5, 0.5], 'crs': src.crs.to_string(), 'raster_bounds_easting_northing': list(src.bounds), 'width': src.width, 'height': src.height, 'nodata': src.nodata, 'valid_fraction': values.count() / values.size, 'min_elevation_m': float(values.min()), 'max_elevation_m': float(values.max()), 'area_or_point': src.tags().get('AREA_OR_POINT')}
        a, b = datasets
        overlap = (max(a.bounds.left, b.bounds.left), max(a.bounds.bottom, b.bounds.bottom), min(a.bounds.right, b.bounds.right), min(a.bounds.top, b.bounds.top))
        difference = np.abs(a.read(1, window=from_bounds(*overlap, a.transform)) - b.read(1, window=from_bounds(*overlap, b.transform)))
        assert difference.max() == 0
        extent = transform_bounds('EPSG:4326', 'EPSG:25831', *BOUNDS, densify_pts=101)
        # One metre of padding keeps bilinear sampling valid on the game boundary.
        xmin, ymin = [math.floor(v * 2) / 2 - 1 for v in extent[:2]]
        xmax, ymax = [math.ceil(v * 2) / 2 + 1 for v in extent[2:]]
        mosaic, transform = merge(datasets, bounds=(xmin, ymin, xmax, ymax), res=0.5, nodata=-32767, method='first')
        dem = mosaic[0]
        assert np.isfinite(dem).all() and not np.any(dem == -32767)
        profile = a.profile.copy()
        # EPSG:3043 and EPSG:25831 have the same UTM projection, but different
        # declared axis order. Raster x/y remains easting/northing throughout.
        profile.update(width=dem.shape[1], height=dem.shape[0], transform=transform, crs='EPSG:25831', compress='deflate', predictor=3, BIGTIFF='IF_SAFER')
        with rasterio.open(OUT / 'ground-game-area-0p5m.tif', 'w', **profile) as dst:
            dst.write(dem, 1)
            dst.update_tags(AREA_OR_POINT='Point', attribution=CREDIT, elevation_units='metres', height_reference='orthometric', source_release='provisional V1 / NPC01', processing='Native 0.5 m grid crop and mosaic; no elevation resampling. Includes 1 m padding around projected game envelope.')
        to_utm = Transformer.from_crs('EPSG:4326', 'EPSG:25831', always_xy=True)

        def sample(lon, lat):
            easting, northing = to_utm.transform(lon, lat)
            col = (np.asarray(easting) - transform.c) / transform.a - 0.5
            row = (np.asarray(northing) - transform.f) / transform.e - 0.5
            assert np.min(col) >= 0 and np.max(col) <= dem.shape[1] - 1
            assert np.min(row) >= 0 and np.max(row) <= dem.shape[0] - 1
            return map_coordinates(dem, [row, col], order=1, mode='constant', cval=np.nan, prefilter=False)

        baseline = float(sample(np.array([ORIGIN[0]]), np.array([ORIGIN[1]]))[0])
        grids = {}
        for n in [1025, 257]:
            west, south, east, north = BOUNDS
            lon, lat = np.meshgrid(np.linspace(west, east, n), np.linspace(north, south, n))
            heights = sample(lon, lat).astype('<f4')
            assert np.isfinite(heights).all() and heights.min() >= PNG_RANGE[0] and heights.max() <= PNG_RANGE[1]
            stem = f'game-heightmap-{n}'
            heights.tofile(OUT / f'{stem}.f32')
            encoded = np.rint((heights - PNG_RANGE[0]) * 65535 / (PNG_RANGE[1] - PNG_RANGE[0])).astype(np.uint16)
            Image.fromarray(encoded).save(OUT / f'{stem}.png')
            decoded = np.asarray(Image.open(OUT / f'{stem}.png'), dtype=np.float64) / 65535 * (PNG_RANGE[1] - PNG_RANGE[0]) + PNG_RANGE[0]
            max_error = float(np.max(np.abs(decoded - heights)))
            assert max_error <= (PNG_RANGE[1] - PNG_RANGE[0]) / 65535 / 2 + 0.00005
            info = {'width': n, 'height': n, 'bounds_wgs84': BOUNDS, 'sampling': 'Bilinear from native ground elevation. Samples are mesh vertices, including all four exact game boundary edges; not image pixel-area centers.', 'row_order': 'north to south', 'column_order': 'west to east', 'f32': {'file': f'{stem}.f32', 'dtype': 'IEEE 754 float32', 'endianness': 'little', 'layout': 'row-major, no header', 'units': 'orthometric metres'}, 'png': {'file': f'{stem}.png', 'bit_depth': 16, 'channels': 1, 'decode_metres': 'sample_uint16 / 65535 * 1000', 'min_encoded_elevation_m': PNG_RANGE[0], 'max_encoded_elevation_m': PNG_RANGE[1], 'maximum_roundtrip_error_m': max_error, 'import_as': 'linear height data; do not apply sRGB or color adjustments'}, 'game': {'origin_lon_lat': ORIGIN, 'scale': SCALE, 'min_x': game_x(west), 'max_x': game_x(east), 'min_z': game_z(north), 'max_z': game_z(south), 'width': game_x(east) - game_x(west), 'depth': game_z(south) - game_z(north), 'baseline_elevation_m': baseline, 'height_formula': '(elevation_m - baseline_elevation_m) * 0.7', 'horizontal_spacing_x': (game_x(east) - game_x(west)) / (n - 1), 'horizontal_spacing_z': (game_z(south) - game_z(north)) / (n - 1)}, 'min_elevation_m': float(heights.min()), 'max_elevation_m': float(heights.max()), 'valid_fraction': 1.0, 'attribution': CREDIT}
            write_json(OUT / f'{stem}.json', info)
            grids[str(n)] = info
            if n == 257:
                mesh = write_glb(OUT / 'terrain-game-257.glb', heights, baseline)
                preview(heights, baseline)
    geojson = {'type': 'FeatureCollection', 'features': [{'type': 'Feature', 'properties': {'name': 'Current Malandrins game extent', 'note': 'Game boundary, not municipal boundary'}, 'geometry': {'type': 'Polygon', 'coordinates': [[[BOUNDS[0], BOUNDS[1]], [BOUNDS[2], BOUNDS[1]], [BOUNDS[2], BOUNDS[3]], [BOUNDS[0], BOUNDS[3]], [BOUNDS[0], BOUNDS[1]]]]}}]}
    write_json(ROOT / 'game-area.geojson', geojson)
    manifest = {'downloaded_on': '2026-09-07', 'place': 'La Pobla Tornesa, Castellón, Spain', 'recommended_source': 'CNIG PNOA-LiDAR third coverage MDT50cm V1, 2023, UTM zone 31', 'status': 'Provisional ground classification NPC01; 0.5 m grid is not a claim of 0.5 m accuracy.', 'attribution': CREDIT, 'license_url': 'https://creativecommons.org/licenses/by/4.0/', 'game_bounds_wgs84': BOUNDS, 'raw_tiles': reports, 'validation': {'overlap_samples': int(difference.size), 'overlap_max_absolute_difference_m': float(difference.max()), 'native_game_crop_valid_fraction': 1.0, 'native_game_crop_min_elevation_m': float(dem.min()), 'native_game_crop_max_elevation_m': float(dem.max()), 'native_game_crop_shape_rows_columns': list(dem.shape), 'native_game_crop_bounds_epsg25831': [xmin, ymin, xmax, ymax], 'heightmaps_valid_fraction': 1.0, 'origin_elevation_m': baseline}, 'mesh': mesh, 'files': []}
    for path in sorted(ROOT.rglob('*')):
        if path.is_file() and path.name not in ['manifest.json', 'README.md'] and '__pycache__' not in path.parts:
            manifest['files'].append({'path': str(path.relative_to(ROOT)), 'bytes': path.stat().st_size, 'sha256': hashlib.file_digest(path.open('rb'), 'sha256').hexdigest()})
    write_json(ROOT / 'manifest.json', manifest)
    print(json.dumps({'validation': manifest['validation'], 'mesh': mesh, 'total_bytes': sum(f['bytes'] for f in manifest['files'])}, indent=2))


if __name__ == '__main__':
    main()
