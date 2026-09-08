import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MapAdapter, type Road } from './MapAdapter';
import { CollisionWorld } from './CollisionWorld';
import { Terrain } from './Terrain';
import { TownScenery } from './TownScenery';
import { ModelFactory } from '../assets/ModelFactory';
import { distance, seededRandom, rectangle, type Point } from '../core/math';
export class WorldBuilder {
  readonly group = new THREE.Group();
  readonly collision: CollisionWorld;
  readonly buildingOutlines: Point[][] = [];
  private random = seededRandom(3401);
  constructor(
    readonly map: MapAdapter,
    readonly terrain: Terrain,
    private models: ModelFactory,
    private reserved: Point[],
  ) {
    this.collision = new CollisionWorld(map.bounds);
  }
  build(): THREE.Group {
    this.ground();
    for (const area of this.map.areas.filter((a) => ['pitch', 'swimming_pool'].includes(a.type)))
      this.surface(
        area.points,
        area.type === 'forest'
          ? 0x778667
          : area.type === 'industrial'
            ? 0xb0ae94
            : area.type === 'pitch'
              ? 0x829980
              : area.type === 'swimming_pool'
                ? 0x6eada5
                : 0xb1b39b,
        0.016,
      );
    for (const water of this.map.water) this.ribbon(water, 4.5, 0x88a19b, 0.025);
    for (const road of this.map.roads) this.road(road);
    const town = new TownScenery(this.map, this.terrain, this.models, this.collision);
    this.group.add(town.build());
    this.buildingOutlines.push(...town.outlines);
    this.landscape();
    this.festival();
    this.batchStatic();
    return this.group;
  }
  private ground(): void {
    const { width, height } = this.terrain.metadata;
    // Keep indexed terrain chunks out of material batching for culling and camera raycasts.
    for (let row = 0; row < height - 1; row += 32)
      for (let col = 0; col < width - 1; col += 32) {
        const mesh = new THREE.Mesh(
          this.terrain.createGeometry(
            col,
            row,
            Math.min(32, width - 1 - col),
            Math.min(32, height - 1 - row),
          ),
          this.models.assets.material(0xffffff, 'landcover'),
        );
        const uv = mesh.geometry.getAttribute('uv'),
          position = mesh.geometry.getAttribute('position');
        const mercator = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
        const [, south, , north] = this.map.source.bounds;
        for (let i = 0; i < uv.count; i++) {
          const p = { x: position.getX(i), z: position.getZ(i) };
          const [, latitude] = this.map.unproject(p);
          uv.setXY(
            i,
            (p.x - this.map.bounds.minX) / (this.map.bounds.maxX - this.map.bounds.minX),
            (mercator(latitude) - mercator(south)) / (mercator(north) - mercator(south)),
          );
        }
        mesh.userData.terrain = true;
        mesh.receiveShadow = true;
        this.group.add(mesh);
      }
    // Extend only the boundary into the fog; this apron is outside the playable survey.
    const { minX, maxX, minZ, maxZ } = this.map.bounds;
    const corners = [
      { x: minX, z: minZ },
      { x: minX, z: maxZ },
      { x: maxX, z: maxZ },
      { x: maxX, z: minZ },
    ];
    const center = { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
    const positions: number[] = [];
    for (let side = 0; side < 4; side++) {
      const a = corners[side],
        b = corners[(side + 1) % 4];
      const steps = side % 2 === 0 ? height - 1 : width - 1;
      for (let i = 0; i < steps; i++) {
        const edge = [i / steps, (i + 1) / steps].map((t) => ({
          x: a.x + (b.x - a.x) * t,
          z: a.z + (b.z - a.z) * t,
        }));
        const inner = edge.map((p) => new THREE.Vector3(p.x, this.terrain.heightAt(p.x, p.z), p.z));
        const outer = inner.map(
          (p) =>
            new THREE.Vector3(
              center.x + (p.x - center.x) * 4,
              p.y - 40,
              center.z + (p.z - center.z) * 4,
            ),
        );
        for (const p of [inner[0], outer[0], inner[1], inner[1], outer[0], outer[1]])
          positions.push(p.x, p.y, p.z);
      }
    }
    const apron = new THREE.BufferGeometry();
    apron.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    apron.computeVertexNormals();
    const mesh = new THREE.Mesh(apron, this.models.assets.material(0x8d9975));
    mesh.userData.terrain = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }
  private surface(points: Point[], color: number, y: number, texture?: string): void {
    const geometry = this.terrain.drapeGeometry(points, y);
    const uv = geometry.getAttribute('uv');
    const repeat = texture === 'paving' ? 6.5 : texture === 'sidewalk' ? 5 : 1;
    if (repeat !== 1)
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * repeat, uv.getY(i) * repeat);
    const mesh = new THREE.Mesh(
      geometry,
      this.models.assets.material(texture ? 0xffffff : color, texture),
    );
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }
  private ribbon(points: Point[], width: number, color: number, y: number, texture?: string): void {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        len = distance(a, b);
      if (len < 0.01) continue;
      const nx = (((b.z - a.z) / len) * width) / 2,
        nz = ((-(b.x - a.x) / len) * width) / 2;
      this.surface(
        [
          { x: a.x + nx, z: a.z + nz },
          { x: b.x + nx, z: b.z + nz },
          { x: b.x - nx, z: b.z - nz },
          { x: a.x - nx, z: a.z - nz },
        ],
        color,
        y,
        texture,
      );
    }
    for (const p of points)
      this.surface(
        Array.from({ length: 8 }, (_, i) => ({
          x: p.x + (Math.cos((i * Math.PI) / 4) * width) / 2,
          z: p.z + (Math.sin((i * Math.PI) / 4) * width) / 2,
        })),
        color,
        y + 0.002,
        texture,
      );
  }
  private road(road: Road): void {
    const trail = ['track', 'path', 'footway', 'steps', 'cycleway'].includes(road.type);
    if (!trail)
      this.ribbon(road.points, road.width + road.sidewalk * 2, 0xd2c6b3, 0.055, 'sidewalk');
    this.ribbon(
      road.points,
      road.width,
      trail ? 0xb0a38a : 0x656f6c,
      trail ? 0.074 : 0.085,
      trail && road.surface !== 'paving' ? undefined : road.surface,
    );
    if (road.width >= 9 && road.surface === 'asphalt')
      for (let i = 1; i < road.points.length; i++) {
        const a = road.points[i - 1],
          b = road.points[i],
          len = distance(a, b),
          angle = Math.atan2(b.x - a.x, b.z - a.z);
        for (let d = 3; d < len - 2; d += 8) {
          this.surface(
            rectangle(
              a.x + ((b.x - a.x) * d) / len,
              a.z + ((b.z - a.z) * d) / len,
              0.17,
              2.5,
              angle,
            ),
            0xd5cbb0,
            0.116,
          );
        }
      }
  }
  private landscape(): void {
    for (let i = 0; i < 700; i++) {
      const x = (this.random() - 0.5) * 1500,
        z = (this.random() - 0.5) * 1500,
        p = { x, z },
        near = this.map.nearestRoad(p);
      if (
        near.distance < near.road.width / 2 + 4 ||
        this.collision.blocked(p, 4) ||
        this.reserved.some((r) => distance(r, p) < 10)
      )
        continue;
      if (x > -150 && x < 260 && z > -280 && z < 300) continue;
      const tree = this.models.tree(0.65 + this.random() * 0.7);
      tree.position.set(x, this.terrain.heightAt(x, z), z);
      this.group.add(tree);
    }
    let k = 0;
    for (const road of this.map.roads.filter((r) => r.name && r.width > 6))
      for (let i = 1; i < road.points.length; i++) {
        const a = road.points[i - 1],
          b = road.points[i],
          len = distance(a, b);
        if (len < 12) continue;
        const p = {
          x: (a.x + b.x) / 2 - ((b.z - a.z) / len) * (road.width / 2 + 1),
          z: (a.z + b.z) / 2 + ((b.x - a.x) / len) * (road.width / 2 + 1),
        };
        if (
          Math.abs(p.x) > 280 ||
          Math.abs(p.z) > 300 ||
          this.collision.blocked(p, 1) ||
          this.reserved.some((r) => distance(r, p) < 5)
        )
          continue;
        if (k++ % 2 === 0) {
          const lamp = this.models.lamp();
          lamp.position.set(p.x, this.terrain.heightAt(p.x, p.z), p.z);
          this.group.add(lamp);
        }
      }
  }
  private festival(): void {
    // Fictional festival bunting, separate from the source geography.
    const center = this.reserved[0];
    for (let i = 0; i < 10; i++) {
      const flag = new THREE.Mesh(
        new THREE.ConeGeometry(0.65, 1.1, 3),
        this.models.assets.material([0xcd7754, 0xe7c57d, 0x638c7a][i % 3]),
      );
      flag.rotation.z = Math.PI;
      flag.position.set(
        center.x - 9 + i * 2,
        this.terrain.heightAt(center.x, center.z) + 12 - Math.sin((i / 9) * Math.PI),
        center.z,
      );
      this.group.add(flag);
    }
  }
  private batchStatic(): void {
    this.group.updateMatrixWorld(true);
    const terrain = this.group.children.filter((o) => o.userData.terrain);
    const batches = new Map<
        string,
        { material: THREE.Material; geometries: THREE.BufferGeometry[]; castShadow: boolean }
      >(),
      originals: THREE.BufferGeometry[] = [];
    this.group.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || Array.isArray(o.material) || o.userData.terrain) return;
      let geometry = o.geometry.clone();
      geometry.applyMatrix4(o.matrixWorld);
      if (geometry.index) {
        const old = geometry;
        geometry = geometry.toNonIndexed();
        old.dispose();
      }
      if (!geometry.getAttribute('uv'))
        geometry.setAttribute(
          'uv',
          new THREE.BufferAttribute(
            new Float32Array(geometry.getAttribute('position').count * 2),
            2,
          ),
        );
      geometry.computeBoundingBox();
      const center = geometry.boundingBox!.getCenter(new THREE.Vector3());
      const source = o.material as THREE.MeshLambertMaterial;
      const material = this.models.assets.batchMaterial(source);
      const colors = new Float32Array(geometry.getAttribute('position').count * 3);
      for (let i = 0; i < colors.length; i += 3) {
        colors[i] = source.color.r;
        colors[i + 1] = source.color.g;
        colors[i + 2] = source.color.b;
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const key = `${material.uuid}:${Math.floor(center.x / 96)}:${Math.floor(center.z / 96)}:${o.castShadow}`;
      if (!batches.has(key))
        batches.set(key, { material, geometries: [], castShadow: o.castShadow });
      batches.get(key)!.geometries.push(geometry);
      originals.push(o.geometry);
    });
    this.group.clear();
    this.group.add(...terrain);
    for (const geo of originals) geo.dispose();
    for (const { material, geometries, castShadow } of batches.values()) {
      const merged = mergeGeometries(geometries);
      if (merged) {
        const mesh = new THREE.Mesh(merged, material);
        mesh.castShadow = castShadow;
        mesh.receiveShadow = true;
        this.group.add(mesh);
      }
      for (const g of geometries) g.dispose();
    }
  }
}
