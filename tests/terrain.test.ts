import { readFileSync } from 'node:fs';
import { describe, expect, it, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { Terrain, type TerrainMetadata } from '../src/world/Terrain';
import { MapAdapter, type Road } from '../src/world/MapAdapter';
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

describe('river, road and path grading', () => {
  const grid: TerrainMetadata = {
    width: 81,
    height: 81,
    game: { min_x: 0, max_x: 160, min_z: 0, max_z: 160, baseline_elevation_m: 0, scale: 1 },
  };
  const road: Road = {
    name: 'Test street',
    type: 'residential',
    width: 6,
    sidewalk: 1,
    surface: 'asphalt',
    points: [
      { x: 20, z: 80 },
      { x: 140, z: 80 },
    ],
  };
  const survey = (height: (x: number, z: number) => number) =>
    buffer(Array.from({ length: 81 * 81 }, (_, i) => height((i % 81) * 2, Math.floor(i / 81) * 2)));

  it('removes short bumps and lateral tilt while preserving the road climb and distant terrain', () => {
    const source = survey((x, z) => 0.12 * x + 0.3 * (z - 80) + 5 * Math.sin((x * Math.PI) / 4));
    const raw = new Terrain(grid, source),
      graded = new Terrain(grid, source, [road]);
    for (let x = 45; x <= 115; x++) {
      expect(graded.heightAt(x, 80)).toBeCloseTo(0.12 * x, 1);
      for (const z of [76, 84])
        expect(graded.heightAt(x, z)).toBeCloseTo(graded.heightAt(x, 80), 5);
    }
    for (let x = 0; x <= 160; x += 2)
      for (const z of [0, 40, 120, 160]) expect(graded.heightAt(x, z)).toBe(raw.heightAt(x, z));
    // Rebuilding from the same bytes must not compound smoothing or mutate the source survey.
    expect(new Terrain(grid, source, [road]).heights).toEqual(graded.heights);
    expect(new Terrain(grid, source).heights).toEqual(raw.heights);
  });

  it('retains a constant uphill grade at both ends and across a narrow diagonal lane', () => {
    const lane = {
      ...road,
      width: 2,
      sidewalk: 0.2,
      points: [
        { x: 20, z: 20 },
        { x: 140, z: 140 },
      ],
    };
    const graded = new Terrain(
      grid,
      survey((x, z) => 0.2 * x + 0.1 * z),
      [lane],
    );
    for (let d = 25; d <= 135; d += 5) {
      expect(graded.heightAt(d, d)).toBeCloseTo(0.3 * d, 5);
      expect(graded.heightAt(d - 0.7, d + 0.7)).toBeCloseTo(0.3 * d, 5);
    }
    const straight = new Terrain(
      grid,
      survey((x) => 0.12 * x),
      [road],
    );
    for (const x of [20, 21, 139, 140]) expect(straight.heightAt(x, 80)).toBeCloseTo(0.12 * x, 5);
  });

  it('blends intersecting streets without depending on their order or producing surface gaps', () => {
    const crossing = {
      ...road,
      points: [
        { x: 80, z: 20 },
        { x: 80, z: 140 },
      ],
    };
    const source = survey((x, z) => 0.12 * x + 0.08 * z + 4 * Math.sin(x / 3));
    const graded = new Terrain(grid, source, [road, crossing]);
    expect(new Terrain(grid, source, [crossing, road]).heights).toEqual(graded.heights);
    const overlay = graded.drapeGeometry(rectangle(80, 80, 30, 30, 0.3), 0.085);
    const positions = overlay.getAttribute('position');
    for (let i = 0; i < positions.count; i += 3) {
      const center = [0, 1, 2]
        .reduce(
          (p, j) => p.add(new THREE.Vector3().fromBufferAttribute(positions, i + j)),
          new THREE.Vector3(),
        )
        .divideScalar(3);
      expect(center.y - graded.heightAt(center.x, center.z)).toBeCloseTo(0.085, 4);
    }
    for (let x = 60; x < 100; x += 0.5)
      expect(Math.abs(graded.heightAt(x + 0.01, 80) - graded.heightAt(x, 80))).toBeLessThan(0.01);
    overlay.dispose();
  });

  it.each(['track', 'path', 'footway', 'cycleway'])(
    'softens unpaved %s bumps and cross slopes while retaining the climb',
    (type) => {
      const trail = { ...road, type, width: 2.7, sidewalk: 0, surface: 'dirt' };
      const source = survey((x, z) => 0.12 * x + 0.3 * (z - 80) + 5 * Math.sin((x * Math.PI) / 4));
      const graded = new Terrain(grid, source, [trail]);
      for (let x = 45; x <= 115; x += 2) {
        expect(graded.heightAt(x, 80)).toBeCloseTo(0.12 * x, 1);
        expect(graded.heightAt(x, 79)).toBeCloseTo(graded.heightAt(x, 81), 5);
      }
      expect(graded.heightAt(80, 40)).toBe(new Terrain(grid, source).heightAt(80, 40));
    },
  );

  it('softens riverbeds and banks without flattening the valley or losing the channel', () => {
    const source = survey(
      (x, z) =>
        0.12 * x +
        0.3 * (z - 80) -
        4 * Math.exp(-(((z - 80) / 8) ** 2)) +
        5 * Math.sin((x * Math.PI) / 4),
    );
    const raw = new Terrain(grid, source),
      graded = new Terrain(grid, source, [], [road.points]);
    for (let x = 45; x <= 115; x += 2) {
      expect(graded.heightAt(x, 80)).toBeCloseTo(0.12 * x - 4, 1);
      expect(graded.heightAt(x, 82) - graded.heightAt(x, 78)).toBeCloseTo(1.2, 5);
      expect(graded.heightAt(x, 80)).toBeLessThan(graded.heightAt(x, 90));
    }
    for (let x = 0; x <= 160; x += 2)
      for (const z of [0, 40, 120, 160]) expect(graded.heightAt(x, z)).toBe(raw.heightAt(x, z));
    expect(new Terrain(grid, source, [], [road.points]).heights).toEqual(graded.heights);
  });

  it('blends road shoulders gradually back into the hillside', () => {
    const source = survey((_x, z) => 0.3 * (z - 80));
    const graded = new Terrain(grid, source, [road]),
      raw = new Terrain(grid, source);
    // The old eight-unit shoulder already returned to raw terrain here.
    expect(graded.heightAt(80, 96)).toBeLessThan(raw.heightAt(80, 96) - 0.5);
    expect(graded.heightAt(80, 106)).toBe(raw.heightAt(80, 106));
    const changes = Array.from(
      { length: 18 },
      (_, i) => graded.heightAt(80, 80 + (i + 1) * 2) - graded.heightAt(80, 80 + i * 2),
    );
    expect(Math.max(...changes)).toBeLessThan(1.3);
  });

  it('eases road grading away from river edges without leaving a sharp ledge', () => {
    const water = [
      [
        { x: 80, z: 20 },
        { x: 80, z: 140 },
      ],
    ];
    const source = survey((_x, z) => 0.3 * (z - 80));
    const river = new Terrain(grid, source, [], water),
      graded = new Terrain(grid, source, [road], water);
    // Just outside the protected channel the road correction starts gently.
    expect(Math.abs(graded.heightAt(86, 84) - river.heightAt(86, 84))).toBeLessThan(0.15);
    expect(Math.abs(graded.heightAt(96, 84) - river.heightAt(96, 84))).toBeGreaterThan(1);
    expect(graded.heightAt(80, 84)).toBe(river.heightAt(80, 84));
  });

  it('keeps steps unchanged and handles repeated or missing corridor points', () => {
    const source = survey((x, z) => Math.sin(x) + z);
    const skipped = ['steps'].map((type) => ({
      ...road,
      type,
    }));
    skipped.push({ ...road, points: [] }, { ...road, points: [road.points[0], road.points[0]] });
    const raw = new Terrain(grid, source);
    expect(
      new Terrain(grid, source, skipped, [[], [road.points[0], road.points[0]]]).heights,
    ).toEqual(raw.heights);
    expect(
      new Terrain(grid, source, [{ ...road, points: [road.points[0], ...road.points] }]).heights,
    ).toEqual(new Terrain(grid, source, [road]).heights);
  });

  it('loads graded survey terrain with smoother roads, consistent bounds and preserved hills', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => source }),
    );
    const map = new MapAdapter(),
      graded = await Terrain.load(map);
    const roughness = (terrain: Terrain, corridors: Pick<Road, 'points' | 'width'>[]) => {
      let bumps = 0,
        tilt = 0;
      for (const road of corridors)
        for (let i = 1; i < road.points.length; i++) {
          const a = road.points[i - 1],
            b = road.points[i];
          const length = Math.hypot(b.x - a.x, b.z - a.z);
          const dx = (b.x - a.x) / length,
            dz = (b.z - a.z) / length;
          for (let d = 4; d < length - 4; d += 3) {
            const x = a.x + dx * d,
              z = a.z + dz * d,
              half = road.width * 0.4;
            bumps += Math.abs(
              terrain.heightAt(x - dx * 2, z - dz * 2) -
                2 * terrain.heightAt(x, z) +
                terrain.heightAt(x + dx * 2, z + dz * 2),
            );
            tilt += Math.abs(
              terrain.heightAt(x - dz * half, z + dx * half) -
                terrain.heightAt(x + dz * half, z - dx * half),
            );
          }
        }
      return { bumps, tilt };
    };
    const trails = ['track', 'path', 'footway', 'cycleway'];
    for (const [name, corridors] of [
      ['roads', map.roads.filter((r) => ![...trails, 'steps'].includes(r.type))],
      ['paths', map.roads.filter((r) => trails.includes(r.type))],
      ['rivers', map.water.map((points) => ({ points, width: 4.5 }))],
    ] as const) {
      const before = roughness(real, corridors),
        after = roughness(graded, corridors);
      expect(after.bumps, name).toBeLessThan(before.bumps * 0.7);
      if (name !== 'rivers') expect(after.tilt, name).toBeLessThan(before.tilt * 0.7);
    }
    expect(graded.maxHeight - graded.minHeight).toBeGreaterThan(175);
    expect(graded.minHeight).toBe(Math.min(...graded.heights));
    expect(graded.maxHeight).toBe(Math.max(...graded.heights));
    // Keep large areas of the survey untouched outside rivers and travel corridors.
    const unchanged = graded.heights.filter((y, i) => y === real.heights[i]).length;
    expect(unchanged).toBeGreaterThan(graded.heights.length * 0.4);
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
