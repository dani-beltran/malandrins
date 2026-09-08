import { clamp, closestOnSegment, distance, type Point } from '../core/math';
import { bridgePoint, RIVER_WIDTH, type BridgePlan } from './BridgeLayout';
import type { Road } from './MapAdapter';
import type { Terrain } from './Terrain';

interface ProfilePoint extends Point {
  y: number;
}

/** Grade the shared height grid once, before meshes, scenery or entities sample it. */
export function gradeRoads(
  terrain: Terrain,
  roads: readonly Road[],
  water: readonly Point[][] = [],
  bridges: readonly BridgePlan[] = [],
): void {
  const { width, height, game } = terrain.metadata;
  const { spacingX, spacingZ, heights } = terrain;
  const targets = new Float64Array(heights.length);
  const weights = new Float64Array(heights.length);
  const influence = new Float64Array(heights.length);
  // Include the vertices supporting pavement triangles, even on sub-cell-width lanes.
  const margin = Math.hypot(spacingX, spacingZ);
  const shoulder = Math.max(8, Math.max(spacingX, spacingZ) * 2);
  const protectedVertices = new Uint8Array(heights.length);
  const protect = (a: Point, b: Point, radius: number) => {
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
        if (distance(p, closestOnSegment(p, a, b)) <= radius)
          protectedVertices[row * width + col] = 1;
      }
  };
  // Protect every vertex of triangles supporting water, including grading shoulders
  // from adjacent roads. Merely skipping the crossing's centre would still fill it.
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

  for (const road of roads) {
    const trail = ['track', 'path', 'footway', 'cycleway'].includes(road.type);
    if (road.type === 'steps' || (trail && road.surface !== 'paving')) continue;
    const profile = smoothProfile(terrain, road);
    const core = road.width / 2 + (trail ? 0 : road.sidewalk) + margin;
    const radius = core + shoulder;
    // One contribution per road prevents densely segmented bends from dominating junctions.
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
          nearest.set(index, { distance: d, y: a.y + (b.y - a.y) * t });
        }
    }
    for (const [index, sample] of nearest) {
      const t = clamp((sample.distance - core) / shoulder, 0, 1);
      const blend = 1 - t * t * (3 - 2 * t);
      const weight = blend / (1 + (sample.distance / core) ** 2);
      targets[index] += sample.y * weight;
      weights[index] += weight;
      influence[index] = Math.max(influence[index], blend);
    }
  }
  // All profiles sample the untouched survey. Intersections blend independently of road order.
  for (let i = 0; i < heights.length; i++)
    if (!protectedVertices[i] && weights[i] > 0)
      heights[i] += (targets[i] / weights[i] - heights[i]) * influence[i];
}

function smoothProfile(terrain: Terrain, road: Road): ProfilePoint[] {
  const points = road.points.filter((p, i) => i === 0 || distance(p, road.points[i - 1]) > 1e-4);
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
  const sigma = Math.max(6, road.width);
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
