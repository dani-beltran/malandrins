import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MapAdapter, type Road } from './MapAdapter';
import { CollisionWorld } from './CollisionWorld';
import { Terrain } from './Terrain';
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
    for (const area of this.map.areas)
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
    for (const b of this.map.buildings) {
      const height = b.type === 'industrial' ? 8 : b.type === 'ruins' ? 2 : 7 + this.random() * 5;
      const ground = this.terrain.footprintRange(b.points);
      this.polygon(
        b.points,
        b.name.startsWith('Ajuntament') ? 0xdbcaac : 0xc6b89b,
        ground.min - 0.3,
        height + ground.max - ground.min + 0.3,
      );
      this.polygon(b.points, 0xa8674e, ground.max + height + 0.1, 0.4);
      this.collision.add(b.points);
      this.buildingOutlines.push(b.points);
    }
    this.infill();
    this.landscape();
    this.landmarks();
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
          this.models.assets.material(0x8d9975),
        );
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
    const mesh = new THREE.Mesh(
      this.terrain.drapeGeometry(points, y),
      this.models.assets.material(texture ? 0xffffff : color, texture),
    );
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }
  private polygon(points: Point[], color: number, y: number, height = 0): void {
    if (points.length < 3) return;
    const shape = new THREE.Shape(points.map((p) => new THREE.Vector2(p.x, -p.z)));
    const geometry = height
      ? new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false })
      : new THREE.ShapeGeometry(shape);
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, this.models.assets.material(color));
    mesh.position.y = y;
    mesh.receiveShadow = true;
    mesh.castShadow = height > 0;
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
    if (!trail) this.ribbon(road.points, road.width + 2.6, 0xc1baa2, 0.055);
    this.ribbon(
      road.points,
      road.width,
      trail ? 0xb0a38a : 0x656f6c,
      0.085,
      trail ? undefined : 'asphalt',
    );
    if (road.width >= 9)
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
  private infill(): void {
    const palette = [0xddc7a5, 0xc4bba4, 0xe2d7b9, 0xbea98d, 0xd5ae8b, 0xaebba9, 0xd9c7b0];
    for (const road of this.map.roads) {
      if (!['residential', 'tertiary', 'living_street'].includes(road.type)) continue;
      for (let i = 1; i < road.points.length; i++) {
        const a = road.points[i - 1],
          b = road.points[i],
          len = distance(a, b),
          dx = (b.x - a.x) / len,
          dz = (b.z - a.z) / len;
        for (let d = 6; d < len - 3; d += 11 + this.random() * 5)
          for (const side of [-1, 1]) {
            const w = 8 + this.random() * 5,
              depth = 7 + this.random() * 5,
              offset = road.width / 2 + depth / 2 + 2.2;
            const x = a.x + dx * d - dz * offset * side,
              z = a.z + dz * d + dx * offset * side;
            if (x < -230 || x > 210 || z < -245 || z > 190) continue;
            const p = { x, z },
              angle = -Math.atan2(dz, dx),
              poly = rectangle(x, z, w, depth, angle);
            if (this.reserved.some((r) => distance(r, p) < Math.hypot(w, depth) / 2 + 6)) continue;
            if (this.collision.blocked(p, Math.hypot(w, depth) / 2 + 0.8)) continue;
            if (
              poly.some((c) => {
                const r = this.map.nearestRoad(c);
                return r.distance < r.road.width / 2 + 1.4;
              })
            )
              continue;
            const h = 5.8 + Math.floor(this.random() * 3) * 2.7,
              color = palette[Math.floor(this.random() * palette.length)];
            const house = new THREE.Group();
            const ground = this.terrain.footprintRange(poly);
            house.position.set(x, ground.max, z);
            house.rotation.y = angle;
            const foundationHeight = ground.max - ground.min + 0.4;
            house.add(
              this.models.box(
                w,
                foundationHeight,
                depth,
                0x9c9785,
                0,
                0.12 - foundationHeight / 2,
                0,
              ),
            );
            house.add(this.models.box(w, h, depth, color, 0, h / 2 + 0.12, 0, 'facade'));
            const verts = new Float32Array([
              -w / 2 - 0.3,
              0,
              -depth / 2 - 0.3,
              w / 2 + 0.3,
              0,
              -depth / 2 - 0.3,
              -w / 2 - 0.3,
              0,
              depth / 2 + 0.3,
              w / 2 + 0.3,
              0,
              depth / 2 + 0.3,
              -w / 2 - 0.3,
              1.9,
              0,
              w / 2 + 0.3,
              1.9,
              0,
            ]);
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
            geo.setIndex([0, 4, 5, 0, 5, 1, 4, 2, 3, 4, 3, 5, 0, 2, 4, 1, 5, 3]);
            geo.computeVertexNormals();
            geo.setAttribute(
              'uv',
              new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 1]), 2),
            );
            const roof = new THREE.Mesh(geo, this.models.assets.material(0xffffff, 'roof'));
            roof.position.y = h + 0.12;
            roof.castShadow = true;
            house.add(roof);
            if (this.random() > 0.55)
              house.add(this.models.box(0.7, 1.8, 0.8, 0xc0ad91, w * 0.27, h + 1.2, -depth * 0.2));
            if (this.random() > 0.7)
              house.add(this.models.box(w * 0.75, 0.13, 1.2, 0x577875, 0, 2.3, depth / 2 + 0.4));
            this.group.add(house);
            this.collision.add(poly);
            this.buildingOutlines.push(poly);
          }
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
      if (Math.abs(x) < 140 && Math.abs(z) < 160 && this.random() > 0.15) continue;
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
  private landmarks(): void {
    for (const [name, coord] of [
      ['BAR RAVAL', [-0.00125, 40.10268]],
      ['CASA DE LA CULTURA', [-0.00071, 40.10066]],
      ['SUPER POBLA', [-0.00075, 40.10205]],
    ] as const) {
      const p = this.map.project(coord),
        r = this.map.nearestRoad(p),
        side = {
          x: r.point.x + Math.cos(r.angle) * (r.road.width / 2 + 1.2),
          z: r.point.z - Math.sin(r.angle) * (r.road.width / 2 + 1.2),
        };
      const ground = this.terrain.heightAt(side.x, side.z);
      const post = this.models.box(0.13, 3.3, 0.13, 0x34443f, side.x, ground + 1.65, side.z);
      this.group.add(post);
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 48;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#203c36';
      ctx.fillRect(0, 0, 256, 48);
      ctx.strokeStyle = '#d9ceab';
      ctx.strokeRect(3, 3, 250, 42);
      ctx.font = 'bold 21px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e9dfbc';
      ctx.fillText(name, 128, 31);
      const tex = new THREE.CanvasTexture(c);
      tex.magFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(5, 0.9, 0.13),
        new THREE.MeshLambertMaterial({ map: tex }),
      );
      sign.position.set(side.x, ground + 3.15, side.z);
      sign.rotation.y = r.angle;
      this.group.add(sign);
    }
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
    const batches = new Map<THREE.Material, THREE.BufferGeometry[]>(),
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
      if (!batches.has(o.material)) batches.set(o.material, []);
      batches.get(o.material)!.push(geometry);
      originals.push(o.geometry);
    });
    this.group.clear();
    this.group.add(...terrain);
    for (const geo of originals) geo.dispose();
    for (const [material, geometries] of batches) {
      const merged = mergeGeometries(geometries);
      if (merged) {
        const mesh = new THREE.Mesh(merged, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.group.add(mesh);
      }
      for (const g of geometries) g.dispose();
    }
  }
}
