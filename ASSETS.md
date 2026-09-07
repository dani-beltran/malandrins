# Malandrins: art, audio, portraits and languages

The default game generates its own models, textures, placeholder portraits and synthesized music. All required assets are included or generated locally. You can replace individual items without changing gameplay code.

## Included original files

| Folder under `public/assets/` | Files                                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| `models/`                     | `player.glb`, `marcos.glb`, `raval-80.glb`, `olive-tree.glb`                                    |
| `textures/`                   | `facade.png`, `roof.png`, `asphalt.png` (64×64)                                                 |
| `portraits/`                  | Twenty-five SVG placeholder pictures, one per character ID                                      |
| `audio/`                      | `ultima-llum.wav` (original 104 BPM synth loop, approximately 9.23 seconds, mono 22,050 Hz PCM) |

These are reusable exports of the same procedural asset system used by the game. The default configuration keeps using the generators, so missing exported files do not break the default game. Placeholder portraits are stylized invented faces, not pictures of real people. There are no voice recordings or external copyrighted game assets.

To regenerate these files, start the development server in one terminal, then run this in another:

```sh
node scripts/export-assets.mjs
```

The exporter uses an isolated Playwright browser, Three.js’s GLTF exporter and OfflineAudioContext. It creates the PNGs from the in-game texture canvases and renders the same score used by `AudioSystem`. The WAV is cut from the middle of a repeated render so looping includes the preceding notes’ tails. On systems without macOS Chrome, install Playwright Chromium or set `CHROME_PATH`. Set `GAME_URL` if the server uses a different URL. Exporting replaces the files listed above; use different filenames for your own assets.

## Put custom files in public/assets

Vite serves `public/` files directly. A file at `public/assets/portraits/marcos.webp` is requested as `assets/portraits/marcos.webp`. Use relative URLs as below; they work when the production build is hosted under a subdirectory.

Edit **`src/assets/config.ts`**. For example:

```ts
export const assetConfig: {
  models: { player?: string; car?: string; npc?: string };
  textures: { facade?: string; roof?: string; asphalt?: string };
  portraits: Record<string, string>;
  music?: string;
} = {
  models: {
    player: 'assets/models/my-player.glb',
    car: 'assets/models/my-car.glb',
    // npc: 'assets/models/my-shared-npc.glb',
  },
  textures: {
    facade: 'assets/textures/my-facade.png',
    roof: 'assets/textures/my-roof.png',
    asphalt: 'assets/textures/my-asphalt.png',
  },
  portraits: {
    marcos: 'assets/portraits/marcos.webp',
    laila: 'assets/portraits/laila.png',
    marina: 'assets/portraits/marina.jpg',
  },
  music: 'assets/audio/my-town-loop.ogg',
};
```

Delete or omit any entry to use the original generated asset. Failed model, texture or audio loads fall back to the built-in asset and log a diagnostic. A portrait that fails to load falls back to its generated SVG. Check browser network errors if an asset is missing; filenames are case-sensitive on many hosts.

## Character pictures: the picture to the left of the conversation

1. Prepare PNG, JPEG, WebP or SVG images. Use approximately **6:7 portrait proportions**, such as 192×224 or 384×448. Keep faces centered with some space around the head; the frame uses `object-fit: cover`.
2. Put them in `public/assets/portraits/`.
3. Add the relevant character ID and URL to `assetConfig.portraits`.
4. Reload the game, meet that character and press E. Their picture is displayed on the left, with their name and dialogue on the right.

Available IDs:

```text
marcos  castor  aitor  oriol  piopol  jesus  cogollo  vilero
laila   mihai   borja  irene edu     paul   marina  lucas
dorin   susana  daniel nando roberto el-alcalde    merxe
juanito eva
```

The display name and ID are separate: a file uses `jesus`, while dialogue displays `Jesus`. No source-code changes are needed for each language because both languages share the same portrait. The exported `portraits/*.svg` files are ready-made placeholders that you can use as a starting point. To use smoother photos, remove `image-rendering: pixelated` from `.portrait-frame img` in `src/style.css`.

## Import a 3D character or vehicle

Use **glTF 2.0 binary (`.glb`)** from Blender, Blockbench or another 3D editor. GLB is recommended because it bundles geometry, materials and textures into one file. Plain `.gltf` works only if all referenced buffers and images are also served in the expected relative locations. Do not use Draco, KTX2 or other compressed extensions without first configuring the corresponding decoders in `AssetLibrary`.

