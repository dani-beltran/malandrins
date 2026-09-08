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

## Stone bridges

The five `bridge-stone-{8,16,32,64,128}.blend` sources and matching GLBs use the
arched masonry, pale deck, thin iron posts and red tips in
[`14-bridge-coll-de-la-mola.jpg`](../../references/street-data/14-bridge-coll-de-la-mola.jpg)
as a visual reference. Dimensions and hidden details are approximations. All
geometry and colours are original; the photograph is not used as a texture.

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python scripts/scenery/build-bridges.py
```

The bridge generator only writes bridge sources, exports and a preview; it does
not regenerate the town landmarks. It overwrites its own five `.blend` files and
GLBs. Keep manual edits in a separate working copy, or incorporate them into the
generator before rebuilding.

Bridge exports use **Y up, +Z along the road, deck centre at (0, 0, 0)**. Nominal
length is the number in the filename, width is 5 game units, and deck thickness is
0.45. Dimensions already use game units: do not multiply them by 0.7 again. Keep
the deck at local Y=0 when editing. The named deck, pier, vault and facing objects
remain individually editable. Preview posts and wires are included in the source
but excluded from the GLB; the game leaves decks and approaches without barriers.

Span variants have 1, 2, 3, 5 and 9 open arches. At load time the game selects a
nearby span size, fits its width and length, and bends its subdivided shell along
the road. Existing bank elevations set the deck profile: approaches keep their
original road height. The masonry is lowered with the deck and vertically
compressed around local Y=0 to fit the available space, with a small buried
foundation. Shallow crossings therefore have shallow structures.
Materials use solid colours compatible with the existing
scenery loader. The deck shares a travel surface with player feet and vehicle
wheels; the survey and water keep their original elevations. Blender is not
required to play the game.

To export manual Blender edits, select only the structural meshes and export
GLB with selected objects, applied transforms, Y-up conversion, normals and
materials, without cameras, lights or preview barriers. Preserve the filename
and the nominal dimensions in `public/assets/scenery/bridges.json`.

The first version supports travelling across bridges. Passing below the same
bridge requires a future height-aware movement/collision system.
