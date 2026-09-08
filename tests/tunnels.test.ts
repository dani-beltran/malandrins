import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { detectTunnels } from '../src/world/TunnelLayout';
import { Terrain, type TerrainMetadata } from '../src/world/Terrain';
import { TravelSurface } from '../src/world/TravelSurface';
import { MapAdapter, type Road } from '../src/world/MapAdapter';
import { bridgePoint } from '../src/world/BridgeLayout';
import { CollisionWorld } from '../src/world/CollisionWorld';
import { Player } from '../src/entities/Player';
import { Vehicle } from '../src/entities/Vehicle';
import { ModelFactory } from '../src/assets/ModelFactory';
import { AssetLibrary } from '../src/assets/AssetLibrary';
import type { Input } from '../src/core/Input';
import { rectangle } from '../src/core/math';
import metadata from '../references/topographic-data/derived/icv-2017-heightmap-257.json';

const path: Road = {
  name: 'Path',
  type: 'track',
  width: 4.4,
  sidewalk: 0,
  surface: 'dirt',
  points: [
    { x: -80, z: 0 },
    { x: 80, z: 0 },
  ],
};
const highway: Road = {
  name: 'Highway',
  type: 'motorway',
  width: 12,
  sidewalk: 0.8,
  surface: 'asphalt',
  points: [
    { x: 0, z: -80 },
    { x: 0, z: 80 },
  ],
};
const grid: TerrainMetadata = {
  width: 41,
  height: 41,
  game: {
    min_x: -100,
    max_x: 100,
    min_z: -100,
    max_z: 100,
    baseline_elevation_m: 0,
    scale: 1,
  },
};
function fixture() {
  const terrain = new Terrain(grid, new Float32Array(41 * 41).buffer);
  const plans = detectTunnels([path, highway]);
  const travel = new TravelSurface(terrain, [], plans);
  const collision = new CollisionWorld({ minX: -100, maxX: 100, minZ: -100, maxZ: 100 });
  travel.underpasses.addCollisions(collision);
  return { terrain, travel, collision, tunnel: travel.underpasses.tunnels[0] };
}
const input = {
  axis: (_n: string[], p: string[]) => (p.includes('KeyW') ? 1 : 0),
  down: () => false,
} as unknown as Input;
const models = new ModelFactory(new AssetLibrary());

describe('highway tunnel detection', () => {
  it('detects crossings, joins split paths and combines dual carriageways', () => {
    expect(detectTunnels([path, highway])).toHaveLength(1);
    const split = [
      { ...path, points: [path.points[0], { x: 0, z: 0 }] },
      { ...path, points: [{ x: 0, z: 0 }, path.points[1]] },
    ];
    const plans = detectTunnels([
      ...split,
      highway,
      { ...highway, points: highway.points.map((p) => ({ x: p.x + 15, z: p.z })) },
    ]);
    expect(plans).toHaveLength(1);
    expect(plans[0].highways).toHaveLength(2);
    expect(plans[0].end - plans[0].start).toBeGreaterThan(30);
    expect(detectTunnels([highway, ...split]).map((t) => t.id)).toEqual(
      detectTunnels([...split, highway]).map((t) => t.id),
    );
  });
  it('leaves parallel paths, ordinary street junctions and highway dead ends alone', () => {
    expect(detectTunnels([path, { ...highway, type: 'residential' }])).toEqual([]);
    expect(
      detectTunnels([
        {
          ...path,
          points: [
            { x: 12, z: -80 },
            { x: 12, z: 80 },
          ],
        },
        highway,
      ]),
    ).toEqual([]);
    expect(detectTunnels([{ ...path, points: [path.points[0], { x: 0, z: 0 }] }, highway])).toEqual(
      [],
    );
  });
  it('keeps both corners of oblique tunnel mouths beyond the highway shoulders', () => {
    const [t] = detectTunnels([
      {
        ...path,
        points: [
          { x: -80, z: -80 },
          { x: 80, z: 80 },
        ],
      },
      highway,
    ]);
    for (const s of [t.start, t.end])
      for (const side of [-t.width / 2, t.width / 2])
        expect(Math.abs(bridgePoint(t, s, side).x)).toBeGreaterThan(8.7);
  });
});

