import { clamp, closestOnSegment, distance, pointInPolygon, type Point } from '../core/math';
import { Terrain } from './Terrain';
import { bridgePoint, locateOnBridge, type BridgePlan } from './BridgeLayout';
import bridgeOverrides from '../data/scenery/bridge-overrides.json';
import { TunnelSurface } from './TunnelSurface';
import { isHighway, type TunnelPlan } from './TunnelLayout';
import type { Road } from './MapAdapter';

export interface HeightSurface {
  heightAt(x: number, z: number, previousY?: number): number;
}
export interface Bridge extends BridgePlan {
  deckHeight: number;
  startHeight: number;
  endHeight: number;
  maxRoadHeight: number;
  masonryDepth: number;
  approachStart: number;
  approachEnd: number;
  modelSpan: number;
}
const smooth = (t: number) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};

/** A separate, finely sampled travel grid. Water and landscape always retain Terrain.
 * Road triangles and wheel/foot queries use identical diagonals and vertex heights. */
export class TravelSurface implements HeightSurface {
  readonly bridges: Bridge[];
  readonly underpasses: TunnelSurface;
  readonly metadata;
  readonly spacingX: number;
  readonly spacingZ: number;
  private vertices = new Map<string, number>();
  private cells = new Map<string, Bridge[]>();
  private footprints = new Map<string, Point[][]>();
  private readonly cellSize = 24;

  constructor(
    readonly terrain: Terrain,
    plans: readonly BridgePlan[],
    tunnels: readonly TunnelPlan[] = [],
  ) {
    this.underpasses = new TunnelSurface(terrain, tunnels);
    const subdivisions = 6;
    this.metadata = {
      ...terrain.metadata,
      width: (terrain.metadata.width - 1) * subdivisions + 1,
      height: (terrain.metadata.height - 1) * subdivisions + 1,
    };
    this.spacingX = terrain.spacingX / subdivisions;
    this.spacingZ = terrain.spacingZ / subdivisions;
    this.bridges = plans.map((plan) => {
      const override =
        (bridgeOverrides as Record<string, { approachLength?: number; modelSpan?: number }>)[
          plan.id
        ] ?? {};
      for (const value of [override.approachLength])
        if (value !== undefined && (!Number.isFinite(value) || value < 0))
          throw new Error(`Invalid bridge override: ${plan.id}`);
      const modelSpan =
        override.modelSpan ??
        [8, 16, 32, 64, 128].find((n) => plan.end - plan.start <= n * 1.25) ??
        128;
      if (![8, 16, 32, 64, 128].includes(modelSpan))
        throw new Error(`Invalid bridge model span: ${plan.id}`);
      const start = bridgePoint(plan, plan.start),
        end = bridgePoint(plan, plan.end);
      // The existing road at each bank fixes the crossing's elevation. Model
      // clearance must never lift either bank or manufacture an approach ramp.
      const startHeight = terrain.heightAt(start.x, start.z),
        endHeight = terrain.heightAt(end.x, end.z);
      const approachLength = Math.max(14, override.approachLength ?? 0);
      return {
        ...plan,
        modelSpan,
        startHeight,
        endHeight,
        maxRoadHeight: Math.max(startHeight, endHeight),
        deckHeight: (startHeight + endHeight) / 2,
        masonryDepth: 0.25,
        approachStart: Math.max(0, plan.start - approachLength),
        approachEnd: Math.min(plan.distances.at(-1)!, plan.end + approachLength),
      };
    });
    for (const bridge of this.bridges) {
      const points = this.sections(bridge, bridge.approachStart, bridge.approachEnd, 4).map((s) =>
        bridgePoint(bridge, s),
      );
      const margin = bridge.width + 3;
      for (
        let x = Math.floor((Math.min(...points.map((p) => p.x)) - margin) / this.cellSize);
        x <= Math.floor((Math.max(...points.map((p) => p.x)) + margin) / this.cellSize);
        x++
      )
        for (
          let z = Math.floor((Math.min(...points.map((p) => p.z)) - margin) / this.cellSize);
          z <= Math.floor((Math.max(...points.map((p) => p.z)) + margin) / this.cellSize);
          z++
        ) {
          const key = `${x},${z}`;
          if (!this.cells.has(key)) this.cells.set(key, []);
          this.cells.get(key)!.push(bridge);
        }
      const sections = this.sections(bridge, bridge.approachStart, bridge.approachEnd, 2);
      for (let i = 1; i < sections.length; i++)
        this.registerFootprint([
          bridgePoint(bridge, sections[i - 1], -bridge.width / 2),
          bridgePoint(bridge, sections[i], -bridge.width / 2),
          bridgePoint(bridge, sections[i], bridge.width / 2),
          bridgePoint(bridge, sections[i - 1], bridge.width / 2),
        ]);
    }
    for (const bridge of this.bridges) {
      const center = bridgePoint(bridge, (bridge.start + bridge.end) / 2);
      bridge.deckHeight = this.gridHeightAt(center.x, center.z);
      // Fit the stonework to the actual space below the deck, allowing a small
      // buried foundation. Flat crossings become shallow structures, not humps.
      for (const s of this.sections(bridge, bridge.start, bridge.end, 1))
        for (const side of [-bridge.width / 2, 0, bridge.width / 2]) {
          const p = bridgePoint(bridge, s, side);
          bridge.masonryDepth = Math.max(
            bridge.masonryDepth,
            this.gridHeightAt(p.x, p.z) - terrain.heightAt(p.x, p.z) + 0.25,
          );
        }
    }
  }

