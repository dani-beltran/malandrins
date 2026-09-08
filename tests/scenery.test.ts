import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  sceneryLayout as layout,
  layoutPoints,
  landmarkFootprints,
} from '../src/world/SceneryLayout';
import { MapAdapter } from '../src/world/MapAdapter';
import { CollisionWorld } from '../src/world/CollisionWorld';
import { distance } from '../src/core/math';

const map = new MapAdapter(),
  collision = new CollisionWorld(map.bounds);
for (const b of layout.buildings) collision.add(layoutPoints(b.points));
for (const b of layout.landmarks) for (const ps of landmarkFootprints(b)) collision.add(ps);

describe('reconstructed town geometry', () => {
  it('keeps all recorded Street View camera locations outside buildings', () => {
    for (const c of layout.cameras)
      expect(collision.blocked({ x: c.position[0], z: c.position[1] }, 0.5), `camera ${c.id}`).toBe(
        false,
      );
  });
  it('keeps the referenced street centerlines walkable', () => {
    const names = new Set([
      "carrer d'Enmig",
      'Carrer de Baix la Vila',
      'Carrer de Baix les Cases',
      'Carrer Tossal de la Vila',
      'Carrer de les Eres',
      'Carrer de Benicàssim',
    ]);
    for (const road of map.roads.filter((r) => names.has(r.name)))
      for (let i = 1; i < road.points.length; i++) {
        const a = road.points[i - 1],
          b = road.points[i],
          length = distance(a, b);
        for (let d = 0; d < length; d += 0.8) {
          const p = { x: a.x + ((b.x - a.x) * d) / length, z: a.z + ((b.z - a.z) * d) / length };
          expect(collision.blocked(p, 0.5), `${road.name} at ${p.x},${p.z}`).toBe(false);
        }
      }
  });
  it('leaves the entire Barreretes passage open underneath the rooms', () => {
    const b = layout.landmarks.find((b) => b.id === 'passage')!;
    for (let d = -1; d < b.depth + 1; d += 0.2) {
      const p = {
        x: b.position[0] - Math.sin(b.rotation) * d,
        z: b.position[1] - Math.cos(b.rotation) * d,
      };
      expect(collision.blocked(p, 0.5), `passage depth ${d}`).toBe(false);
    }
    for (const ps of landmarkFootprints(b)) expect(collision.blocked(ps[0], 0.1)).toBe(true);
  });
  it('has finite polygons, valid facade edges, and unique persistent building IDs', () => {
    expect(new Set(layout.buildings.map((b) => b.id)).size).toBe(layout.buildings.length);
    for (const b of layout.buildings) {
      expect(b.points.length).toBeGreaterThanOrEqual(3);
      expect(b.points.flat().every(Number.isFinite)).toBe(true);
      expect(new Set(b.points.map((p) => p.join(','))).size, b.id).toBe(b.points.length);
      expect(b.facadeEdges.every((i) => i >= 0 && i < b.points.length)).toBe(true);
      expect(b.height).toBeGreaterThan(2);
    }
  });
  it('ships all five Blender models as valid, bounded low-poly GLBs', () => {
    for (const b of layout.landmarks) {
      const bytes = readFileSync(`public/assets/scenery/${b.id}.glb`);
      expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
      expect(bytes.readUInt32LE(8)).toBe(bytes.byteLength);
      const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
      const triangles = json.meshes
        .flatMap((m: { primitives: { indices: number }[] }) => m.primitives)
        .reduce(
          (sum: number, p: { indices: number }) => sum + json.accessors[p.indices].count / 3,
          0,
        );
      expect(triangles).toBeGreaterThan(100);
      expect(triangles).toBeLessThan(12000);
      expect(bytes.byteLength).toBeLessThan(1_500_000);
    }
  });
});
