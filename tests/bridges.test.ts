import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { detectBridges, bridgePoint, locateOnBridge, RIVER_WIDTH } from '../src/world/BridgeLayout';
import { TravelSurface } from '../src/world/TravelSurface';
import { Terrain, type TerrainMetadata } from '../src/world/Terrain';
import { MapAdapter, type Road } from '../src/world/MapAdapter';
import { CollisionWorld } from '../src/world/CollisionWorld';
import { BridgeScenery } from '../src/world/BridgeScenery';
import { ModelFactory } from '../src/assets/ModelFactory';
import { AssetLibrary } from '../src/assets/AssetLibrary';
import { Vehicle } from '../src/entities/Vehicle';
import { Player } from '../src/entities/Player';
import type { Input } from '../src/core/Input';
import { rectangle } from '../src/core/math';
import metadata from '../references/topographic-data/derived/icv-2017-heightmap-257.json';

const road: Road = {
  name: 'Bridge lane',
  type: 'residential',
  width: 6,
  sidewalk: 0.7,
  surface: 'asphalt',
  points: [
    { x: -80, z: 0 },
    { x: 80, z: 0 },
  ],
};
const water = [
  [
    { x: 0, z: -70 },
    { x: 0, z: 70 },
  ],
];
const grid: TerrainMetadata = {
  width: 101,
  height: 101,
  game: { min_x: -100, max_x: 100, min_z: -100, max_z: 100, baseline_elevation_m: 0, scale: 1 },
};
const survey = (height = (_x: number, _z: number) => 0) =>
  Float32Array.from({ length: 101 * 101 }, (_, i) =>
    height(-100 + (i % 101) * 2, -100 + Math.floor(i / 101) * 2),
  ).buffer;
function fixture(source = survey()) {
  const plans = detectBridges([road], water);
  const terrain = new Terrain(grid, source, [road], water, plans);
  const travel = new TravelSurface(terrain, plans);
  return { plans, terrain, travel };
}

describe('bridge detection and preserved river terrain', () => {
  it('covers both banks and lengthens the deck for an oblique full-width crossing', () => {
    const [straight] = detectBridges([road], water);
    expect(straight.end - straight.start).toBeCloseTo(RIVER_WIDTH + 4);
    const [diagonal] = detectBridges(
      [
        {
          ...road,
          points: [
            { x: -80, z: -80 },
            { x: 80, z: 80 },
          ],
        },
      ],
      water,
    );
    expect(diagonal.end - diagonal.start).toBeGreaterThan((straight.end - straight.start) * 1.7);
    for (const s of [diagonal.start, diagonal.end])
      for (const side of [-diagonal.width / 2, diagonal.width / 2])
        expect(Math.abs(bridgePoint(diagonal, s, side).x)).toBeGreaterThan(RIVER_WIDTH / 2 + 1.9);
  });
  it('deduplicates shared road/river endpoints and rejects nearby parallel roads', () => {
    const split = [
      { ...road, points: [road.points[0], { x: 0, z: 0 }] },
      { ...road, points: [{ x: 0, z: 0 }, road.points[1]] },
    ];
    const splitWater = [
      [water[0][0], { x: 0, z: 0 }],
      [{ x: 0, z: 0 }, water[0][1]],
    ];
    expect(detectBridges(split, splitWater)).toHaveLength(1);
    expect(
      detectBridges(
        [
          {
            ...road,
            points: [
              { x: 4, z: -80 },
              { x: 4, z: 80 },
            ],
          },
        ],
        water,
      ),
    ).toHaveLength(0);
    expect(
      detectBridges([{ ...road, points: [road.points[0], road.points[0], road.points[1]] }], water),
    ).toHaveLength(1);
    expect(detectBridges([{ ...road, points: [] }], water)).toHaveLength(0);
  });
  it('follows an existing junction connection when a crossing lane ends at another road', () => {
    const lane = {
      ...road,
      points: [
        { x: -60, z: 0 },
        { x: 0, z: 0 },
      ],
    };
    const continuation = {
      ...road,
      name: 'Wider road',
      width: 8,
      points: [
        { x: 0, z: 0 },
        { x: 60, z: 15 },
      ],
    };
    const plans = detectBridges([lane, continuation], water);
    for (const plan of plans) {
      expect(plan.start).toBeGreaterThan(15);
      expect(plan.distances.at(-1)! - plan.end).toBeGreaterThan(15);
    }
  });
  it('protects softened water channels from all nearby grading shoulders', () => {
    const source = survey(
      (x, z) => 0.05 * z + 5 * Math.sin(x / 5) + 3 * Math.sin((z * Math.PI) / 4),
    );
    const { terrain } = fixture(source),
      river = new Terrain(grid, source, [], water);
    expect(river.heightAt(0, 2)).not.toBeCloseTo(new Terrain(grid, source).heightAt(0, 2), 1);
    for (let z = -50; z < 50; z += 0.7)
      for (const x of [-2.25, 0, 2.25])
        expect(terrain.heightAt(x, z)).toBeCloseTo(river.heightAt(x, z), 6);
    expect(terrain.heightAt(-40, 0)).not.toBeCloseTo(river.heightAt(-40, 0), 1);
  });
});