  private registerFootprint(points: Point[]): void {
    const xs = points.map((p) => p.x),
      zs = points.map((p) => p.z);
    for (
      let x = Math.floor(Math.min(...xs) / this.cellSize);
      x <= Math.floor(Math.max(...xs) / this.cellSize);
      x++
    )
      for (
        let z = Math.floor(Math.min(...zs) / this.cellSize);
        z <= Math.floor(Math.max(...zs) / this.cellSize);
        z++
      ) {
        const key = `${x},${z}`;
        if (!this.footprints.has(key)) this.footprints.set(key, []);
        this.footprints.get(key)!.push(points);
      }
  }

  sections(plan: BridgePlan, start: number, end: number, step = 1): number[] {
    const count = Math.max(1, Math.ceil((end - start) / step));
    return [
      ...new Set([
        ...Array.from({ length: count + 1 }, (_, i) => start + ((end - start) * i) / count),
        ...plan.distances.filter((d) => d > start && d < end),
      ]),
    ].sort((a, b) => a - b);
  }

  private candidates(x: number, z: number): Bridge[] {
    return (
      this.cells.get(`${Math.floor(x / this.cellSize)},${Math.floor(z / this.cellSize)}`) ?? []
    );
  }

  bridgeAt(p: Point): Bridge | undefined {
    return this.candidates(p.x, p.z).find((b) => {
      const q = locateOnBridge(b, p);
      return (
        q.distance <= b.width / 2 + 0.5 && q.along > b.approachStart && q.along < b.approachEnd
      );
    });
  }

  private vertex(col: number, row: number): number {
    const key = `${col},${row}`,
      cached = this.vertices.get(key);
    if (cached !== undefined) return cached;
    const x = this.metadata.game.min_x + col * this.spacingX,
      z = this.metadata.game.min_z + row * this.spacingZ;
    const ground = this.terrain.heightAt(x, z);
    let y = ground;
    for (const b of this.candidates(x, z)) {
      const q = locateOnBridge(b, { x, z });
      const core = b.width / 2 + Math.max(2, b.width * 0.25);
      // Keep altered vertices a full triangle inside the span so interpolation
      // cannot bleed a raised deck onto the road before or after the river.
      const inset = Math.hypot(this.spacingX, this.spacingZ);
      if (q.distance > core + 2 || q.along <= b.start + inset || q.along >= b.end - inset) continue;
      // At sharp bends the closest route segment can change inside a grid cell.
      // Keep the whole supporting cell inside the span before lifting a vertex,
      // otherwise deck interpolation can raise a neighbouring road approach.
      let touchesApproach = false;
      for (const dx of [-this.spacingX, 0, this.spacingX])
        for (const dz of [-this.spacingZ, 0, this.spacingZ]) {
          const neighbour = locateOnBridge(b, { x: x + dx, z: z + dz });
          if (neighbour.along <= b.start || neighbour.along >= b.end) touchesApproach = true;
        }
      if (touchesApproach) continue;
      const longitudinal =
        smooth((q.along - b.start - inset) / inset) * smooth((b.end - inset - q.along) / inset);
      const lateral = 1 - smooth((q.distance - core) / 2);
      const t = clamp((q.along - b.start) / (b.end - b.start), 0, 1);
      const deck = b.startHeight + (b.endHeight - b.startHeight) * t;
      // Only fill the channel up to the bank-to-bank profile. Existing higher
      // terrain is retained, and the bridge cannot impose a higher road crest.
      y = Math.max(y, ground + Math.max(0, deck - ground) * longitudinal * lateral);
    }
    this.vertices.set(key, y);
    return y;
  }