describe('tunnel ground, rendering and movement', () => {
  it('excavates a clear passage while preserving a separate highway deck', () => {
    const { terrain, travel, tunnel } = fixture();
    expect(terrain.heightAt(0, 0)).toBe(0);
    expect(travel.heightAt(0, 0)).toBe(0);
    expect(travel.heightAt(0, 0, tunnel.floorHeight)).toBe(tunnel.floorHeight);
    expect(travel.underpasses.heightAt(0, 0)).toBe(tunnel.floorHeight);
    for (const x of [-50, 50]) expect(travel.heightAt(x, 0)).toBe(0);
    for (const road of [path, highway]) {
      const geo = travel.drapeGeometry(rectangle(0, 0, 2, 2, 0), 0.074, road);
      const positions = geo.getAttribute('position');
      for (let i = 0; i < positions.count; i++)
        expect(positions.getY(i)).toBeCloseTo(0.074 + (road === path ? tunnel.floorHeight : 0), 5);
      geo.dispose();
    }
    const ground = terrain.createGeometry(18, 18, 4, 4, travel.underpasses);
    const positions = ground.getAttribute('position');
    for (let i = 0; i < positions.count; i += 3) {
      const center = new THREE.Vector3();
      for (let j = 0; j < 3; j++)
        center.add(new THREE.Vector3().fromBufferAttribute(positions, i + j));
      center.divideScalar(3);
      expect(center.y).toBeCloseTo(travel.underpasses.heightAt(center.x, center.z), 4);
    }
    ground.dispose();
  });
  it('walks and drives below the highway in both directions without changing levels', () => {
    const { travel, collision, tunnel } = fixture();
    for (const direction of [-1, 1]) {
      const player = new Player(models, { x: -direction * 45, z: 0 }, travel);
      let lowest = Infinity;
      for (let i = 0; i < 740; i++) {
        const previous = player.position.y;
        player.update(1 / 60, input, collision, (-direction * Math.PI) / 2);
        expect(Math.abs(player.position.y - previous)).toBeLessThan(0.06);
        lowest = Math.min(lowest, player.position.y);
      }
      expect(player.position.x * direction).toBeGreaterThan(45);
      expect(lowest).toBeCloseTo(tunnel.floorHeight + 0.12);
      const car = new Vehicle(
        0,
        'Tunnel test',
        models,
        { x: -direction * 45, z: 0 },
        (direction * Math.PI) / 2,
        0xffffff,
        travel,
      );
      lowest = Infinity;
      for (let i = 0; i < 400 && car.position.x * direction < 45; i++) {
        car.update(1 / 60, input, collision);
        lowest = Math.min(lowest, car.position.y);
      }
      expect(car.position.x * direction).toBeGreaterThan(45);
      expect(lowest).toBeCloseTo(tunnel.floorHeight + 0.12);
    }
    const car = new Vehicle(1, 'Highway test', models, { x: 0, z: -20 }, 0, 0xffffff, travel);
    for (let i = 0; i < 240; i++) {
      car.update(1 / 60, input, collision);
      expect(car.position.y).toBeCloseTo(0.12);
    }
    expect(car.position.z).toBeGreaterThan(20);
  });
  it('blocks tunnel walls only on the lower level and preserves the level on exits/restores', () => {
    const { travel, collision, tunnel } = fixture();
    expect(
      collision.blocked({ x: 0, z: tunnel.width / 2, y: tunnel.floorHeight + 0.12 }, 0.3),
    ).toBe(true);
    expect(collision.blocked({ x: 0, z: tunnel.width / 2, y: 0.12 }, 0.3)).toBe(false);
    const player = new Player(models, { x: 0, z: 0 }, travel);
    player.teleport({ x: 0, z: 0, y: tunnel.floorHeight + 0.12 });
    expect(player.position.y).toBeCloseTo(tunnel.floorHeight + 0.12);
    const car = new Vehicle(
      0,
      'Exit test',
      models,
      { x: -45, z: 0 },
      Math.PI / 2,
      0xffffff,
      travel,
    );
    car.position.set(0, tunnel.floorHeight + 0.12, 0);
    const exit = car.exitPosition(collision);
    expect(exit).not.toBeNull();
    player.teleport(exit!);
    expect(player.position.y).toBeCloseTo(tunnel.floorHeight + 0.12);
  });
  it('gives every real-map tunnel open floors and adequate overhead clearance', () => {
    const map = new MapAdapter();
    const bytes = readFileSync('references/topographic-data/derived/icv-2017-heightmap-257.f32');
    const terrain = new Terrain(
      metadata,
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      map.roads,
      map.water,
      map.bridges,
    );
    const travel = new TravelSurface(terrain, map.bridges, map.tunnels);
    expect(map.tunnels.length).toBeGreaterThan(0);
    expect(new Set(map.tunnels.map((t) => t.id)).size).toBe(map.tunnels.length);
    const collision = new CollisionWorld(map.bounds);
    travel.underpasses.addCollisions(collision);
    for (const t of travel.underpasses.tunnels) {
      for (const s of travel.underpasses.sections(t, t.start, t.end)) {
        const p = bridgePoint(t, s);
        expect(travel.underpasses.heightAt(p.x, p.z), t.id).toBeCloseTo(t.floorHeight, 3);
        expect(terrain.heightAt(p.x, p.z) - t.floorHeight, t.id).toBeGreaterThanOrEqual(3.049);
      }
      // Follow every bend and approach in both directions, including overlapping
      // cycleway approaches and the track that joins another road at its exit.
      const points = travel.underpasses.sections(t).map((s) => bridgePoint(t, s));
      for (const route of [points, [...points].reverse()]) {
        const player = new Player(models, route[0], travel);
        player.teleport({
          ...route[0],
          y: travel.underpasses.heightAt(route[0].x, route[0].z) + 0.12,
        });
        for (const target of route.slice(1)) {
          const dx = target.x - player.position.x,
            dz = target.z - player.position.z;
          const length = Math.hypot(dx, dz),
            previous = player.position.y;
          player.update(length / 7.5, input, collision, Math.atan2(-dx, -dz));
          expect(
            Math.hypot(player.position.x - target.x, player.position.z - target.z),
            t.id,
          ).toBeLessThan(0.01);
          expect(Math.abs(player.position.y - previous), t.id).toBeLessThan(1);
        }
      }
    }
  });
});