describe('shared bridge travel surface', () => {
  it('keeps flat roads and banks at their original height, without bridge approach humps', () => {
    const { terrain, travel } = fixture(),
      bridge = travel.bridges[0];
    expect(bridge.deckHeight).toBe(0);
    expect(bridge.masonryDepth).toBeCloseTo(0.25);
    const geometry = travel.drapeGeometry(rectangle(0, 0, 6, 100, Math.PI / 2), 0.085);
    const p = geometry.getAttribute('position');
    for (let i = 0; i < p.count; i += 3) {
      const centre = new THREE.Vector3();
      for (let j = 0; j < 3; j++) centre.add(new THREE.Vector3().fromBufferAttribute(p, i + j));
      centre.divideScalar(3);
      expect(centre.y - travel.heightAt(centre.x, centre.z)).toBeCloseTo(0.085, 4);
    }
    for (let x = -45; x <= 45; x += 0.25)
      expect(travel.heightAt(x, 0)).toBe(terrain.heightAt(x, 0));
    expect(travel.heightAt(-90, 0)).toBe(terrain.heightAt(-90, 0));
    expect(travel.heightAt(0, 5)).toBe(terrain.heightAt(0, 5));
    geometry.dispose();
  });
  it('fills a depressed channel between unequal banks without raising either approach', () => {
    const { terrain, travel } = fixture(
      survey((x, z) => 1 + x * 0.04 + z * 0.01 - Math.max(0, 1 - Math.abs(x) / 4) * 0.8),
    );
    const bridge = travel.bridges[0];
    expect(bridge.startHeight).toBeLessThan(bridge.endHeight);
    expect(travel.heightAt(0, 0)).toBeCloseTo(1);
    expect(travel.heightAt(0, 0) - terrain.heightAt(0, 0)).toBeGreaterThan(0.7);
    for (const s of travel.sections(bridge, bridge.approachStart, bridge.approachEnd, 0.1))
      for (const side of [-bridge.width / 2, 0, bridge.width / 2]) {
        const p = bridgePoint(bridge, s),
          edge = bridgePoint(bridge, s, side);
        if (s <= bridge.start || s >= bridge.end)
          expect(travel.heightAt(edge.x, edge.z)).toBeCloseTo(terrain.heightAt(edge.x, edge.z), 6);
        else expect(travel.heightAt(p.x, p.z)).toBeLessThanOrEqual(bridge.maxRoadHeight + 1e-6);
      }
    // The drawn triangles still agree with feet/wheels on a non-flat fitted deck.
    const geometry = travel.drapeGeometry(rectangle(0, 0, 6, 30, Math.PI / 2), 0.085);
    const positions = geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i += 3) {
      const center = new THREE.Vector3();
      for (let j = 0; j < 3; j++)
        center.add(new THREE.Vector3().fromBufferAttribute(positions, i + j));
      center.divideScalar(3);
      expect(center.y - travel.heightAt(center.x, center.z)).toBeCloseTo(0.085, 4);
    }
    geometry.dispose();
  });
  it.each([
    { name: 'flat roads', height: (_x: number) => 0 },
    {
      name: 'unequal banks',
      height: (x: number) => 1 + x * 0.04 - Math.max(0, 1 - Math.abs(x) / 4) * 0.8,
    },
  ])('walks and drives both ways on $name, blocks edges, and checks exits', ({ height }) => {
    const { travel } = fixture(survey(height));
    const assets = new AssetLibrary();
    vi.spyOn(assets, 'customModel').mockImplementation((key) =>
      key.startsWith('bridge-') ? new THREE.Group() : undefined,
    );
    const models = new ModelFactory(assets),
      collision = new CollisionWorld({ minX: -100, maxX: 100, minZ: -100, maxZ: 100 });
    new BridgeScenery(travel, models, collision, { roads: [road] } as MapAdapter).build();
    expect(collision.blocked({ x: 0, z: 0 }, 1.54)).toBe(false);
    expect(collision.blocked({ x: 0, z: 3.5 }, 0.3)).toBe(true);
    expect(travel.canExit({ x: 0, z: 0 }, { x: 0, z: 6 }, 0.4)).toBe(false);
    const input = {
      axis: (_negative: string[], positive: string[]) => (positive.includes('KeyW') ? 1 : 0),
      down: () => false,
    } as unknown as Input;
    for (const direction of [-1, 1]) {
      const player = new Player(models, { x: -direction * 40, z: 0 }, travel);
      for (let i = 0; i < 660; i++)
        player.update(1 / 60, input, collision, (-direction * Math.PI) / 2);
      expect(player.position.x * direction).toBeGreaterThan(40);
      player.teleport({ x: 0, z: 0 });
      expect(player.position.y).toBeCloseTo(travel.heightAt(0, 0) + 0.12);
      const car = new Vehicle(
        0,
        'Bridge test',
        models,
        { x: -direction * 40, z: 0 },
        (direction * Math.PI) / 2,
        0xaaaaaa,
        travel,
      );
      for (let i = 0; i < 300 && car.position.x * direction < 40; i++) {
        car.update(1 / 60, input, collision);
        expect(car.position.y).toBeGreaterThanOrEqual(
          travel.heightAt(car.position.x, car.position.z) + 0.119,
        );
        expect(Math.abs(car.object.rotation.x)).toBeLessThan(0.3);
      }
      expect(car.position.x * direction).toBeGreaterThan(40);
      car.position.set(0, travel.heightAt(0, 0) + 0.12, 0);
      const exit = car.exitPosition(collision);
      expect(exit).not.toBeNull();
      expect(travel.canExit(car.position, exit!, 0.455)).toBe(true);
    }
  });
  it('builds all real-map crossings without lifting road approaches', { timeout: 20000 }, () => {
    const map = new MapAdapter(),
      bytes = readFileSync('references/topographic-data/derived/icv-2017-heightmap-257.f32');
    const terrain = new Terrain(
      metadata,
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      map.roads,
      map.water,
      map.bridges,
    );
    const travel = new TravelSurface(terrain, map.bridges);
    const assets = new AssetLibrary();
    vi.spyOn(assets, 'customModel').mockImplementation(() => new THREE.Group());
    const collision = new CollisionWorld(map.bounds);
    new BridgeScenery(travel, new ModelFactory(assets), collision, map).build();
    expect(travel.bridges.length).toBeGreaterThan(40);
    expect(new Set(travel.bridges.map((b) => b.id)).size).toBe(travel.bridges.length);
    for (const b of travel.bridges) {
      expect(b.deckHeight, b.id).toBeTypeOf('number');
      expect(Number.isFinite(b.deckHeight), b.id).toBe(true);
      expect(b.start - b.approachStart, b.id).toBeGreaterThan(8);
      expect(b.approachEnd - b.end, b.id).toBeGreaterThan(8);
      // Check each fit in isolation as overlapping decks may legitimately fill
      // the channel inside another crossing's approach.
      const isolated = new TravelSurface(terrain, [b]);
      for (const s of travel.sections(b, b.approachStart, b.approachEnd, 1)) {
        const p = bridgePoint(b, s);
        if (s <= b.start || s >= b.end)
          for (const side of [-b.width / 2, 0, b.width / 2]) {
            const edge = bridgePoint(b, s, side);
            // A sharp bend can bring an approach alongside the actual deck.
            const q = locateOnBridge(b, edge);
            if (q.along > b.start && q.along < b.end) continue;
            expect(isolated.heightAt(edge.x, edge.z), b.id).toBeCloseTo(
              terrain.heightAt(edge.x, edge.z),
              5,
            );
          }
        if (
          p.x < map.bounds.minX + 2 ||
          p.x > map.bounds.maxX - 2 ||
          p.z < map.bounds.minZ + 2 ||
          p.z > map.bounds.maxZ - 2
        )
          continue;
        expect(collision.blocked(p, 0.336), `${b.id} walking at ${s}`).toBe(false);
        if (b.road.width >= 4.4)
          expect(collision.blocked(p, 1.54), `${b.id} driving at ${s}`).toBe(false);
      }
    }
  });
});

