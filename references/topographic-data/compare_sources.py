"""Compare saved ICV 2017 and CNIG 2023 terrain; export an ICV game mesh."""
import json
import hashlib
import numpy as np
import rasterio
from pyproj import Transformer
from scipy.ndimage import map_coordinates
from PIL import Image
import prepare_terrain as terrain

ROOT, OUT = terrain.ROOT, terrain.OUT
CREDIT = 'Derived from ICV MDT Castellón / LiDAR-PNOA 2017, CC BY 4.0 scne.es'


def main():
    with rasterio.open(ROOT / 'raw/icv-2017-ground-game-area-1m.tif') as src:
        dem = src.read(1)
        to_utm = Transformer.from_crs(4326, src.crs, always_xy=True)

        def sample(lon, lat):
            x, y = to_utm.transform(lon, lat)
            c = (np.asarray(x) - src.transform.c) / src.transform.a - 0.5
            r = (np.asarray(y) - src.transform.f) / src.transform.e - 0.5
            return map_coordinates(dem, [r, c], order=1, mode='constant', cval=np.nan, prefilter=False)

        baseline = float(sample(np.array([terrain.ORIGIN[0]]), np.array([terrain.ORIGIN[1]]))[0])
        for n in [1025, 257]:
            west, south, east, north = terrain.BOUNDS
            lon, lat = np.meshgrid(np.linspace(west, east, n), np.linspace(north, south, n))
            heights = sample(lon, lat).astype('<f4')
            assert np.isfinite(heights).all() and heights.min() > 0 and heights.max() < 1000
            if n == 1025:
                current = np.fromfile(OUT / 'game-heightmap-1025.f32', dtype='<f4').reshape(n, n)
                delta = current - heights
                report = {'comparison': 'CNIG 2023 provisional 0.5 m minus ICV 2017 classified 1 m; both bilinearly sampled at the same 1025 x 1025 game vertices.', 'interpretation': 'Differences can reflect terrain change, interpolation or classification; this is not an external accuracy assessment.', 'samples': int(delta.size), 'median_signed_difference_m': float(np.median(delta)), 'median_absolute_difference_m': float(np.median(np.abs(delta))), 'p95_absolute_difference_m': float(np.percentile(np.abs(delta), 95)), 'maximum_absolute_difference_m': float(np.abs(delta).max()), 'fraction_abs_difference_over_2m': float(np.mean(np.abs(delta) > 2)), 'fraction_abs_difference_over_5m': float(np.mean(np.abs(delta) > 5))}
                for name, limits in [('northwest_rectangular_features', [-.012, 40.108, -.007, 40.112]), ('central_town', [-.005, 40.099, .003, 40.105])]:
                    w, s, e, no = limits
                    mask = (lon >= w) & (lon <= e) & (lat >= s) & (lat <= no)
                    d = delta[mask]
                    report[name] = {'bounds_wgs84': limits, 'median_difference_m': float(np.median(d)), 'p95_absolute_difference_m': float(np.percentile(abs(d), 95)), 'max_positive_difference_m': float(d.max()), 'min_signed_difference_m': float(d.min())}
                terrain.write_json(OUT / 'source-comparison.json', report)
                comparison_plot(current, heights, delta)
            # Both density options are retained for the reviewed source as well.
            stem = f'icv-2017-heightmap-{n}'
            heights.tofile(OUT / f'{stem}.f32')
            encoded = np.rint(heights / 1000 * 65535).astype(np.uint16)
            Image.fromarray(encoded).save(OUT / f'{stem}.png')
            meta = json.loads((OUT / f'game-heightmap-{n}.json').read_text())
            meta['f32']['file'] = f'{stem}.f32'
            meta['png']['file'] = f'{stem}.png'
            roundtrip = np.asarray(Image.open(OUT / f'{stem}.png'), dtype=np.float64) / 65535 * 1000
            meta['png']['maximum_roundtrip_error_m'] = float(abs(roundtrip - heights).max())
            meta['game']['baseline_elevation_m'] = baseline
            meta['sampling'] = 'Bilinear from ICV 2017 native 1 m ground model. Samples are mesh vertices including exact game boundary edges.'
            meta['min_elevation_m'] = float(heights.min())
            meta['max_elevation_m'] = float(heights.max())
            meta['source'] = 'raw/icv-2017-ground-game-area-1m.tif'
            meta['attribution'] = CREDIT
            terrain.write_json(OUT / f'{stem}.json', meta)
            if n == 257:
                terrain.write_glb(OUT / 'terrain-icv-2017-game-257.glb', heights, baseline, CREDIT)
                terrain.preview(heights, baseline, 'terrain-icv-2017-preview.png', '2017 ICV LiDAR ground model · original grid 1 m · refined ground classification', CREDIT)
        manifest = json.loads((ROOT / 'manifest.json').read_text())
        manifest['recommended_source'] = 'ICV Castellón 2017 classified LiDAR ground model, 1 m; use for the game ground mesh.'
        manifest['highest_resolution_source'] = 'CNIG PNOA-LiDAR MDT50cm V1, 2023, 0.5 m; supplementary fine-detail reference.'
        manifest['recommendation_reason'] = 'ICV documents refined ground classification and breaklines. The comparison shows large rectangular raised features in the provisional CNIG raster, up to 18 m above ICV in the northwest. These are consistent with residual roofs; this is a source-selection judgment, not surveyed accuracy validation.'
        manifest['status'] = {'icv': '2017 refined ground classification; complete cropped coverage.', 'cnig': '2023 provisional NPC01; complete zone 31 coverage, but local above-ground classification artifacts remain.'}
        manifest['icv_source'] = json.loads((ROOT / 'sources/icv-crop-provenance.json').read_text())
        manifest['source_comparison'] = report
        manifest['attribution'] = {'recommended_icv': CREDIT, 'supplementary_cnig': terrain.CREDIT}
        if 'mesh' in manifest:
            manifest['cnig_game_mesh'] = manifest.pop('mesh')
            manifest['cnig_game_mesh']['file'] = 'derived/terrain-game-257.glb'
        if 'validation' in manifest:
            manifest['cnig_validation'] = manifest.pop('validation')
        manifest['icv_validation'] = {'native_crop_valid_fraction': 1.0, 'heightmaps_valid_fraction': 1.0, 'heightmap_sizes': [1025, 257], 'origin_elevation_m': baseline}
        manifest['icv_game_mesh'] = {'file': 'derived/terrain-icv-2017-game-257.glb', 'vertices': 66049, 'triangles': 131072, 'baseline_elevation_m': baseline, 'scale': 0.7, 'attribution': CREDIT}
        manifest['files'] = []
        for path in sorted(ROOT.rglob('*')):
            if path.is_file() and path.name not in ['manifest.json', 'README.md'] and '__pycache__' not in path.parts:
                with path.open('rb') as stream:
                    checksum = hashlib.file_digest(stream, 'sha256').hexdigest()
                manifest['files'].append({'path': str(path.relative_to(ROOT)), 'bytes': path.stat().st_size, 'sha256': checksum})
        terrain.write_json(ROOT / 'manifest.json', manifest)
        print(json.dumps(report, indent=2))


