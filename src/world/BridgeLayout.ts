import { clamp, closestOnSegment, distance, type Point } from '../core/math';
import type { Road } from './MapAdapter';

export const RIVER_WIDTH = 4.5;
export const WATER_OFFSET = 0.025;
const BANK_MARGIN = 2;

export interface BridgePlan {
  id: string;
  road: Road;
  distances: number[];
  start: number;
  end: number;
  width: number;
}

export function roadDeckWidth(road: Road): number {
  return (
    road.width +
    (['track', 'path', 'footway', 'steps', 'cycleway'].includes(road.type) ? 0 : road.sidewalk * 2)
  );
}

export function pathDistances(points: Point[]): number[] {
  const ds = [0];
  for (let i = 1; i < points.length; i++) ds.push(ds[i - 1] + distance(points[i - 1], points[i]));
  return ds;
}

/** Mitered cross sections keep curved decks connected at the original map vertices. */
export function bridgePoint(plan: BridgePlan, along: number, side = 0): Point {
  const ps = plan.road.points,
    ds = plan.distances;
  let i = 1;
  while (i < ps.length - 1 && ds[i] < along) i++;
  const a = ps[i - 1],
    b = ps[i],
    len = ds[i] - ds[i - 1];
  const t = clamp((along - ds[i - 1]) / len, 0, 1);
  const normal = (j: number): Point => {
    const prev = ps[Math.max(0, j - 1)],
      p = ps[j],
      next = ps[Math.min(ps.length - 1, j + 1)];
    const before = distance(prev, p),
      after = distance(p, next);
    const n1 = before
      ? { x: (p.z - prev.z) / before, z: -(p.x - prev.x) / before }
      : { x: (next.z - p.z) / after, z: -(next.x - p.x) / after };
    const n2 = after ? { x: (next.z - p.z) / after, z: -(next.x - p.x) / after } : n1;
    const divisor = Math.max(0.5, 1 + n1.x * n2.x + n1.z * n2.z);
    return { x: (n1.x + n2.x) / divisor, z: (n1.z + n2.z) / divisor };
  };
  const na = normal(i - 1),
    nb = normal(i);
  return {
    x: a.x + (b.x - a.x) * t + (na.x + (nb.x - na.x) * t) * side,
    z: a.z + (b.z - a.z) * t + (na.z + (nb.z - na.z) * t) * side,
  };
}

export function locateOnBridge(plan: BridgePlan, p: Point): { along: number; distance: number } {
  let best = { along: 0, distance: Infinity };
  for (let i = 1; i < plan.road.points.length; i++) {
    const a = plan.road.points[i - 1],
      b = plan.road.points[i];
    const q = closestOnSegment(p, a, b),
      d = distance(p, q);
    if (d < best.distance) best = { along: plan.distances[i - 1] + distance(a, q), distance: d };
  }
  return best;
}

function cross(a: Point, b: Point): number {
  return a.x * b.z - a.z * b.x;
}
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, z: a.z - b.z });

/** Inclusive endpoints detect a crossing even when OSM splits both ways at the water. */
function intersection(a: Point, b: Point, c: Point, d: Point): number | undefined {
  const u = sub(b, a),
    v = sub(d, c),
    q = sub(c, a),
    denominator = cross(u, v);
  if (Math.abs(denominator) < 1e-8) return;
  const t = cross(q, v) / denominator,
    s = cross(q, u) / denominator;
  if (t >= -1e-7 && t <= 1 + 1e-7 && s >= -1e-7 && s <= 1 + 1e-7) return clamp(t, 0, 1);
}

/** Clip the road centre against a finite river strip expanded by the full deck width.
 * River end caps and bank margin are included, so oblique deck corners clear the water. */