- Axes: **Y up, positive Z forward**.
- Character: around **2.2 game units tall**, feet at local Y = 0, centered at X/Z = 0.
- Car: around **4.3 units long**, **2.1 wide**, **1.9 high**, front facing +Z; wheels rest at local Y = 0.
- Apply transforms before export. Keep origin placement consistent with the supplied GLBs.
- Use a small triangle count, flat shading and small nearest-filtered textures for the intended look. A few hundred triangles per character/car is a useful target, not a hard engine limit.
- Bake procedural editor materials into exported textures or use standard glTF materials. Editor-only shader graphs do not export to the game.

`AssetLibrary` loads and clones models. `ModelFactory` uses your player, car or shared NPC template in place of its procedural mesh. The exported `marcos.glb` can be assigned to the `npc` slot to try the replacement path; that slot replaces **all NPC models**, not their names, dialogue or portrait pictures. To give each NPC a separate mesh, extend the model configuration with character IDs, load each template in `AssetLibrary`, and pass the relevant ID from `Npc` to `ModelFactory.person()`.

The built-in characters animate separate limbs procedurally. Imported models currently render in their rest pose; imported glTF animation clips are not automatically played. To support your rig’s idle/walk clips, preserve the loader’s animation array, create a `THREE.AnimationMixer` per cloned character, choose clips in `Player.update()` / `Npc.update()` and call `mixer.update(dt)`. Skinned templates are cloned with `SkeletonUtils.clone()` so separate characters do not share skeleton pose state.

Collision uses gameplay shapes independently of visual meshes. A character has a 0.48-unit radius; vehicles use a conservative 2.2-unit circle that includes their length. For substantially different dimensions, update these values in `Player.ts`, `Vehicle.ts` and the entry/exit offsets in `Vehicle.exitPosition()`. A custom visual mesh does not automatically supply its collision shape.

World buildings use the source footprint polygons or generated footprints. To add a hand-authored building, add it through `WorldBuilder`, reserve its footprint before procedural infill, and add its collision polygon to `CollisionWorld`. The exported tree is an example asset; there is no tree configuration slot yet. `ModelFactory.tree()` is the extension point.

## Import textures

`facade`, `roof` and `asphalt` are supported configuration keys. PNG is a good default; other formats supported by the browser’s image loader also work. Use powers of two such as 64×64 or 128×128 for this visual style.

The facade texture repeats on the four box faces, so the sample contains two rows of windows and a door. The same material is tinted by each generated house’s color. Roofs have simple pitched UVs. Asphalt maps onto road segments, so a non-directional tile works best. Road junction caps remain plain-colored geometry. The loader uses sRGB color textures, nearest min/mag filtering, repeat wrapping and no mipmap generation. Custom glTF materials keep their own exported texture settings.

These textures apply to **procedural buildings and roads**. Source building footprint extrusions use simple flat materials. To texture those too, extend `WorldBuilder.polygon()` with UV/material handling.

## Import music and sound

Use an OGG, MP3 or WAV file that the target browser supports. Put it in `public/assets/audio/` and set `assetConfig.music` to its URL. It loops, follows the Music & sound toggle and volume setting, and dims during pause. A failed custom track falls back to the procedural score. Browser audio starts after pressing Enter the town or using the sound controls.

The included `ultima-llum.wav` can be used immediately:

```ts
music: 'assets/audio/ultima-llum.wav';
```

For a seamless loop, export without leading/trailing silence, avoid MP3 encoder padding where possible, and check the loop point by listening. OGG or PCM WAV is convenient for short loops. Long uncompressed tracks increase downloads; a well-encoded OGG file is preferable for a longer soundtrack.

`src/assets/score.ts` defines the original note sequence and tempo. `AudioSystem` schedules short Web Audio oscillators ahead of playback time, independently from rendering. Engine, horn and reward sounds are synthesized separately from background music. Add a buffered sample bank in `AudioSystem` if you later want recorded sound effects. For voices, add optional voice URLs to dialogue lines and start/stop the corresponding sample when each line opens; no voice assets or lip-sync system are provided today.

## Add a language

1. Add a language code to `Language` in `src/data/locales.ts`.
2. Create a dictionary typed as `Record<TranslationKey, string>` so every UI key must be translated.
3. Extend `Localized` with that code and translate every character role, small-talk line and mission line in `src/data/characters.ts`.
4. Register the dictionary in `I18n.t()` and the language selector in `GameUI.languages()`.
5. Update the save validator in `SaveStore.load()` and the language action in `Game.action()` to accept the new code.
6. Extend the localization tests. Preserve `{name}`, `{count}`, `{amount}`, `{distance}` and similar substitution tokens exactly.

English and Catalan already implement all current text keys. UI language changes apply immediately, including during an open conversation. Proper names and real street signs are intentionally not translated.