def comparison_plot(current, older, delta):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.colors import LightSource
    # A common shade scale and extent make classification differences visible.
    fig, axes = plt.subplots(1, 3, figsize=(15, 6), layout='constrained')
    dx = (terrain.game_x(terrain.BOUNDS[2]) - terrain.game_x(terrain.BOUNDS[0])) / terrain.SCALE / 1024
    dy = (terrain.game_z(terrain.BOUNDS[1]) - terrain.game_z(terrain.BOUNDS[3])) / terrain.SCALE / 1024
    extent = [terrain.BOUNDS[0], terrain.BOUNDS[2], terrain.BOUNDS[1], terrain.BOUNDS[3]]
    for ax, values, label in zip(axes[:2], [older, current], ['ICV 2017 · 1 m ground model', 'CNIG 2023 · provisional 0.5 m']):
        shade = LightSource(azdeg=315, altdeg=45).hillshade(values, dx=dx, dy=dy)
        ax.imshow(shade, origin='upper', extent=extent, cmap='gray', vmin=0, vmax=1)
        ax.set_title(label)
    im = axes[2].imshow(delta, origin='upper', extent=extent, cmap='RdBu_r', vmin=-5, vmax=5)
    axes[2].set_title('2023 minus 2017 · metres')
    fig.colorbar(im, ax=axes[2], shrink=0.7, label='Elevation difference (m)', extend='both')
    for ax in axes:
        ax.set_xlabel('Longitude'); ax.set_ylabel('Latitude')
        ax.set_aspect(1 / np.cos(np.radians(40.102)))
        ax.ticklabel_format(useOffset=False)
    fig.suptitle('La Pobla Tornesa — comparison of two official ground models\nSame game boundary; differences include possible changes and classification effects', fontsize=14)
    fig.savefig(OUT / 'source-comparison.png', dpi=160)
    plt.close(fig)


if __name__ == '__main__':
    main()
