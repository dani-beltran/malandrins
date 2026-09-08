# Map data and attribution

> Derived from OpenStreetMap data for La Pobla Tornesa (ODbL 1.0).
> © OpenStreetMap contributors — https://www.openstreetmap.org/copyright

The game preserves these notices and includes visible attribution on the title screen and the full map. The map bounds are longitude −0.012 to 0.012 and latitude 40.092 to 40.112. No live OpenStreetMap requests are made at runtime.

`src/data/laPoblaMap.ts` is the source dataset; road widths, generated buildings, vegetation and fictional festival scenery are applied separately at runtime. Ground elevation comes from the ICV terrain data described below.

Map data attribution: **© OpenStreetMap contributors**.

- [OpenStreetMap attribution and copyright](https://www.openstreetmap.org/copyright)
- [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/)

Retain the data’s attribution and license notices when distributing the project. The included dataset makes the input data available alongside the game source. These notices concern the map data; they do not claim that the custom game code, fictional story, procedural art or original synthesized score are OpenStreetMap works.

## Terrain

**Terrain derived from ICV MDT Castellón / LiDAR-PNOA 2017, CC BY 4.0 scne.es.**

- [Official ICV dataset](https://dadesobertes.gva.es/dataset/modelo-digital-del-terreno-mdt-de-lidar-de-1-metro-de-resolucion-de-la-provincia-de-castel-2017)
- [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/)
- [Local provenance and preparation guide](references/topographic-data/README.md)

The source was cropped to the map boundary, resampled to a 257 × 257 vertex grid and converted into a game mesh with uniform 0.7 scaling and a 299.1851501464844 m baseline. The game bundles the unmodified derived Float32 samples and JSON metadata directly from `references/topographic-data/derived/icv-2017-heightmap-257.*`. Runtime triangle interpolation also places roads and objects on the ground. The extended backdrop beyond the playable boundary is artistic, not surveyed terrain. The 2017 survey is not a reconstruction of 1998 ground conditions.