function waterInterval(
  a: Point,
  b: Point,
  c: Point,
  d: Point,
  halfWidth: number,
): [number, number] | undefined {
  const len = distance(a, b),
    wl = distance(c, d);
  if (len < 1e-5 || wl < 1e-5) return;
  const direction = { x: (d.x - c.x) / wl, z: (d.z - c.z) / wl };
  const roadNormal = { x: (b.z - a.z) / len, z: -(b.x - a.x) / len };
  let lo = 0,
    hi = 1;
  for (const [axis, min, max] of [
    [direction, 0, wl],
    [{ x: -direction.z, z: direction.x }, 0, 0],
  ] as const) {
    const padding =
      RIVER_WIDTH / 2 +
      BANK_MARGIN +
      halfWidth * Math.abs(axis.x * roadNormal.x + axis.z * roadNormal.z);
    const p = (a.x - c.x) * axis.x + (a.z - c.z) * axis.z;
    const delta = (b.x - a.x) * axis.x + (b.z - a.z) * axis.z;
    if (Math.abs(delta) < 1e-8) {
      if (p < min - padding || p > max + padding) return;
    } else {
      const u = (min - padding - p) / delta,
        v = (max + padding - p) / delta;
      lo = Math.max(lo, Math.min(u, v));
      hi = Math.min(hi, Math.max(u, v));
      if (hi < lo) return;
    }
  }
  return [lo, hi];
}

