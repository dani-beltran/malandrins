# Malandrins

**Small town. Big trouble.** A playable, original 3D open-town adventure set in a stylized 1998 La Pobla Tornesa. It takes inspiration from the freedom of early urban sandbox games and the look of PlayStation-era graphics. Built with TypeScript, Three.js, WebGL 2 and Vite; no game server, account, API key or paid assets required.

## Play locally

Use Node.js 22.12+ (Node 24 is recommended). From this folder:

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5173/** and choose **Enter the town**. Click inside the game when returning from another window. The game pauses when the tab loses focus.

Open `/ca` for Catalan or `/en` for English (trailing slashes also work). The URL language takes priority over the saved preference. Without a supported language in the first path segment, the game uses the saved language, or English for a new player. Switching languages on a localized URL updates that path without reloading the game.

```sh
npm run build    # Type-check and produce the standalone dist/ folder
npm run preview  # Serve the production build at http://127.0.0.1:4173/
```

Serve `dist/` with any static HTTP host. Opening `index.html` directly with `file://` will not work. The runtime uses locally bundled dependencies and generated assets; it does not request external map tiles, fonts, music, or images. The OpenStreetMap credit is an ordinary external link.

Configure the host to serve `index.html` for game routes such as `/ca` and `/en`, while serving asset files normally. Vite's development and preview servers already provide this fallback. For hosting under a subdirectory, build with `npm run build -- --base=/malandrins/` and serve the game at `/malandrins/`; localized URLs then become `/malandrins/ca` and `/malandrins/en`.

## What is playable

- Third-person walking, running, camera rotation and arcade driving with reverse, steering, handbrake, horn, entry and exit.
- A continuous WebGL town based on the La Pobla Tornesa map in `src/data/laPoblaMap.ts`, with the complete road network, building footprints, waterways and land-use areas.
- Reconstructed joined street blocks, individual low-poly façades, irregular tiled roofs, planted orchards, gardens and distinct church, prison, town hall, public hall and covered-passage models. Clear 1280-pixel rendering and natural daylight are the default; a 640-pixel retro mode remains available.
- Five story conversations: Marcos → Castor → Laila → Marina → Marcos. Help the town prepare its festival, receive rewards and continue exploring after the story ends.
- Twenty-five named NPCs: Marcos, Castor, Aitor, Oriol, Piopol, Jesus, Cogollo, Vilero, Laila, Mihai, Borja, Irene, Edu, Paul, Marina, Lucas, Dorin, Susana, Daniel, Nando, Roberto, El Alcalde, Merxe, Juanito and Eva. Everyone has a conversation and a placeholder portrait shown **to the left** of their text.
- Eight collectible cassette tapes, a minimap, a larger map with contact names, objective indicators and nearby interaction prompts. Map guide lines point toward the target; they are not turn-by-turn routing.
- English and Catalan for menus, controls, objectives, dialogue, notifications and settings. Proper names and local street names retain their original spelling.
- An original synthesized soundtrack, **“Última llum”**, plus engine, horn and reward sounds. Audio starts after a user gesture, in line with browser autoplay behavior.
- Local saves for mission stage, tapes, people met, player location, language, graphics and sound settings. Cars return to their initial parking positions after reloading. “Start a new night” resets the adventure while retaining preferences.

This is a complete small playable prototype, not a full GTA-scale production. It has no combat, police pursuit, traffic AI, interiors, multiplayer, controller support, touchscreen driving controls, recorded voices or animated cutscenes. Characters idle and turn toward the player; they do not simulate pedestrian traffic. Vehicles use a conservative circular collision shape and simplified handling. The UI adapts to small screens, but gameplay requires a keyboard.

## Controls

| Action                                      | Key                                       |
| ------------------------------------------- | ----------------------------------------- |
| Walk; accelerate/reverse and steer in a car | WASD or arrow keys                        |
| Sprint on foot                              | Shift                                     |
| Talk to a nearby character / collect a tape | E                                         |
| Continue dialogue                           | Enter, Space, E, or the dialogue button   |
| Enter / leave a nearby car                  | F                                         |
| Handbrake                                   | Space                                     |
| Horn                                        | H                                         |
| Rotate camera                               | Q / R or drag with the right mouse button |
| Open / close town map                       | M                                         |
| Pause / resume                              | Esc                                       |

Follow the gold marker to Marcos first. Get out of the car before speaking to someone. The minimap points toward the current contact when they are off-screen. If you get stuck, use **Pause → Return to Raval**. That keeps completed favours and collectibles.

## Map data and fidelity

The map in `src/data/laPoblaMap.ts` contains **267 road features**, some of which are multipart and produce **270 independent line strings**, **19 building footprints**, **15 areas**, **39 waterways** and **38 points of interest**.

`MapAdapter` projects longitude/latitude into a local X/Z coordinate system, with latitude corrected longitude scaling, north along negative Z, origin `[-0.0012, 40.1017]` and a uniform gameplay scale of `0.7`. Road and landmark relationships are preserved. The ground uses the **ICV MDT Castellón / LiDAR-PNOA 2017** heightmap in `references/topographic-data/derived/icv-2017-heightmap-257.f32`: 257 × 257 samples across the exact map bounds, with elevation converted by `(metres - 299.1851501464844) × 0.7`. At load time, paved road corridors are graded to smooth short elevation bumps, level the surface across the road and sidewalk, and blend the shoulders back into the survey. Intersections share blended heights; unpaved trails and steps retain the survey. The same triangle interpolation drives ground geometry, road and land-use surfaces, walking, vehicle height and slope, scenery placement and camera clearance. Buildings have level roofs and foundations extending to the slope. Terrain is divided into 64 indexed chunks; the boundary extends into fog outside the playable area as an unsurveyed backdrop.

The rebuilt scenery replaces roadside infill with 634 joined building sections derived from manually traced PNOA aerial block envelopes, plus five individually modeled Blender landmarks. Street View guides facade proportions, colors, materials and street details. Road widths, parcel divisions, building heights, hidden facades and vegetation are approximations, not surveyed addresses. Original road line geometry and the 0.7 projection are retained. The overhead imagery and Street View depict the modern town; scenery does not attempt a 1998 reconstruction. See [the scenery authoring guide](scripts/scenery/README.md) and [editable Blender sources](art/scenery/README.md). The terrain survey postdates the 1998 setting. Movement retains arcade handling and X/Z building collision; there is no gravity, jumping or slope-dependent traction. The map depicts **La Pobla Tornesa, Castelló**.

**Map data © OpenStreetMap contributors, ODbL 1.0.** The dataset’s original attribution is preserved and is visible in the game. See [OpenStreetMap copyright](https://www.openstreetmap.org/copyright) and [MAP_DATA.md](MAP_DATA.md) for the source and data license information.

Geographic data and imagery used for scenery work are saved in the reference folders:

- **[satellite-data/](references/satellite-data/README.md):** six satellite and aerial images, including regional views, historical imagery from 1996, the exact game map extent and town-center detail.
- **[street-data/](references/street-data/README.md):** fourteen ground-level photographs from Wikimedia Commons and Wikiloc, covering streets, squares, narrow lanes, building details, a highway underpass and a bridge on the Coll de la Mola route. Named streets and squares include Carrer d’Enmig, Carrer de Baix la Vila, Carrer Tossal de la Vila, Plaça del Raval and Plaça del Portal.
- **[topographic-data/](references/topographic-data/README.md):** official 1 m and 0.5 m LiDAR ground models, source comparisons, heightmaps and game-aligned 3D meshes. The ICV 1 m model is recommended for the base terrain because it removes raised building-like features present in the provisional 0.5 m model.

Each reference guide records sources, capture dates and attribution; the overhead imagery also includes coordinates and georeferencing files. The ICV 257-grid Float32 heightmap (264 KB), its metadata and a resized/softened PNOA land-cover texture are bundled for runtime terrain. A compact derived town layout and five original landmark GLBs are also bundled. The original reference images remain offline; Google screenshots are not runtime assets. **Terrain derived from ICV MDT Castellón / LiDAR-PNOA 2017, CC BY 4.0 scne.es**, cropped, resampled and meshed; source and license links appear on the title screen and full map, with details in [MAP_DATA.md](MAP_DATA.md).

## Code structure

The code uses classes with explicit dependencies rather than one global game script. Static world data, narrative content and asset configuration are separated from behavior.

| Module                        | Responsibility                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| `src/core/Game.ts`            | Composition root, game loop, state transitions, interactions, camera and save checkpoints |
| `src/core/Renderer.ts`        | WebGL scene, lighting, shadows, low-resolution rendering and final screen pass            |
| `src/core/Input.ts`           | Held keys, one-shot presses, mouse camera input and focus cleanup                         |
| `src/world/MapAdapter.ts`     | Geographic projection, road normalization and nearest-road queries                        |
| `src/world/Terrain.ts`        | Bundled elevation data, exact triangle sampling, terrain chunks and draped surfaces       |
| `src/world/WorldBuilder.ts`   | Terrain, roads, reconstructed scenery and spatial mesh batching                           |
| `src/world/CollisionWorld.ts` | Spatially indexed polygon collision and subdivided movement                               |
| `src/entities/`               | Player, NPC and vehicle classes                                                           |
| `src/systems/`                | Dialogue/story progression, localization, defensive saves and audio                       |
| `src/ui/`                     | Menu/HUD/dialogue presentation, map drawing and placeholder portraits                     |
| `src/assets/`                 | Asset loading, model creation, textures and original score definitions                    |
| `src/data/`                   | Source map, bilingual UI text, characters and story content                               |

The rendering and collision representations are separate. Static meshes are merged by texture and spatial region, with per-vertex facade colors, to reduce draw calls while allowing distant blocks to be culled. Fast movement is subdivided so vehicles cannot jump through thin walls. Time steps are capped after delays. Player movement is normalized diagonally. Keyboard state is cleared on focus loss and screen transitions. Dialogue awards a favour only after its last line, and tape rewards are idempotent. Saved data is validated; unavailable storage does not stop the game.

In development, `window.malandrins.inspect()` returns a read-only snapshot of game state and world counts. It is omitted from production builds. Development-only `?reference=01` through `?reference=24` views reproduce saved Street View camera positions and directions for scenery inspection, with estimated eye height and field of view. The normal game retains no teleport or cheat controls.

## Custom art, music and additional languages

See **[ASSETS.md](ASSETS.md)** for the exact import configuration, portrait filenames, model scale/orientation, texture formats, audio replacements and language extension instructions.

The project includes **actual reusable exports** as well as the procedural generators: four GLB models, three 64×64 PNG textures, twenty-five SVG placeholder portraits and a loopable WAV file. No external art or music generation service was required. These are intentionally simple prototype assets; there are no realistic portraits or professionally recorded voice tracks.

## Checks

```sh
npm test          # Geography, collision, localization, story and storage tests
npm run test:e2e  # Browser gameplay checks; starts/reuses the local dev server
npm run build     # Strict TypeScript and production bundle
```

The browser suite uses installed Google Chrome on macOS when available. Otherwise install the test browser with `npx playwright install chromium`, or supply `CHROME_PATH=/path/to/chrome`. Tests use software WebGL for reproducibility and a separate temporary browser profile. They exercise real keyboard movement to Marcos and Castor, vehicle entry/acceleration/braking/exit, bilingual settings, map and portrait UI, story rewards, save/reload, reset, and a narrow viewport. For later story contacts the reward test loads saved-position fixtures; it does not claim to autonomously drive the complete route. Unit tests separately check swept movement against walls and bounds.

Screenshots from verification are in `artifacts/`. To regenerate the two basic visual snapshots while the dev server runs, use `node scripts/inspect.mjs` (this convenience script currently targets macOS Chrome). See [ASSETS.md](ASSETS.md) for asset export commands.
