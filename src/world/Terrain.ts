import * as THREE from 'three';
import metadata from '../../references/topographic-data/derived/icv-2017-heightmap-257.json';
import heightmapUrl from '../../references/topographic-data/derived/icv-2017-heightmap-257.f32?url';
import { clamp, type Point } from '../core/math';
import { MapAdapter, type Road } from './MapAdapter';
import { gradeTerrain } from './TerrainGrading';
import type { BridgePlan } from './BridgeLayout';
import type { TunnelSurface } from './TunnelSurface';

export interface TerrainMetadata {
  width: number;
  height: number;
  game: {
    min_x: number;
    max_x: number;
    min_z: number;
    max_z: number;
    baseline_elevation_m: number;
    scale: number;
  };
}

/** The rendered triangles and every ground query share the same north-to-south grid. */
export class Terrain {
  readonly heights: Float32Array;
  readonly spacingX: number;
  readonly spacingZ: number;
  readonly minHeight: number;
  readonly maxHeight: number;

  constructor(
    readonly metadata: TerrainMetadata,
    buffer: ArrayBuffer,
    roads: readonly Road[] = [],
    water: readonly Point[][] = [],
    bridges: readonly BridgePlan[] = [],
  ) {
    const { width, height, game } = metadata;
    if (width < 2 || height < 2 || buffer.byteLength !== width * height * 4)
      throw new Error('Invalid terrain heightmap dimensions or byte length.');
    this.spacingX = (game.max_x - game.min_x) / (width - 1);
    this.spacingZ = (game.max_z - game.min_z) / (height - 1);
    const data = new DataView(buffer);
    this.heights = new Float32Array(width * height);
    for (let i = 0; i < this.heights.length; i++) {
      const elevation = data.getFloat32(i * 4, true);
      if (!Number.isFinite(elevation)) throw new Error('Invalid terrain elevation.');
      const y = (elevation - game.baseline_elevation_m) * game.scale;
      this.heights[i] = y;
    }
    gradeTerrain(this, roads, water, bridges);
    let min = Infinity,
      max = -Infinity;
    for (const y of this.heights) {
      min = Math.min(min, y);
      max = Math.max(max, y);
    }
    this.minHeight = min;
    this.maxHeight = max;
  }

  static async load(map: MapAdapter): Promise<Terrain> {
    const { game } = metadata;
    if (
      game.scale !== MapAdapter.scale ||
      metadata.game.origin_lon_lat.some((v, i) => v !== MapAdapter.origin[i]) ||
      Math.abs(game.min_x - map.bounds.minX) > 0.001 ||
      Math.abs(game.max_x - map.bounds.maxX) > 0.001 ||
      Math.abs(game.min_z - map.bounds.minZ) > 0.001 ||
      Math.abs(game.max_z - map.bounds.maxZ) > 0.001
    )
      throw new Error('Terrain heightmap does not match the game map projection.');
    const response = await fetch(heightmapUrl);
    if (!response.ok) throw new Error(`Terrain heightmap could not load (${response.status}).`);
    return new Terrain(metadata, await response.arrayBuffer(), map.roads, map.water, map.bridges);
  }

  heightAt(x: number, z: number): number {
    const { width, height, game } = this.metadata;
    const gx = clamp((x - game.min_x) / this.spacingX, 0, width - 1);
    const gz = clamp((z - game.min_z) / this.spacingZ, 0, height - 1);
    const col = Math.min(Math.floor(gx), width - 2),
      row = Math.min(Math.floor(gz), height - 2);
    const u = gx - col,
      v = gz - row,
      i = row * width + col;
    const nw = this.heights[i],
      ne = this.heights[i + 1];
    const sw = this.heights[i + width],
      se = this.heights[i + width + 1];
    // Diagonal NE–SW: barycentric interpolation lies exactly on the rendered surface.
    return u + v <= 1
      ? nw + (ne - nw) * u + (sw - nw) * v
      : se + (sw - se) * (1 - u) + (ne - se) * (1 - v);
  }

