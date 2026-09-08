import { clamp, closestOnSegment, distance, type Point } from '../core/math';
import { bridgePoint, locateOnBridge, roadDeckWidth } from './BridgeLayout';
import type { TunnelPlan } from './TunnelLayout';
import type { Terrain } from './Terrain';
import type { CollisionWorld } from './CollisionWorld';

export interface Tunnel extends TunnelPlan {
  floorHeight: number;
  approachStart: number;
  approachEnd: number;
}
export const TUNNEL_CLEARANCE = 2.5;
export const TUNNEL_SLAB = 0.55;
type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };
const smooth = (t: number) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};

/** The excavated ground and the highway deck are independent surfaces. A mover's
 * previous height selects its level, so crossing the same X/Z never teleports it. */
export class TunnelSurface {
  readonly tunnels: Tunnel[];
  readonly metadata;
  readonly spacingX: number;
  readonly spacingZ: number;
  readonly subdivisions: number;
  private bounds: Bounds[] = [];
  private cells = new Map<string, Tunnel[]>();
  private vertices = new Map<string, number>();
  private readonly cellSize = 24;
  constructor(
    readonly terrain: Terrain,
    plans: readonly TunnelPlan[],
  ) {
    this.subdivisions = Math.ceil(Math.max(terrain.spacingX, terrain.spacingZ) / 0.5);
    this.spacingX = terrain.spacingX / this.subdivisions;
    this.spacingZ = terrain.spacingZ / this.subdivisions;
    this.metadata = {
      ...terrain.metadata,
      width: (terrain.metadata.width - 1) * this.subdivisions + 1,
      height: (terrain.metadata.height - 1) * this.subdivisions + 1,
    };
    this.tunnels = plans.map((p) => {
      let roof = Infinity;
      for (let s = p.start; s <= p.end + 0.5; s += 0.5)
        for (const side of [-p.width / 2 - 0.5, 0, p.width / 2 + 0.5]) {
          const q = bridgePoint(p, Math.min(p.end, s), side);
          roof = Math.min(roof, terrain.heightAt(q.x, q.z));
        }
      const floorHeight = roof - TUNNEL_CLEARANCE - TUNNEL_SLAB;
      const approach = Math.max(24, (TUNNEL_CLEARANCE + TUNNEL_SLAB) * 7);
      return {
        ...p,
        floorHeight,
        approachStart: Math.max(0, p.start - approach),
        approachEnd: Math.min(p.distances.at(-1)!, p.end + approach),
      };
    });
    for (const tunnel of this.tunnels) {
      const points = this.sections(tunnel).map((s) => bridgePoint(tunnel, s));
      const margin = tunnel.width / 2 + 6;
      const bounds = {
        minX: Math.min(...points.map((p) => p.x)) - margin,
        maxX: Math.max(...points.map((p) => p.x)) + margin,
        minZ: Math.min(...points.map((p) => p.z)) - margin,
        maxZ: Math.max(...points.map((p) => p.z)) + margin,
      };
      this.bounds.push(bounds);
      for (
        let x = Math.floor(bounds.minX / this.cellSize);
        x <= Math.floor(bounds.maxX / this.cellSize);
        x++
      )
        for (
          let z = Math.floor(bounds.minZ / this.cellSize);
          z <= Math.floor(bounds.maxZ / this.cellSize);
          z++
        ) {
          const key = `${x},${z}`;
          if (!this.cells.has(key)) this.cells.set(key, []);
          this.cells.get(key)!.push(tunnel);
        }
    }
  }
  sections(t: Tunnel, start = t.approachStart, end = t.approachEnd): number[] {
    const count = Math.ceil(end - start);
    return [
      ...new Set([
        start,
        end,
        t.start,
        t.end,
        ...t.distances.filter((s) => s > start && s < end),
        ...Array.from({ length: count + 1 }, (_, i) => start + ((end - start) * i) / count),
      ]),
    ]
      .filter((s) => s >= start && s <= end)
      .sort((a, b) => a - b);
  }
  private candidates(p: Point): Tunnel[] {
    return (
      this.cells.get(`${Math.floor(p.x / this.cellSize)},${Math.floor(p.z / this.cellSize)}`) ?? []
    );
  }
  affects(bounds: Bounds): boolean {
    return this.bounds.some(
      (b) =>
        b.minX <= bounds.maxX &&
        b.maxX >= bounds.minX &&
        b.minZ <= bounds.maxZ &&
        b.maxZ >= bounds.minZ,
    );
  }
  at(p: Point, margin = 0): Tunnel | undefined {
    return this.candidates(p).find((t) => {
      const q = locateOnBridge(t, p);
      return (
        q.along > t.approachStart && q.along < t.approachEnd && q.distance < t.width / 2 + margin
      );
    });
  }
  floorAt(t: Tunnel, along: number, ground: number): number {
    const inset = Math.hypot(this.spacingX, this.spacingZ);
    const blend =
      smooth((along - t.approachStart) / Math.max(0.1, t.start - inset - t.approachStart)) *
      smooth((t.approachEnd - along) / Math.max(0.1, t.approachEnd - t.end - inset));
    return ground + (Math.min(ground, t.floorHeight) - ground) * blend;
  }
  private vertex(col: number, row: number): number {
    const key = `${col},${row}`;
    const cached = this.vertices.get(key);
    if (cached !== undefined) return cached;
    const p = {
      x: this.metadata.game.min_x + col * this.spacingX,
      z: this.metadata.game.min_z + row * this.spacingZ,
    };
    const ground = this.terrain.heightAt(p.x, p.z);
    let y = ground;
    for (const t of this.candidates(p)) {
      const q = locateOnBridge(t, p);
      if (q.along <= t.approachStart || q.along >= t.approachEnd) continue;
      // The full opening stays clear of every supporting terrain triangle.
      const lateral = 1 - smooth((q.distance - t.width / 2 - 0.8) / 3);
      y = Math.min(y, ground + (this.floorAt(t, q.along, ground) - ground) * lateral);
    }
    this.vertices.set(key, y);
    return y;
  }
  heightAt(x: number, z: number): number {
    if (!this.candidates({ x, z }).length) return this.terrain.heightAt(x, z);
    const gx = clamp((x - this.metadata.game.min_x) / this.spacingX, 0, this.metadata.width - 1);
    const gz = clamp((z - this.metadata.game.min_z) / this.spacingZ, 0, this.metadata.height - 1);
    const c = Math.min(Math.floor(gx), this.metadata.width - 2),
      r = Math.min(Math.floor(gz), this.metadata.height - 2);
    const u = gx - c,
      v = gz - r;
    const nw = this.vertex(c, r),
      ne = this.vertex(c + 1, r),
      sw = this.vertex(c, r + 1),
      se = this.vertex(c + 1, r + 1);
    return u + v <= 1
      ? nw + (ne - nw) * u + (sw - nw) * v
      : se + (sw - se) * (1 - u) + (ne - se) * (1 - v);
  }
  /** There is an upper surface on the concrete roof and the highway footprint. */
  upperAt(p: Point): boolean {
    return this.candidates(p).some((t) => {
      const q = locateOnBridge(t, p);
      if (q.along >= t.start && q.along <= t.end && q.distance <= t.width / 2 + 0.6) return true;
      return t.highways.some((road) =>
        road.points
          .slice(1)
          .some(
            (b, i) =>
              distance(p, closestOnSegment(p, road.points[i], b)) <= roadDeckWidth(road) / 2,
          ),
      );
    });
  }
  travelHeight(x: number, z: number, upper: number, previousY?: number): number {
    const lower = this.heightAt(x, z);
    if (Math.abs(lower - this.terrain.heightAt(x, z)) < 1e-6) return upper;
    if (!this.upperAt({ x, z })) return lower;
    return previousY === undefined || Math.abs(previousY - upper) <= Math.abs(previousY - lower)
      ? upper
      : lower;
  }
  addCollisions(collision: CollisionWorld): void {
    for (const t of this.tunnels) {
      const sections = this.sections(t);
      for (let i = 1; i < sections.length; i++)
        for (const side of [-1, 1]) {
          const s0 = sections[i - 1],
            s1 = sections[i];
          const a = bridgePoint(t, s0, (side * t.width) / 2),
            b = bridgePoint(t, s1, (side * t.width) / 2);
          const top = Math.min(this.terrain.heightAt(a.x, a.z), this.terrain.heightAt(b.x, b.z));
          const bottom = Math.min(this.heightAt(a.x, a.z), this.heightAt(b.x, b.z));
          if (top - bottom < 0.3) continue;
          collision.add(
            [
              a,
              b,
              bridgePoint(t, s1, side * (t.width / 2 + 0.5)),
              bridgePoint(t, s0, side * (t.width / 2 + 0.5)),
            ],
            bottom - 0.2,
            top - 0.1,
          );
        }
    }
  }
}
