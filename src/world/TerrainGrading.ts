import { clamp, closestOnSegment, distance, type Point } from '../core/math';
import { bridgePoint, RIVER_WIDTH, type BridgePlan } from './BridgeLayout';
import type { Road } from './MapAdapter';
import type { Terrain } from './Terrain';

interface ProfilePoint extends Point {
  y: number;
}

interface Corridor {
  points: readonly Point[];
  halfWidth: number;
  shoulder: number;
  sigma: number;
  preserveBanks?: boolean;
}

/** Grade the shared grid before meshes, scenery or entities sample it. */
export function gradeTerrain(
  terrain: Terrain,
  roads: readonly Road[],
  water: readonly Point[][] = [],
  bridges: readonly BridgePlan[] = [],
): void {
  const { width, height, game } = terrain.metadata;
  const { spacingX, spacingZ, heights } = terrain;
  const spacing = Math.max(spacingX, spacingZ);
  const margin = Math.hypot(spacingX, spacingZ);
  const bank = Math.max(12, spacing * 3);
  // Shape the river first so road profiles meet its softened banks. Roads must
  // never average their elevation into the channel beneath a crossing.
  gradeCorridors(
    terrain,
    water.map((points) => ({
      points,
      halfWidth: RIVER_WIDTH / 2,
      shoulder: bank,
      sigma: Math.max(8, spacing * 2),
      preserveBanks: true,
    })),
  );
  const protection = new Float64Array(heights.length);
  const transition = Math.max(8, spacing * 1.5);
  const protect = (a: Point, b: Point, core: number) => {
    const radius = core + transition;
    const c0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - radius - game.min_x) / spacingX));
    const c1 = Math.min(
      width - 1,
      Math.ceil((Math.max(a.x, b.x) + radius - game.min_x) / spacingX),
    );
    const r0 = Math.max(0, Math.floor((Math.min(a.z, b.z) - radius - game.min_z) / spacingZ));
    const r1 = Math.min(
      height - 1,
      Math.ceil((Math.max(a.z, b.z) + radius - game.min_z) / spacingZ),
    );
    for (let row = r0; row <= r1; row++)
      for (let col = c0; col <= c1; col++) {
        const p = { x: game.min_x + col * spacingX, z: game.min_z + row * spacingZ };
        const d = distance(p, closestOnSegment(p, a, b));
        const index = row * width + col;
        protection[index] = Math.max(protection[index], falloff((d - core) / transition));
      }
  };
  // Protect every supporting water/deck vertex, then ease road grading back in
  // outside it. A binary mask would leave a sharp ledge at the protected edge.
  for (const ps of water)
    for (let i = 1; i < ps.length; i++) protect(ps[i - 1], ps[i], RIVER_WIDTH / 2 + margin);
  for (const bridge of bridges) {
    const ds = [
      bridge.start,
      ...bridge.distances.filter((d) => d > bridge.start && d < bridge.end),
      bridge.end,
    ];
    for (let i = 1; i < ds.length; i++)
      protect(
        bridgePoint(bridge, ds[i - 1]),
        bridgePoint(bridge, ds[i]),
        bridge.width / 2 + margin,
      );
  }

  gradeCorridors(
    terrain,
    roads
      .filter((road) => road.type !== 'steps')
      .map((road) => {
        const trail = ['track', 'path', 'footway', 'cycleway'].includes(road.type);
        return {
          points: road.points,
          halfWidth: road.width / 2 + (trail ? 0 : road.sidewalk),
          shoulder: Math.max(trail ? 10 : 18, spacing * (trail ? 2 : 4)),
          sigma: Math.max(trail ? 6 : 10, road.width * 1.5),
        };
      }),
    protection,
  );
}