  createGeometry(
    col = 0,
    row = 0,
    columns = this.metadata.width - 1,
    rows = this.metadata.height - 1,
    excavation?: TunnelSurface,
  ): THREE.BufferGeometry {
    if (excavation) {
      const { game } = this.metadata;
      const pieces: number[] = [],
        uvs: number[] = [];
      for (let r = row; r < row + rows; r++)
        for (let c = col; c < col + columns; c++) {
          const x = game.min_x + c * this.spacingX,
            z = game.min_z + r * this.spacingZ;
          const bounds = { minX: x, maxX: x + this.spacingX, minZ: z, maxZ: z + this.spacingZ };
          const n = excavation.affects(bounds) ? excavation.subdivisions : 1;
          for (let j = 0; j < n; j++)
            for (let i = 0; i < n; i++) {
              for (const [dx, dz] of [
                [0, 0],
                [0, 1],
                [1, 0],
                [1, 0],
                [0, 1],
                [1, 1],
              ]) {
                const px = x + ((i + dx) * this.spacingX) / n,
                  pz = z + ((j + dz) * this.spacingZ) / n;
                pieces.push(px, excavation.heightAt(px, pz), pz);
                uvs.push(px / 8, pz / 8);
              }
            }
        }
      return this.geometry(pieces, uvs);
    }
    const positions: number[] = [],
      uvs: number[] = [],
      indices: number[] = [];
    const { width, game } = this.metadata;
    for (let r = 0; r <= rows; r++)
      for (let c = 0; c <= columns; c++) {
        const x = game.min_x + (col + c) * this.spacingX,
          z = game.min_z + (row + r) * this.spacingZ;
        positions.push(x, this.heights[(row + r) * width + col + c], z);
        uvs.push(x / 8, z / 8);
        if (r < rows && c < columns) {
          const a = r * (columns + 1) + c,
            b = a + 1,
            d = a + columns + 1;
          indices.push(a, d, b, b, d, d + 1);
        }
      }
    return this.geometry(positions, uvs, indices);
  }

  /** Split overlays at grid edges AND diagonals so roads cannot cut through hills. */
  drapeGeometry(
    points: Point[],
    offset = 0,
    grid: Pick<Terrain, 'metadata' | 'spacingX' | 'spacingZ' | 'heightAt'> = this,
  ): THREE.BufferGeometry {
    const positions: number[] = [],
      uvs: number[] = [];
    const contour = points.map((p) => new THREE.Vector2(p.x, p.z));
    const faces = THREE.ShapeUtils.triangulateShape(contour, []);
    const { game, width, height } = grid.metadata;
    for (const face of faces) {
      const triangle = face.map((i) => points[i]);
      const xs = triangle.map((p) => p.x),
        zs = triangle.map((p) => p.z);
      const c0 = Math.max(0, Math.floor((Math.min(...xs) - game.min_x) / grid.spacingX));
      const c1 = Math.min(width - 2, Math.floor((Math.max(...xs) - game.min_x) / grid.spacingX));
      const r0 = Math.max(0, Math.floor((Math.min(...zs) - game.min_z) / grid.spacingZ));
      const r1 = Math.min(height - 2, Math.floor((Math.max(...zs) - game.min_z) / grid.spacingZ));
      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++) {
          const x = game.min_x + c * grid.spacingX,
            z = game.min_z + r * grid.spacingZ;
          let cell = clip(triangle, (p) => p.x - x);
          cell = clip(cell, (p) => x + grid.spacingX - p.x);
          cell = clip(cell, (p) => p.z - z);
          cell = clip(cell, (p) => z + grid.spacingZ - p.z);
          if (cell.length < 3) continue;
          const diagonal = (p: Point) => 1 - (p.x - x) / grid.spacingX - (p.z - z) / grid.spacingZ;
          for (const polygon of [clip(cell, diagonal), clip(cell, (p) => -diagonal(p))]) {
            for (let i = 1; i + 1 < polygon.length; i++) {
              const a = polygon[0],
                b = polygon[i],
                d = polygon[i + 1];
              const cross = (b.x - a.x) * (d.z - a.z) - (b.z - a.z) * (d.x - a.x);
              if (Math.abs(cross) < 1e-9) continue;
              for (const p of cross < 0 ? [a, b, d] : [a, d, b]) {
                positions.push(p.x, grid.heightAt(p.x, p.z) + offset, p.z);
                uvs.push(p.x / 8, p.z / 8);
              }
            }
          }
        }
    }
    return this.geometry(positions, uvs);
  }

  footprintRange(points: Point[]): { min: number; max: number } {
    const geometry = this.drapeGeometry(points);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const fallback = this.heightAt(points[0].x, points[0].z);
    const range = box.isEmpty()
      ? { min: fallback, max: fallback }
      : { min: box.min.y, max: box.max.y };
    geometry.dispose();
    return range;
  }

  private geometry(positions: number[], uvs: number[], indices?: number[]): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    if (indices) geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

function clip(points: Point[], signedDistance: (p: Point) => number): Point[] {
  const result: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    const da = signedDistance(a),
      db = signedDistance(b);
    if (da >= 0) result.push(a);
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db);
      result.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  return result;
}