  heightAt(x: number, z: number, previousY?: number): number {
    const upper = this.bridgeHeightAt(x, z);
    if (!this.underpasses.affects({ minX: x, maxX: x, minZ: z, maxZ: z })) return upper;
    return this.underpasses.travelHeight(x, z, upper, previousY);
  }

  private bridgeHeightAt(x: number, z: number): number {
    const p = { x, z };
    const polygons =
      this.footprints.get(`${Math.floor(x / this.cellSize)},${Math.floor(z / this.cellSize)}`) ??
      [];
    // The interpolation apron stabilizes edge vertices, but is not a walkable
    // platform outside the actual road/deck mesh (no floating beside a bridge).
    if (
      !polygons.some(
        (ps) =>
          pointInPolygon(p, ps) ||
          ps.some((a, i) => distance(p, closestOnSegment(p, a, ps[(i + 1) % ps.length])) < 1e-6),
      )
    )
      return this.terrain.heightAt(x, z);
    return this.gridHeightAt(x, z);
  }

  gridHeightAt(x: number, z: number): number {
    if (!this.candidates(x, z).length) return this.terrain.heightAt(x, z);
    const { width, height, game } = this.metadata;
    const gx = clamp((x - game.min_x) / this.spacingX, 0, width - 1),
      gz = clamp((z - game.min_z) / this.spacingZ, 0, height - 1);
    const col = Math.min(Math.floor(gx), width - 2),
      row = Math.min(Math.floor(gz), height - 2),
      u = gx - col,
      v = gz - row;
    const nw = this.vertex(col, row),
      ne = this.vertex(col + 1, row),
      sw = this.vertex(col, row + 1),
      se = this.vertex(col + 1, row + 1);
    return u + v <= 1
      ? nw + (ne - nw) * u + (sw - nw) * v
      : se + (sw - se) * (1 - u) + (ne - se) * (1 - v);
  }

  drapeGeometry(points: Point[], offset = 0, road?: Road) {
    const xs = points.map((p) => p.x),
      zs = points.map((p) => p.z);
    if (
      (!road || !isHighway(road)) &&
      this.underpasses.affects({
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minZ: Math.min(...zs),
        maxZ: Math.max(...zs),
      })
    )
      return this.terrain.drapeGeometry(points, offset, this.underpasses);
    for (
      let x = Math.floor(Math.min(...xs) / this.cellSize);
      x <= Math.floor(Math.max(...xs) / this.cellSize);
      x++
    )
      for (
        let z = Math.floor(Math.min(...zs) / this.cellSize);
        z <= Math.floor(Math.max(...zs) / this.cellSize);
        z++
      )
        if (this.cells.has(`${x},${z}`)) {
          this.registerFootprint(points);
          return this.terrain.drapeGeometry(points, offset, {
            metadata: this.metadata,
            spacingX: this.spacingX,
            spacingZ: this.spacingZ,
            heightAt: (x, z) => this.gridHeightAt(x, z),
          });
        }
    return this.terrain.drapeGeometry(points, offset);
  }

  /** Car exits must land on the same accessible level, inside the bridge's edges. */
  canExit(from: Point & { y?: number }, to: Point, radius: number): boolean {
    if (this.underpasses.at(from, 4) || this.underpasses.at(to, 4))
      return (
        Math.abs(this.heightAt(from.x, from.z, from.y) - this.heightAt(to.x, to.z, from.y)) < 1.2
      );
    const bridge = this.bridgeAt(from);
    if (!bridge && !this.bridgeAt(to)) return true;
    if (bridge) {
      const q = locateOnBridge(bridge, to);
      if (
        q.along > bridge.approachStart &&
        q.along < bridge.approachEnd &&
        q.distance + radius > bridge.width / 2 - 0.15
      )
        return false;
    }
    return Math.abs(this.heightAt(from.x, from.z) - this.heightAt(to.x, to.z)) < 1.2;
  }
}
