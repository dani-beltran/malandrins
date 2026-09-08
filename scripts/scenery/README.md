# Reconstructing the town

The scenery is based on the modern references. The story retains its original setting, but scenery does not attempt historical reconstruction.

1. `blocks.json` contains manually traced roof-block envelopes, detached houses, open squares and orchard regions in the **original 3072 × 3072** pixel coordinates of `06-aerial-town-center-pnoa.jpg`.
2. `build-layout.py` reprojects those pixels from the recorded EPSG:3857 image extent into the unchanged MapAdapter coordinate system. It cuts out the road and sidewalk corridors, allocates joined lots inside each block, removes overlaps, and keeps the landmark entrances clear. Lot divisions, building heights and unseen facades are inferred, not cadastral measurements.
3. `src/data/scenery/road-profiles.json` records the narrower street widths, sidewalks and surfaces inferred from the ground-level references. Original OSM line geometry and the geographic projection remain intact.
4. The generated `town-layout.json` drives both visible buildings and collision. `TownScenery.ts` adds facade details, irregular pitched roofs, garden boundaries, trees, street furniture and landmarks. Minimap outlines use the same rebuilt footprints.
5. `build-landmarks.py` runs in Blender and exports five original GLBs plus editable `.blend` sources. See `art/scenery/README.md`.

## Regenerate layout

Use Node 24 and Python with Pillow and Shapely 2.1.2. Geometry tooling is only needed when authoring scenery; the game has no Python/Blender dependency at runtime.

```sh
python3 -m venv /tmp/malandrins-scenery
/tmp/malandrins-scenery/bin/pip install Pillow Shapely==2.1.2
/tmp/malandrins-scenery/bin/python scripts/scenery/build-layout.py
```

Outputs include the compact runtime layout, a footprint overlay in `artifacts/scenery/layout-aerial-review.jpg`, and a resized/softened PNOA ground texture. The generated JSON is excluded from Prettier so regeneration remains deterministic. Original references are untouched.

## Compare reference viewpoints

Run the development server, then open `/?reference=03`, using any of the 24 reference IDs. The mode hides the interface, uses the recorded camera position, compass bearing and pitch, and renders a fixed camera. `&eye=1.85&fov=108` adjusts the **estimated** camera eye height and vertical field of view. Google camera height and field of view were not calibrated, so comparisons must account for those uncertainties. The comparison mode is omitted from production behavior.

```sh
node scripts/scenery/inspect.mjs 03 04 19 20 23 24
```

Run `node scripts/scenery/build-review.mjs` to create `artifacts/scenery/review.html`, a local side-by-side viewer.

This saves the matching game views and reports render counts, asset errors and blocked character/vehicle positions. Render counts include shadow passes; these are not unique mesh triangle totals. Browser captures use a temporary headless Chrome profile.

`npm test` verifies reference camera clearance, sampled street centerlines, the open passage, layout integrity and GLB budgets. `npm run test:e2e` checks actual movement, vehicles, dialogue, rewards, saves and terrain placement.

## Fidelity limits

The footprint overlay shows exactly what was reconstructed. Traced envelopes are approximate roof outlines; party-wall locations, rear elevations and heights are estimates. The imagery covers 17 unique panorama positions, and missing side streets are completed with the same low-poly architectural kit. Small decorative furniture has no movement collision. Terrain uses the existing 257-grid survey, so steps and retaining walls are visual details rather than new movement surfaces.

Ground texture and aerial-derived layout: **PNOA, IGN/CNIG, Sistema Cartográfico Nacional — CC BY 4.0 scne.es**. Source imagery at the sampled town center dates to July 2024. Google Street View is used as a visual reference only; its screenshots are not shipped in `public/`. Full notices are in `MAP_DATA.md`.
