# La Pobla Tornesa — Google Street View references

**24 actual Street View screenshots from 17 panorama positions**, acquired through the browser on **8 September 2026**. Twenty-two views use **May 2026** imagery; images **15 and 17** use **November 2024** imagery. Every image was visually inspected. The JPEGs are unmodified browser captures at **738 × 1087 pixels**, with Google’s attribution and interface overlays retained.

Open **[the visual catalog](index.html)** to browse pictures, filter by area, inspect camera coverage and reopen each exact panorama and viewing direction in Google Maps.

## Files

- [manifest.json](manifest.json): authoritative image metadata, camera coordinates and directions, game positions, road matches, visible subjects, source links and file checksums.
- [camera-points.geojson](camera-points.geojson): one EPSG:4326 point per image, with its filename, bearing and road reference. Multiple directions at one panorama deliberately share a point.
- [image-index.csv](image-index.csv): compact searchable index.
- [matched-features.json](matched-features.json): referenced project features with original geometry, zero-based source indices and content hashes.
- [coverage-overview.svg](coverage-overview.svg) and [coverage-historic-core.svg](coverage-historic-core.svg): camera locations and direction arrows drawn over the actual project geometry.
- [sources/captures.json](sources/captures.json) and `sources/NN-page.txt`: observed panorama URLs, imagery dates and public page text captured alongside each image.
- [build_index.py](build_index.py): offline catalog regeneration and integrity checks; requires Python and Pillow. Run after reviewing its feature assignments if the project map changes.

## Area and image index

| Folder | Images | Coverage |
| --- | --- | --- |
| `01-north-center/` | 01, 02, 14 | Cabanes, Raval and Hospital |
| `02-historic-core/` | 03–06, 09–10, 18–20, 22–24 | Enmig, Barreretes, Dalt la Vila, Baix la Vila, Baix les Cases, school, public buildings, town hall, prison and church |
| `03-south-center/` | 07–08 | Plaça del Portal |
| `04-west-and-north-edges/` | 11–13 | Tossal de la Vila, Vilafamés and Calvari–Constitució |
| `05-east-residential/` | 15–16, 21 | Benicàssim and Eres |
| `06-south-approach/` | 17 | Molí de Foc / CV-1600 |

| Image | Subject | Camera road in project | Heading |
| --- | --- | --- | --- |
| [01](01-north-center/01-carrer-cabanes-ne.jpg) | Cabanes corridor | `roads[38]` Carrer Cabanes | 35° |
| [02](01-north-center/02-placa-raval-sw.jpg) | Raval junction | `roads[43]` Plaça del Raval | 230° |
| [03](02-historic-core/03-carrer-enmig-sse.jpg) | Enmig corridor | `roads[67]` carrer d'Enmig | 167° |
| [04](02-historic-core/04-barreretes-east.jpg) | Covered Barreretes passage | `roads[67]` carrer d'Enmig | 100° |
| [05](02-historic-core/05-enmig-west-facades.jpg) | Pink facade and partial prison wall | `roads[67]` carrer d'Enmig | 280° |
| [06](02-historic-core/06-school-dalt-la-vila-wsw.jpg) | School entrance and steps | `roads[27]` Carrer de Dalt la Vila | 250° |
| [07](03-south-center/07-placa-portal-wsw.jpg) | Portal trees, bench and playground | `roads[44]` Plaça del Portal | 250° |
| [08](03-south-center/08-placa-portal-nnw.jpg) | Portal northward street | `roads[44]` Plaça del Portal | 345° |
| [09](02-historic-core/09-baix-la-vila-nnw.jpg) | Baix la Vila corridor | `roads[87]` Carrer de Baix la Vila | 348° |
| [10](02-historic-core/10-baix-les-cases-south.jpg) | Corner facade and green door | `roads[37]` Carrer de Baix les Cases | 175° |
| [11](04-west-and-north-edges/11-tossal-de-la-vila-sse.jpg) | Housing rows | `roads[65]` Carrer Tossal de la Vila | 162° |
| [12](04-west-and-north-edges/12-vilafames-nw.jpg) | Northwest approach | `roads[11]` Carrer de Vilafamés | 320° |
| [13](04-west-and-north-edges/13-calvari-nnw.jpg) | Calvari landscaped rise | `roads[31]` Carrer de la Constitució | 335° |
| [14](01-north-center/14-placa-hospital-east.jpg) | Hospital square | `roads[89]` Plaça de l'Hospital | 90° |
| [15](05-east-residential/15-benicassim-wnw.jpg) | Detached housing and gardens | `roads[23]` Carrer de Benicàssim | 285° |
| [16](05-east-residential/16-eres-west-facade.jpg) | Close white facade | `roads[92]` Carrer de les Eres | 258° |
| [17](06-south-approach/17-moli-de-foc-nne.jpg) | Southern approach and palms | `roads[50]` Carrer del Molí de Foc | 20° |
| [18](02-historic-core/18-placa-ajuntament-ne.jpg) | Unnamed mapped public building | `roads[27]` Carrer de Dalt la Vila | 35° |
| [19](02-historic-core/19-ajuntament-ese.jpg) | Current town hall | `roads[67]` carrer d'Enmig | 125° |
| [20](02-historic-core/20-baix-les-cases-sse.jpg) | Narrow lane corridor | `roads[37]` Carrer de Baix les Cases | 150° |
| [21](05-east-residential/21-eres-nne.jpg) | Eres corridor and cultivated trees | `roads[92]` Carrer de les Eres | 20° |
| [22](02-historic-core/22-church-front-west.jpg) | Church doorway and steps | `roads[67]` carrer d'Enmig | 260° |
| [23](02-historic-core/23-church-upper-facade-west.jpg) | Church facade, clock and tower | `roads[67]` carrer d'Enmig | 260°, pitch +30° |
| [24](02-historic-core/24-antiga-preso-sw.jpg) | Antiga Presó stone facade | `roads[67]` carrer d'Enmig | 235° |

