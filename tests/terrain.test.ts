import { readFileSync } from 'node:fs';
import { describe, expect, it, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { Terrain, type TerrainMetadata } from '../src/world/Terrain';
import { MapAdapter } from '../src/world/MapAdapter';
import { CollisionWorld } from '../src/world/CollisionWorld';
import { rectangle } from '../src/core/math';
import { Player } from '../src/entities/Player';
import { Npc } from '../src/entities/Npc';
import { Vehicle } from '../src/entities/Vehicle';
import { characters } from '../src/data/characters';
import type { ModelFactory } from '../src/assets/ModelFactory';
import type { Input } from '../src/core/Input';
import metadata from '../references/topographic-data/derived/icv-2017-heightmap-257.json';

function buffer(values: number[]): ArrayBuffer {
  const result = new ArrayBuffer(values.length * 4),
    view = new DataView(result);
  values.forEach((value, i) => view.setFloat32(i * 4, value, true));
  return result;
}
const small: TerrainMetadata = {
  width: 2,
  height: 2,
  game: { min_x: 0, max_x: 10, min_z: 0, max_z: 10, baseline_elevation_m: 100, scale: 0.7 },
};
const bytes = readFileSync(
  new URL('../references/topographic-data/derived/icv-2017-heightmap-257.f32', import.meta.url),
);
const source = bytes.buffer.slice(
  bytes.byteOffset,
  bytes.byteOffset + bytes.byteLength,
) as ArrayBuffer;
const real = new Terrain(metadata, source);
afterEach(() => vi.unstubAllGlobals());

describe('survey terrain and surface geometry', () => {
  it('decodes little-endian metres once, preserving north/south and exact boundary vertices', () => {
    const terrain = new Terrain(small, buffer([100, 110, 120, 140]));
    expect([
      terrain.heightAt(0, 0),
      terrain.heightAt(10, 0),
      terrain.heightAt(0, 10),
      terrain.heightAt(10, 10),
    ]).toEqual([0, 7, 14, 28]);
    expect(terrain.heightAt(-50, 30)).toBe(14);
    expect(terrain.heightAt(20, -20)).toBe(7);
    // These saddle-cell values differ from bilinear interpolation.
    expect(terrain.heightAt(2.5, 2.5)).toBeCloseTo(5.25);
    expect(terrain.heightAt(7.5, 7.5)).toBeCloseTo(19.25);
    expect(terrain.heightAt(5, 5)).toBeCloseTo(10.5);
  });

  it('matches real survey extents, relief and every mesh sample without double scaling', () => {
    const map = new MapAdapter(),
      geometry = real.createGeometry();
    const positions = geometry.getAttribute('position');
    expect(positions.count).toBe(66049);
    expect(geometry.index!.count / 3).toBe(131072);
    expect(positions.getX(0)).toBeCloseTo(map.bounds.minX, 3);
    expect(positions.getZ(0)).toBeCloseTo(map.bounds.minZ, 3);
    expect(positions.getX(66048)).toBeCloseTo(map.bounds.maxX, 3);
    expect(positions.getZ(66048)).toBeCloseTo(map.bounds.maxZ, 3);
    expect(real.minHeight).toBeCloseTo(
      (metadata.min_elevation_m - metadata.game.baseline_elevation_m) * 0.7,
      4,
    );
    expect(real.maxHeight - real.minHeight).toBeGreaterThan(175);
    for (let i = 0; i < positions.count; i++) expect(positions.getY(i)).toBe(real.heights[i]);
    const index = geometry.index!;
    for (let i = 0; i < index.count; i += 789) {
      const vertices = [0, 1, 2].map((j) =>
        new THREE.Vector3().fromBufferAttribute(positions, index.getX(i + j)),
      );
      const center = vertices.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(3);
      expect(real.heightAt(center.x, center.z)).toBeCloseTo(center.y, 3);
    }
    geometry.dispose();
  });

  it('drapes complete polygons over ridges without bridging triangles or losing area', () => {
    const terrain = new Terrain(
      { ...small, width: 3, height: 3 },
      buffer([100, 100, 100, 100, 150, 100, 100, 100, 100]),
    );
    const footprint = rectangle(5, 5, 8, 8, 0.2);
    const geometry = terrain.drapeGeometry(footprint, 0.085);
    const positions = geometry.getAttribute('position');
    let area = 0;
    for (let i = 0; i < positions.count; i += 3) {
      const [a, b, c] = [0, 1, 2].map((j) =>
        new THREE.Vector3().fromBufferAttribute(positions, i + j),
      );
      const normal = b.clone().sub(a).cross(c.clone().sub(a));
      expect(normal.y).toBeGreaterThan(0);
      area += normal.y / 2;
      for (const p of [a, b, c, a.clone().add(b).add(c).divideScalar(3)])
        expect(p.y - terrain.heightAt(p.x, p.z)).toBeCloseTo(0.085, 4);
    }
    expect(area).toBeCloseTo(64, 4);
    expect(terrain.footprintRange(footprint).max).toBeCloseTo(35);
    geometry.dispose();
  });

  it('keeps chunk borders continuous and clips overlays at the survey boundary', () => {
    const left = real.createGeometry(0, 0, 32, 32),
      right = real.createGeometry(32, 0, 32, 32);
    for (let row = 0; row <= 32; row++) {
      const a = new THREE.Vector3().fromBufferAttribute(
        left.getAttribute('position'),
        row * 33 + 32,
      );
      const b = new THREE.Vector3().fromBufferAttribute(right.getAttribute('position'), row * 33);
      expect(a.toArray()).toEqual(b.toArray());
    }
    const terrain = new Terrain(small, buffer([100, 110, 120, 140]));
    const overlay = terrain.drapeGeometry(rectangle(0, 0, 10, 10, 0));
    overlay.computeBoundingBox();
    expect(overlay.boundingBox!.min.x).toBe(0);
    expect(overlay.boundingBox!.min.z).toBe(0);
    expect(overlay.boundingBox!.max.x).toBe(5);
    left.dispose();
    right.dispose();
    overlay.dispose();
  });

  it('rejects missing, truncated, non-finite or misaligned terrain rather than silently flattening it', async () => {
    expect(() => new Terrain(small, new ArrayBuffer(4))).toThrow('byte length');
    expect(() => new Terrain(small, buffer([100, NaN, 100, 100]))).toThrow('elevation');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(Terrain.load(new MapAdapter())).rejects.toThrow('404');
    const map = new MapAdapter();
    map.bounds.maxX += 1;
    await expect(Terrain.load(map)).rejects.toThrow('projection');
  });
});

describe('terrain-aware entities', () => {
  const terrain = new Terrain(
    { ...small, game: { ...small.game, max_x: 100, max_z: 100 } },
    buffer([100, 120, 130, 150]),
  );
  const factory = {
    person: () => ({ group: new THREE.Group(), limbs: [] }),
    car: () => new THREE.Group(),
  } as unknown as ModelFactory;
  const collision = new CollisionWorld({ minX: 0, maxX: 100, minZ: 0, maxZ: 100 });
  const input = {
    axis: (_negative: string[], positive: string[]) => (positive.includes('KeyW') ? 1 : 0),
    down: () => false,
  } as unknown as Input;

  it('reprojects restored positions, walking and car exits onto the terrain', () => {
    const player = new Player(factory, { x: 30, z: 40 }, terrain);
    const startHeight = player.position.y;
    player.update(0.5, input, collision, 0);
    expect(player.position.y).toBeLessThan(startHeight);
    expect(player.position.y).toBeCloseTo(
      terrain.heightAt(player.position.x, player.position.z) + 0.12,
    );
    const car = new Vehicle(0, 'test', factory, { x: 60, z: 60 }, 0.8, 0xffffff, terrain);
    player.teleport(car.exitPosition(collision)!);
    expect(player.position.y).toBeCloseTo(
      terrain.heightAt(player.position.x, player.position.z) + 0.12,
    );
  });

  it('keeps NPC idle animation relative to the sampled ground', () => {
    const npc = new Npc(characters[0], factory, { x: 30, z: 40 }, terrain);
    npc.update(5, new THREE.Vector3());
    expect(npc.position.y - terrain.heightAt(30, 40)).toBeGreaterThan(0.1);
    expect(npc.position.y - terrain.heightAt(30, 40)).toBeLessThan(0.14);
  });

  it('pitches and rolls vehicles on slopes during driving and after reset', () => {
    const car = new Vehicle(0, 'test', factory, { x: 40, z: 40 }, 0, 0xffffff, terrain);
    const initial = car.position.clone(),
      orientation = car.object.quaternion.clone();
    expect(car.object.rotation.x).toBeLessThan(0);
    expect(car.object.rotation.z).toBeGreaterThan(0);
    car.update(0.5, input, collision);
    expect(car.position.z).toBeGreaterThan(initial.z);
    expect(car.position.y).toBeGreaterThan(initial.y);
    expect(car.position.y).toBeCloseTo(terrain.heightAt(car.position.x, car.position.z) + 0.12);
    car.reset();
    expect(car.position.toArray()).toEqual(initial.toArray());
    expect(car.object.quaternion.toArray()).toEqual(orientation.toArray());
  });
});
