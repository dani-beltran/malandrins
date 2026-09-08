import type { Road } from './MapAdapter';
import {
  bridgePoint,
  corridorInterval,
  intersection,
  extendRoute,
  pathDistances,
  roadDeckWidth,
  roadRoutes,
  type BridgePlan,
} from './BridgeLayout';

export const isPath = (road: Road): boolean =>
  ['track', 'path', 'footway', 'cycleway', 'steps', 'pedestrian'].includes(road.type);
export const isHighway = (road: Road): boolean => /^(motorway|trunk)(?:_link)?$/.test(road.type);

export interface TunnelPlan extends BridgePlan {
  highways: Road[];
}

/** Merge adjacent carriageways into one passage. Nearby paths and paths that
 * terminate at a highway are not crossings; both mouths need a mapped route. */
export function detectTunnels(roads: readonly Road[]): TunnelPlan[] {
  const highways = roads.filter(isHighway);
  const result: TunnelPlan[] = [];
  for (const source of roadRoutes(roads.filter(isPath))) {
    const { road, originalStart, originalEnd } = extendRoute(
      source,
      roads.filter((r) => !isHighway(r)),
      35,
      false,
    );
    const distances = pathDistances(road.points);
    const width = Math.max(4.4, road.width) + 1;
    const hits: number[] = [];
    const intervals: { start: number; end: number; highways: Road[] }[] = [];
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1],
        b = road.points[i];
      const length = distances[i] - distances[i - 1];
      for (const highway of highways)
        for (let j = 1; j < highway.points.length; j++) {
          const c = highway.points[j - 1],
            d = highway.points[j];
          const hit = intersection(a, b, c, d);
          if (hit !== undefined) {
            const along = distances[i - 1] + hit * length;
            if (along >= originalStart && along <= originalEnd) hits.push(along);
          }
          const interval = corridorInterval(a, b, c, d, width / 2 + 0.5, roadDeckWidth(highway), 2);
          if (interval)
            intervals.push({
              start: distances[i - 1] + interval[0] * length,
              end: distances[i - 1] + interval[1] * length,
              highways: [highway],
            });
        }
    }
    intervals.sort((a, b) => a.start - b.start);
    const merged: typeof intervals = [];
    for (const interval of intervals) {
      const last = merged.at(-1);
      if (last && interval.start <= last.end + 8) {
        last.end = Math.max(last.end, interval.end);
        last.highways = [...new Set([...last.highways, ...interval.highways])];
      } else merged.push({ ...interval });
    }
    for (const interval of merged) {
      if (
        interval.start < 1 ||
        interval.end > distances.at(-1)! - 1 ||
        !hits.some((h) => h >= interval.start && h <= interval.end)
      )
        continue;
      const plan = { ...interval, road, distances, width, id: '' };
      const p = bridgePoint(plan, (plan.start + plan.end) / 2);
      plan.id = `tunnel-${road.type}-${p.x.toFixed(2)}-${p.z.toFixed(2)}`;
      result.push(plan);
    }
  }
  return result.sort((a, b) => a.id.localeCompare(b.id));
}