/** Join compatible degree-two fragments; never join separate parallel carriageways. */
function routes(roads: readonly Road[]): Road[] {
  const endpoints = new Set(
    roads
      .flatMap((r) => [r.points[0], r.points.at(-1)!])
      .filter(Boolean)
      .map((p) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`),
  );
  const result = roads.flatMap((r) => {
    const ps = r.points.filter((p, i) => !i || distance(p, r.points[i - 1]) > 1e-4);
    const pieces: Road[] = [];
    let start = 0;
    for (let i = 1; i < ps.length; i++)
      if (i === ps.length - 1 || endpoints.has(`${ps[i].x.toFixed(3)},${ps[i].z.toFixed(3)}`)) {
        pieces.push({ ...r, points: ps.slice(start, i + 1) });
        start = i;
      }
    return pieces;
  });
  for (let i = 0; i < result.length; i++) {
    let joined = true;
    while (joined) {
      joined = false;
      const r = result[i];
      for (const atStart of [false, true]) {
        const p = r.points[atStart ? 0 : r.points.length - 1];
        const candidates = result
          .map((q, j) => ({ q, j }))
          .filter(
            ({ q, j }) =>
              j !== i &&
              q.type === r.type &&
              q.name === r.name &&
              q.width === r.width &&
              q.sidewalk === r.sidewalk &&
              q.surface === r.surface &&
              (distance(p, q.points[0]) < 0.05 ||
                distance(p, q.points[q.points.length - 1]) < 0.05),
          );
        if (!candidates.length) continue;
        const inside = r.points[atStart ? 1 : r.points.length - 2];
        const score = (q: Road) => {
          const next =
            distance(p, q.points[0]) < 0.05 ? q.points[1] : q.points[q.points.length - 2];
          return (
            ((p.x - inside.x) * (next.x - p.x) + (p.z - inside.z) * (next.z - p.z)) /
            (distance(p, inside) * distance(p, next))
          );
        };
        candidates.sort((a, b) => score(b.q) - score(a.q));
        if (candidates.length > 1 && score(candidates[0].q) - score(candidates[1].q) < 0.15)
          continue;
        const { q, j } = candidates[0];
        const ps = distance(p, q.points[0]) < 0.05 ? q.points : [...q.points].reverse();
        r.points = atStart
          ? [...ps.slice(1).reverse(), ...r.points]
          : [...r.points, ...ps.slice(1)];
        result.splice(j, 1);
        if (j < i) i--;
        joined = true;
        break;
      }
    }
  }
  return result;
}

/** A lane can end at an interior node of a wider road. Follow that existing
 * connection for the approaches instead of ending an elevated deck at the node. */
function extendRoute(
  road: Road,
  roads: readonly Road[],
): { road: Road; originalStart: number; originalEnd: number } {
  let points = [...road.points],
    originalStart = 0;
  const originalLength = pathDistances(points).at(-1)!;
  for (const atStart of [true, false]) {
    let added = 0;
    while (added < 65) {
      const p = points[atStart ? 0 : points.length - 1],
        inside = points[atStart ? 1 : points.length - 2];
      const options: Point[][] = [];
      for (const r of roads)
        for (let i = 0; i < r.points.length; i++)
          if (distance(p, r.points[i]) < 0.05) {
            if (i > 0) options.push(r.points.slice(0, i).reverse());
            if (i < r.points.length - 1) options.push(r.points.slice(i + 1));
          }
      const candidates = options.filter(
        (ps) => distance(ps[0], inside) > 0.05 && !points.some((q) => distance(q, ps[0]) < 0.05),
      );
      if (!candidates.length) {
        // A mapped dead end may stop immediately at a bank. Reserve a straight
        // landing beyond it; BridgeScenery renders that short approach as well.
        const len = distance(p, inside),
          remaining = 65 - added;
        const q = {
          x: p.x + ((p.x - inside.x) * remaining) / len,
          z: p.z + ((p.z - inside.z) * remaining) / len,
        };
        points = atStart ? [q, ...points] : [...points, q];
        if (atStart) originalStart += remaining;
        break;
      }
      const score = (ps: Point[]) =>
        ((p.x - inside.x) * (ps[0].x - p.x) + (p.z - inside.z) * (ps[0].z - p.z)) /
        (distance(p, inside) * distance(p, ps[0]));
      candidates.sort((a, b) => score(b) - score(a));
      const next = candidates[0][0];
      const len = distance(p, next),
        remaining = 65 - added;
      const q =
        len <= remaining
          ? next
          : {
              x: p.x + ((next.x - p.x) * remaining) / len,
              z: p.z + ((next.z - p.z) * remaining) / len,
            };
      added += Math.min(len, remaining);
      points = atStart ? [q, ...points] : [...points, q];
      if (atStart) originalStart += Math.min(len, remaining);
      if (len > remaining) break;
    }
  }
  return { road: { ...road, points }, originalStart, originalEnd: originalStart + originalLength };
}

export function detectBridges(roads: readonly Road[], water: readonly Point[][]): BridgePlan[] {
  const result: BridgePlan[] = [];
  const segments = water.flatMap((ps) => ps.slice(1).map((p, i) => [ps[i], p] as const));
  for (const source of routes(roads)) {
    const { road, originalStart, originalEnd } = extendRoute(source, roads);
    const ds = pathDistances(road.points),
      width = roadDeckWidth(road),
      hits: number[] = [];
    const intervals: [number, number][] = [];
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1],
        b = road.points[i],
        len = ds[i] - ds[i - 1];
      for (const [c, d] of segments) {
        const hit = intersection(a, b, c, d);
        if (hit !== undefined) {
          const h = ds[i - 1] + hit * len;
          if (h >= originalStart - 1e-5 && h <= originalEnd + 1e-5) hits.push(h);
        }
        const interval = waterInterval(a, b, c, d, width / 2);
        if (interval) intervals.push(interval.map((t) => ds[i - 1] + t * len) as [number, number]);
      }
    }
    intervals.sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const interval of intervals) {
      const last = merged.at(-1);
      if (last && interval[0] <= last[1] + 2) last[1] = Math.max(last[1], interval[1]);
      else merged.push([...interval]);
    }
    for (const [start, end] of merged) {
      if (end - start < 0.1 || !hits.some((h) => h >= start - 0.01 && h <= end + 0.01)) continue;
      const plan = { id: '', road, distances: ds, start, end, width };
      const p = bridgePoint(plan, (start + end) / 2);
      plan.id = `bridge-${road.type}-${p.x.toFixed(2)}-${p.z.toFixed(2)}`;
      result.push(plan);
    }
  }
  return result.sort((a, b) => a.id.localeCompare(b.id));
}