function gradeCorridors(
  terrain: Terrain,
  corridors: readonly Corridor[],
  protection?: Float64Array,
): void {
  if (!corridors.length) return;
  const { width, height, game } = terrain.metadata;
  const { spacingX, spacingZ, heights } = terrain;
  const targets = new Float64Array(heights.length);
  const weights = new Float64Array(heights.length);
  const influence = new Float64Array(heights.length);
  // Include every vertex supporting the surface, even on sub-cell-width paths.
  const margin = Math.hypot(spacingX, spacingZ);
  for (const corridor of corridors) {
    const profile = smoothProfile(terrain, corridor.points, corridor.sigma);
    const core = corridor.halfWidth + margin;
    const { shoulder } = corridor;
    const radius = core + shoulder;
    // One contribution per corridor prevents densely segmented bends from dominating junctions.
    const nearest = new Map<number, { distance: number; y: number }>();
    for (let i = 1; i < profile.length; i++) {
      const a = profile[i - 1],
        b = profile[i];
      const dx = b.x - a.x,
        dz = b.z - a.z,
        length2 = dx * dx + dz * dz;
      if (length2 < 1e-8) continue;
      const c0 = Math.max(0, Math.ceil((Math.min(a.x, b.x) - radius - game.min_x) / spacingX));
      const c1 = Math.min(
        width - 1,
        Math.floor((Math.max(a.x, b.x) + radius - game.min_x) / spacingX),
      );
      const r0 = Math.max(0, Math.ceil((Math.min(a.z, b.z) - radius - game.min_z) / spacingZ));
      const r1 = Math.min(
        height - 1,
        Math.floor((Math.max(a.z, b.z) + radius - game.min_z) / spacingZ),
      );
      for (let row = r0; row <= r1; row++)
        for (let col = c0; col <= c1; col++) {
          const x = game.min_x + col * spacingX,
            z = game.min_z + row * spacingZ;
          const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / length2, 0, 1);
          const d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
          const index = row * width + col;
          if (d >= radius || d >= (nearest.get(index)?.distance ?? Infinity)) continue;
          let y = a.y + (b.y - a.y) * t;
          // Shift the river's existing cross section with the smoothed profile.
          // Flattening it like a road would widen the bed and lower bridge banks.
          if (corridor.preserveBanks)
            y += heights[index] - terrain.heightAt(a.x + dx * t, a.z + dz * t);
          nearest.set(index, { distance: d, y });
        }
    }
    for (const [index, sample] of nearest) {
      const blend = falloff((sample.distance - core) / shoulder);
      const weight = blend / (1 + (sample.distance / core) ** 2);
      targets[index] += sample.y * weight;
      weights[index] += weight;
      influence[index] = Math.max(influence[index], blend);
    }
  }
  // Each pass samples an unchanged grid; junctions do not depend on feature order.
  for (let i = 0; i < heights.length; i++)
    if (weights[i] > 0)
      heights[i] +=
        (targets[i] / weights[i] - heights[i]) * influence[i] * (1 - (protection?.[i] ?? 0));
}

function falloff(t: number): number {
  t = clamp(t, 0, 1);
  return 1 - t * t * (3 - 2 * t);
}

function smoothProfile(terrain: Terrain, line: readonly Point[], sigma: number): ProfilePoint[] {
  const points = line.filter((p, i) => i === 0 || distance(p, line[i - 1]) > 1e-4);
  if (points.length < 2) return [];
  const distances = [0];
  for (let i = 1; i < points.length; i++)
    distances.push(distances[i - 1] + distance(points[i - 1], points[i]));
  const length = distances[distances.length - 1];
  const count = Math.ceil(length / Math.min(3, terrain.spacingX / 2, terrain.spacingZ / 2));
  const step = length / count;
  const samples: ProfilePoint[] = [];
  let segment = 1;
  for (let i = 0; i <= count; i++) {
    const d = i * step;
    while (segment < points.length - 1 && distances[segment] < d) segment++;
    const a = points[segment - 1],
      b = points[segment];
    const t = clamp(
      (d - distances[segment - 1]) / (distances[segment] - distances[segment - 1]),
      0,
      1,
    );
    const x = a.x + (b.x - a.x) * t,
      z = a.z + (b.z - a.z) * t;
    samples.push({ x, z, y: terrain.heightAt(x, z) });
  }
  const window = Math.ceil((sigma * 3) / step);
  return samples.map((p, i) => {
    let w = 0,
      x = 0,
      xx = 0,
      y = 0,
      xy = 0;
    for (let j = Math.max(0, i - window); j <= Math.min(count, i + window); j++) {
      const d = (j - i) * step;
      const weight = Math.exp(-0.5 * (d / sigma) ** 2);
      w += weight;
      x += weight * d;
      xx += weight * d * d;
      y += weight * samples[j].y;
      xy += weight * d * samples[j].y;
    }
    // A local line fit smooths bumps without flattening the grade at road endpoints.
    const determinant = w * xx - x * x;
    return { ...p, y: determinant > 1e-10 ? (y * xx - x * xy) / determinant : y / w };
  });
}