describe('Blender bridge assets', () => {
  it('ships editable sources and compact GLBs, with actual open arch tunnels', async () => {
    for (const length of [8, 16, 32, 64, 128]) {
      expect(readFileSync(`art/scenery/bridge-stone-${length}.blend`).length).toBeGreaterThan(1000);
      const bytes = readFileSync(`public/assets/scenery/bridge-stone-${length}.glb`);
      expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
      expect(bytes.readUInt32LE(8)).toBe(bytes.byteLength);
      expect(bytes.byteLength).toBeLessThan(1_500_000);
      if (length !== 8) continue;
      const model = await new GLTFLoader().parseAsync(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
        '',
      );
      model.scene.updateMatrixWorld(true);
      const ray = new THREE.Raycaster(
        new THREE.Vector3(-10, -2, 0),
        new THREE.Vector3(1, 0, 0),
        0,
        20,
      );
      expect(ray.intersectObject(model.scene, true)).toHaveLength(0);
      ray.set(new THREE.Vector3(0, 5, 0), new THREE.Vector3(0, -1, 0));
      expect(ray.intersectObject(model.scene, true)[0].point.y).toBeCloseTo(0);

      const { travel } = fixture();
      const assets = new AssetLibrary();
      vi.spyOn(assets, 'customModel').mockReturnValue(model.scene);
      const scenery = new BridgeScenery(
        travel,
        new ModelFactory(assets),
        new CollisionWorld({ minX: -100, maxX: 100, minZ: -100, maxZ: 100 }),
        { roads: [road] } as MapAdapter,
      ).build();
      const masonry = new THREE.Group();
      for (const mesh of [...scenery.children])
        if (mesh.name.endsWith(':masonry')) {
          expect(mesh.userData.verticalScale).toBeGreaterThan(0);
          expect(mesh.userData.verticalScale).toBeLessThan(1);
          masonry.add(mesh);
        }
      const fittedBounds = new THREE.Box3().setFromObject(masonry);
      expect(fittedBounds.min.y).toBeCloseTo(-0.25, 5);
      expect(fittedBounds.max.y).toBeCloseTo(0, 5);
      // Fitting leaves the original Blender asset and normal-height railings intact.
      expect(new THREE.Box3().setFromObject(model.scene).min.y).toBeLessThan(-8);
      expect(new THREE.Box3().setFromObject(scenery).max.y).toBeGreaterThan(1);
    }
  });
});