## Matching an image to the game

1. Find the image ID in `manifest.json`. Use the **resolved panorama longitude and latitude**, not a requested search coordinate, place pin, Google address label or the screenshot’s inset map.
2. `camera_road_match` identifies the camera’s road in [laPoblaMap.ts](../../src/data/laPoblaMap.ts). It includes the exact source index, line and segment indices, source segment coordinates, nearest point and distance in real metres. All primary matches are within **2.5 m** of a source road centerline. This is agreement with this dataset, **not a claim of surveyed positional accuracy**.
3. Use `visible_mapped_subjects` for facades or objects in view. Camera position and visible subject are distinct. The covered passage in **04** is `roads[28]`; the camera is on `roads[67]`. The town hall in **19** is `buildings[2]`; the prison in **24** is `buildings[15]`. Image **18** shows the unnamed `buildings[16]`, a different building from the current town hall.
4. Review the three `nearest_road_candidates` at junctions. The Dalt la Vila / square edges overlap in the source. Google’s labels also differ from project names: Raval appears as CV-1601, and Molí de Foc as CV-1600. The Eres camera in **16/21** lies just south of the Riu junction.
5. Use the map’s original geometry and feature checksum to identify a feature after array reordering. **These are generated local IDs, not OSM IDs**: the supplied dataset does not retain original OSM feature IDs. The manifest records SHA-256 fingerprints of the map and projection files. If either changes, re-check the projection and re-match positions against the new geometry.

The coordinates follow [MapAdapter.ts](../../src/world/MapAdapter.ts):

```text
Origin [longitude, latitude] = [-0.0012, 40.1017]
Game X = (longitude + 0.0012) × 111320 × cos(40.1017°) × 0.7
Game Z = -(latitude - 40.1017) × 111320 × 0.7
```

X points east and Z points south. Headings increase clockwise from north: 0° north, 90° east, 180° south, 270° west. Pitch is positive upward; all images are level except **23** (+30°). For a level view the game direction is `[sin(heading), 0, -cos(heading)]`. Each manifest entry also provides a 3D unit direction with pitch applied. No surveyed camera elevation is available; `game_y` is deliberately null. Use the project’s terrain sampler for ground placement and choose a camera eye height separately.

The `maps_url_y_parameter` is the saved Google view parameter (90 here), not a calibrated horizontal field of view for these portrait screenshots. These are perspective reference images: **do not apply an aerial-image world file or treat pixels as ground coordinates**. GeoJSON locates cameras only; coverage arrows are schematic directions, not visibility measurements.

## Coverage limits and source attribution

This is a representative town reference set, not exhaustive coverage of the full playable boundary. It emphasizes streets, junctions, materials and recognizable buildings. Panoramas shared by several images are recorded explicitly, so those images must not be counted as independent survey positions.

The church in **22–23** is visually identifiable, but its footprint is **missing from the project dataset**. It is explicitly marked as an unmapped subject instead of being attached to another building. Camera and view direction remain available for later placement. The prison view in **05** is partial; **24** is the clearer reference. Some views contain parked vehicles, blurred regions, shadows or overlays, documented in their notes.

All imagery postdates the game’s **1998** setting. Use it for spatial relationships and visual reference; it does not establish which buildings, surfaces or details existed in 1998.

Screenshots: **Google Street View, © 2026 Google**, with individual capture months visible in the images and manifest. The original browser imagery, attribution, inset maps and interface panels are retained; no image editing or tile stitching was performed. Google imagery is not assigned the Wikimedia licenses used by the separate [street-data collection](../street-data/README.md), nor the ODbL license of the project’s vector map. No open-content redistribution license is asserted for these screenshots.

Project vector geometry: **© OpenStreetMap contributors, ODbL 1.0**. See [MAP_DATA.md](../../MAP_DATA.md). This collection resides in `references/` and is not included in the game’s `public/` assets.
