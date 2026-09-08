import { LA_POBLA_MAP, type MapDataset } from '../data/laPoblaMap';
import { closestOnSegment, distance, type Point } from '../core/math';
import roadProfiles from '../data/scenery/road-profiles.json' with { type: 'json' };
export interface Road {
  name: string;
  type: string;
  points: Point[];
  width: number;
  sidewalk: number;
  surface: string;
}
export interface BuildingFootprint {
  name: string;
  type: string;
  points: Point[];
}
export class MapAdapter {
  static readonly origin = [-0.0012, 40.1017] as const;
  static readonly scale = 0.7;
  readonly roads: Road[] = [];
  readonly buildings: BuildingFootprint[];
  readonly areas: { type: string; points: Point[] }[];
  readonly water: Point[][];
  readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  constructor(readonly source: MapDataset = LA_POBLA_MAP) {
    for (const road of source.roads) {
      const lines =
        typeof road.c[0]?.[0] === 'number'
          ? [road.c as [number, number][]]
          : (road.c as [number, number][][]);
      for (const line of lines)
        if (line.length > 1)
          this.roads.push({
            name: road.n,
            type: road.t,
            points: line.map((c) => this.project(c)),
            width: this.profile(road.n)?.width ?? this.roadWidth(road.t),
            sidewalk: this.profile(road.n)?.sidewalk ?? 0.8,
            surface: this.profile(road.n)?.surface ?? 'asphalt',
          });
    }
    this.buildings = source.buildings.map((b) => ({
      name: b.n,
      type: b.t,
      points: b.c.map((c) => this.project(c)),
    }));
    this.areas = source.areas.map((a) => ({ type: a.t, points: a.c.map((c) => this.project(c)) }));
    this.water = source.water.map((w) => w.c.map((c) => this.project(c)));
    const [west, south, east, north] = source.bounds,
      a = this.project([west, north]),
      b = this.project([east, south]);
    this.bounds = { minX: a.x, maxX: b.x, minZ: a.z, maxZ: b.z };
  }
  project([lon, lat]: readonly number[]): Point {
    return {
      x:
        (lon - MapAdapter.origin[0]) *
        111320 *
        Math.cos((MapAdapter.origin[1] * Math.PI) / 180) *
        MapAdapter.scale,
      z: -(lat - MapAdapter.origin[1]) * 111320 * MapAdapter.scale,
    };
  }
  unproject(p: Point): [number, number] {
    return [
      p.x / (111320 * Math.cos((MapAdapter.origin[1] * Math.PI) / 180) * MapAdapter.scale) +
        MapAdapter.origin[0],
      MapAdapter.origin[1] - p.z / (111320 * MapAdapter.scale),
    ];
  }
  roadWidth(type: string): number {
    if (type.startsWith('motorway') || type === 'primary') return 12;
    if (['tertiary', 'secondary'].includes(type)) return 9;
    if (['footway', 'steps', 'path', 'cycleway'].includes(type)) return 2.7;
    if (type === 'track') return 4.4;
    return 6.6;
  }
  private profile(name: string): { width: number; sidewalk: number; surface: string } | undefined {
    return (roadProfiles as Record<string, { width: number; sidewalk: number; surface: string }>)[
      name
    ];
  }
  nearestRoad(
    p: Point,
    drivable = false,
  ): { road: Road; point: Point; distance: number; angle: number } {
    let best = {
      road: this.roads[0],
      point: this.roads[0].points[0],
      distance: Infinity,
      angle: 0,
    };
    for (const road of this.roads) {
      if (drivable && ['footway', 'steps', 'path', 'pedestrian', 'cycleway'].includes(road.type))
        continue;
      for (let i = 1; i < road.points.length; i++) {
        const a = road.points[i - 1],
          b = road.points[i],
          point = closestOnSegment(p, a, b),
          d = distance(p, point);
        if (d < best.distance)
          best = { road, point, distance: d, angle: Math.atan2(b.x - a.x, b.z - a.z) };
      }
    }
    return best;
  }
}
