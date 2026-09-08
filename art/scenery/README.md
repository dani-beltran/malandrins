# Low-poly town landmarks

Editable Blender sources for the rebuilt town. Each model uses flat faces and original geometry/materials; no Google image pixels are included in the assets.

| Source             | Runtime export                         | Reference                            |
| ------------------ | -------------------------------------- | ------------------------------------ |
| `church.blend`     | `public/assets/scenery/church.glb`     | Street View 22–23, PNOA roof outline |
| `prison.blend`     | `public/assets/scenery/prison.glb`     | Antiga Presó, view 24                |
| `townhall.blend`   | `public/assets/scenery/townhall.glb`   | Casa de la Vila, view 19             |
| `publichall.blend` | `public/assets/scenery/publichall.glb` | Separate public building, view 18    |
| `passage.blend`    | `public/assets/scenery/passage.glb`    | Barreretes, view 04                  |

The runtime convention is +Y up and +Z out of the main facade, with the origin at ground level in the center of the facade. Blender sources use Z up; the exporter converts axes. Dimensions already use the game's 0.7 geographic scale. Placement is stored separately in `src/data/scenery/town-layout.json`.

Rebuild all source models and GLBs with:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python scripts/scenery/build-landmarks.py
```

This regenerates and **overwrites** the five `.blend` files and their GLBs. Save manual Blender edits separately before regenerating. Model triangle counts are recorded in `public/assets/scenery/landmarks.json`.

These are visual approximations from the available images, not measured architectural surveys. The church facade and belfry, prison masonry and barred windows, town-hall glazing, red-trimmed public hall and traversable covered passage are modeled individually.
