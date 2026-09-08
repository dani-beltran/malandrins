import * as THREE from 'three';
import { sceneryLayout as layout, landmarkFootprints } from './SceneryLayout';
import { ModelFactory } from '../assets/ModelFactory';
import { Terrain } from './Terrain';
import { MapAdapter } from './MapAdapter';
import { CollisionWorld } from './CollisionWorld';
import { distance, pointInPolygon, seededRandom, rectangle, type Point } from '../core/math';

export const townLayout = layout;
type Building = (typeof layout.buildings)[number];
const points = (ps: number[][]): Point[] => ps.map(([x, z]) => ({ x, z }));

/** Authored block envelopes replace roadside infill. Geometry and collision
 * consume the same footprints; no generated house is allowed to invent a gap. */
export class TownScenery {
  readonly outlines: Point[][] = [];
  readonly group = new THREE.Group();
  private random = seededRandom(86231);
  private railing: THREE.MeshLambertMaterial;
  constructor(
    private map: MapAdapter,
    private terrain: Terrain,
    private models: ModelFactory,
    private collision: CollisionWorld,
  ) {
    this.railing = models.assets.material(0xffffff, 'iron-railing');
    this.railing.alphaTest = 0.5;
    this.railing.side = THREE.DoubleSide;
  }
  build(): THREE.Group {
    for (const b of layout.buildings) this.building(b);
    for (const b of layout.landmarks) this.landmark(b);
    this.publicSpaces();
    this.orchards();
    return this.group;
  }
  private mesh(
    geometry: THREE.BufferGeometry,
    color: string | number,
    texture?: string,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, this.models.assets.material(color, texture));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
  private building(b: Building): void {
    const ps = points(b.points);
    const ground = this.terrain.footprintRange(ps);
    const cx = ps.reduce((n, p) => n + p.x, 0) / ps.length,
      cz = ps.reduce((n, p) => n + p.z, 0) / ps.length;
    const top = Math.max(this.terrain.heightAt(cx, cz) + b.height, ground.max + 2.1);
    const shape = new THREE.Shape(ps.map((p) => new THREE.Vector2(p.x, -p.z)));
    const body = new THREE.ExtrudeGeometry(shape, {
      depth: top - ground.min + 0.25,
      bevelEnabled: false,
      curveSegments: 1,
    });
    body.rotateX(-Math.PI / 2);
    body.translate(0, ground.min - 0.25, 0);
    // World-sized plaster UVs avoid stretching a facade image across whole blocks.
    const uv = body.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 4, uv.getY(i) / 4);
    this.group.add(this.mesh(body, b.color, 'plaster'));
    this.roof(ps, b.axis, top, b.style === 'industrial' ? 0.18 : 0.95);
    const area = ps.reduce((v, a, i) => {
      const q = ps[(i + 1) % ps.length];
      return v + a.x * q.z - q.x * a.z;
    }, 0);
    for (const i of b.facadeEdges) {
      const a = ps[area > 0 ? (i + 1) % ps.length : i],
        c = ps[area > 0 ? i : (i + 1) % ps.length];
      this.facade(a, c, top, b);
    }
    this.collision.add(ps);
    this.outlines.push(ps);
    if (b.id.startsWith('garden-home')) this.garden(ps);
  }
  private roof(ps: Point[], axis: number[], top: number, rise: number): void {
    const length = Math.hypot(...axis),
      nx = -axis[1] / length,
      nz = axis[0] / length;
    const values = ps.map((p) => p.x * nx + p.z * nz),
      lo = Math.min(...values),
      hi = Math.max(...values),
      mid = (lo + hi) / 2;
    const roofY = (p: Point) =>
      top +
      rise * Math.max(0, 1 - Math.abs(p.x * nx + p.z * nz - mid) / Math.max(0.1, (hi - lo) / 2));
    const verts: number[] = [],
      uv: number[] = [];
    const triangle = (a: Point, b: Point, c: Point) => {
      // Shape triangulation winding in XZ is reversed for an upward normal.
      const cross = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
      for (const p of cross > 0 ? [a, c, b] : [a, b, c]) {
        verts.push(p.x, roofY(p), p.z);
        uv.push(p.x / 3, p.z / 3);
      }
    };
    for (const side of [-1, 1]) {
      const poly: Point[] = [];
      for (let i = 0; i < ps.length; i++) {
        const a = ps[i],
          b = ps[(i + 1) % ps.length],
          da = side * (a.x * nx + a.z * nz - mid),
          db = side * (b.x * nx + b.z * nz - mid);
        if (da >= 0) poly.push(a);
        if (da >= 0 !== db >= 0) {
          const t = da / (da - db);
          poly.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
        }
      }
      if (poly.length >= 3)
        for (const face of THREE.ShapeUtils.triangulateShape(
          poly.map((p) => new THREE.Vector2(p.x, p.z)),
          [],
        ))
          triangle(poly[face[0]], poly[face[1]], poly[face[2]]);
    }
    for (let i = 0; i < ps.length; i++) {
      const a = ps[i],
        b = ps[(i + 1) % ps.length];
      for (const v of [
        [a.x, top, a.z],
        [a.x, roofY(a), a.z],
        [b.x, roofY(b), b.z],
        [a.x, top, a.z],
        [b.x, roofY(b), b.z],
        [b.x, top, b.z],
      ]) {
        verts.push(...v);
        uv.push(v[0] / 3, v[2] / 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    const mat = this.models.assets.material(
      [0xc6a07b, 0xb48c6b, 0xcfb08a, 0xb7a08a][Math.floor(this.random() * 4)],
      'roof',
    );
    mat.side = THREE.DoubleSide;
    const roof = new THREE.Mesh(geo, mat);
    roof.castShadow = true;
    roof.receiveShadow = true;
    this.group.add(roof);
  }
  private plane(
    group: THREE.Group,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    texture: string,
  ): THREE.Mesh {
    const mesh = this.mesh(new THREE.PlaneGeometry(w, h), 0xffffff, texture);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }
  private facade(a: Point, b: Point, top: number, building: Building): void {
    const w = distance(a, b);
    if (w < 1.6) return;
    const y = this.terrain.heightAt((a.x + b.x) / 2, (a.z + b.z) / 2) + 0.12;
    const group = new THREE.Group();
    group.position.set((a.x + b.x) / 2, y, (a.z + b.z) / 2);
    group.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
    const h = top - y,
      terrace = building.style === 'terrace',
      worn = building.style === 'worn';
    const baseColor = terrace ? 0xd2c093 : worn ? 0xa7a18f : 0xb7ac97;
    group.add(
      this.models.box(w, 0.7, 0.07, baseColor, 0, 0.35, 0.025, worn ? 'masonry' : undefined),
    );
    if (terrace) {
      group.add(this.models.box(w, 2.5, 0.06, 0x9c8373, 0, 4.5, 0.022));
      group.add(this.models.box(w, 0.18, 0.22, 0xe5d9b8, 0, 3.12, 0.08));
    }
    const columns = Math.max(1, Math.floor(w / 2.2)),
      step = w / columns;
    for (let floor = 1; floor < building.floors; floor++) {
      const wy = floor * 2.15 + 1.04;
      if (wy + 0.72 > h - 0.18) continue;
      for (let col = 0; col < columns; col++) {
        const x = -w / 2 + step * (col + 0.5),
          width = Math.min(1.08, step * 0.64);
        const kind = worn ? 'barred' : (col + floor) % 3 === 0 ? 'open' : 'shutter';
        this.plane(group, x, wy, 0.061, width, 1.38, `window-${kind}`);
        group.add(this.models.box(width + 0.12, 0.09, 0.21, 0xd3c9b7, x, wy - 0.71, 0.12));
        if (!worn && (floor === 1 || terrace) && step > 1.65) {
          const bw = Math.min(step - 0.15, width + 0.54);
          group.add(this.models.box(bw, 0.09, 0.51, 0xc3bcad, x, wy - 0.75, 0.27));
          const front = new THREE.Mesh(new THREE.PlaneGeometry(bw, 0.69), this.railing);
          front.position.set(x, wy - 0.35, 0.51);
          group.add(front);
          for (const side of [-1, 1]) {
            const rail = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.69), this.railing);
            rail.position.set(x + (side * bw) / 2, wy - 0.35, 0.26);
            rail.rotation.y = Math.PI / 2;
            group.add(rail);
          }
        }
      }
    }
    const doorType = worn ? 'green' : terrace ? 'garage' : this.random() > 0.5 ? 'wood' : 'garage';
    const doorW = Math.min(w * 0.4, doorType === 'garage' ? 1.9 : 0.98),
      doorX = columns > 1 ? -w * 0.25 : 0;
    this.plane(group, doorX, 1.01, 0.082, doorW, 1.99, `door-${doorType}`);
    if (columns > 1)
      this.plane(
        group,
        w * 0.25,
        1.3,
        0.084,
        Math.min(0.83, w * 0.25),
        0.86,
        `window-${worn ? 'barred' : 'shutter'}`,
      );
    group.add(this.models.box(w + 0.1, 0.13, 0.28, 0xc4b9a2, 0, h - 0.07, 0.1));
    if (w > 2.8) {
      group.add(this.models.box(0.06, h, 0.07, 0x8f9185, -w / 2 + 0.12, h / 2, 0.12));
      group.add(this.models.box(w, 0.026, 0.028, 0x4a4d41, 0, Math.min(2.65, h - 0.4), 0.125));
    }
    if (worn) {
      const chip = new THREE.Mesh(
        new THREE.PlaneGeometry(w * 0.24, 0.45),
        this.models.assets.material(0xb1aa96, 'masonry'),
      );
      chip.position.set(w * 0.32, 0.66, 0.084);
      group.add(chip);
    }
    this.group.add(group);
  }
  private landmark(b: (typeof layout.landmarks)[number]): void {
    const model = this.models.assets.customModel(b.id);
    if (!model) throw new Error(`Scenery model missing: ${b.id}`);
    const [x, z] = b.position;
    model.position.set(x, this.terrain.heightAt(x, z) + 0.12, z);
    model.rotation.y = b.rotation;
    this.group.add(model);
    for (const ps of landmarkFootprints(b)) {
      this.collision.add(ps);
      this.outlines.push(ps);
    }
    if (b.id === 'church') {
      for (const u of [-4.6, 4.6]) {
        const p = {
          x: x + Math.cos(b.rotation) * u + Math.sin(b.rotation) * 1.2,
          z: z - Math.sin(b.rotation) * u + Math.cos(b.rotation) * 1.2,
        };
        this.tree(p, 'cypress', 0.9);
      }
    }
    if (b.id === 'townhall') {
      for (const u of [-2.3, 0, 2.3]) {
        const p = {
          x: x + Math.cos(b.rotation) * u + Math.sin(b.rotation) * 1.0,
          z: z - Math.sin(b.rotation) * u + Math.cos(b.rotation) * 1.0,
        };
        this.planter(p);
      }
    }
  }
  private surface(ps: Point[], texture: string, offset = 0.1): void {
    const geometry = this.terrain.drapeGeometry(ps, offset),
      uv = geometry.getAttribute('uv');
    const repeat = texture === 'paving' ? 6.5 : texture === 'sidewalk' ? 5 : 1;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * repeat, uv.getY(i) * repeat);
    const mesh = this.mesh(geometry, 0xffffff, texture);
    mesh.castShadow = false;
    this.group.add(mesh);
  }
  private tree(p: Point, kind: 'olive' | 'cypress' | 'palm' | 'street' = 'olive', size = 1): void {
    const g = new THREE.Group();
    g.position.set(p.x, this.terrain.heightAt(p.x, p.z), p.z);
    if (kind === 'cypress') {
      g.add(this.models.box(0.23, 2.5, 0.23, 0x78674d, 0, 1.25));
      const crown = this.mesh(new THREE.IcosahedronGeometry(1.0, 1), 0x425d35);
      crown.scale.set(0.76, 3.9, 0.76);
      crown.position.y = 4;
      g.add(crown);
    } else if (kind === 'palm') {
      const trunk = this.mesh(new THREE.CylinderGeometry(0.2, 0.3, 6.3, 6), 0x9a8970);
      trunk.position.y = 3.15;
      g.add(trunk);
      for (let i = 0; i < 9; i++) {
        const angle = (i * Math.PI * 2) / 9,
          r = 3.5;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(
            [
              0,
              6.5,
              0,
              Math.sin(angle - 0.1) * r * 0.62,
              7.15,
              Math.cos(angle - 0.1) * r * 0.62,
              Math.sin(angle) * r,
              5.8,
              Math.cos(angle) * r,
              Math.sin(angle + 0.1) * r * 0.62,
              7.15,
              Math.cos(angle + 0.1) * r * 0.62,
            ],
            3,
          ),
        );
        geo.setIndex([0, 1, 2, 0, 2, 3]);
        geo.computeVertexNormals();
        const leaf = this.mesh(geo, 0x6e8347);
        (leaf.material as THREE.Material).side = THREE.DoubleSide;
        g.add(leaf);
      }
    } else {
      g.add(this.models.box(0.24, 2.5, 0.27, 0x776b54, 0, 1.25));
      for (const [x, y, z, s] of [
        [0, 3.1, 0, 1.4],
        [-0.9, 2.8, 0.25, 1.1],
        [0.8, 3.0, -0.25, 1.2],
      ]) {
        const mesh = this.mesh(
          new THREE.IcosahedronGeometry(s, 0),
          kind === 'street' ? 0x658340 : 0x7e895b,
        );
        mesh.position.set(x, y, z);
        mesh.scale.y = 0.75;
        g.add(mesh);
      }
    }
    g.scale.setScalar(size);
    this.group.add(g);
  }
  private planter(p: Point): void {
    const y = this.terrain.heightAt(p.x, p.z);
    const pot = this.mesh(new THREE.CylinderGeometry(0.48, 0.27, 0.53, 8), 0x777d64);
    pot.position.set(p.x, y + 0.27, p.z);
    this.group.add(pot);
    const bush = this.mesh(new THREE.IcosahedronGeometry(0.6, 0), 0x54744b);
    bush.position.set(p.x, y + 0.96, p.z);
    this.group.add(bush);
  }
  private wall(a: Point, b: Point, h: number, color = 0xb4a28a): void {
    const length = distance(a, b),
      count = Math.max(1, Math.ceil(length / 3));
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count,
        x = a.x + (b.x - a.x) * t,
        z = a.z + (b.z - a.z) * t,
        y = this.terrain.heightAt(x, z);
      const wall = this.models.box(
        length / count + 0.03,
        h,
        0.35,
        color,
        x,
        y + h / 2,
        z,
        'masonry',
      );
      wall.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
      this.group.add(wall);
    }
  }
  private bench(p: Point, angle = 0): void {
    const g = new THREE.Group();
    g.position.set(p.x, this.terrain.heightAt(p.x, p.z), p.z);
    g.rotation.y = angle;
    for (const x of [-0.7, 0.7]) g.add(this.models.box(0.09, 0.52, 0.43, 0x414b42, x, 0.26));
    for (let i = 0; i < 3; i++)
      g.add(this.models.box(1.9, 0.07, 0.12, 0xa95643, 0, 0.54, i * 0.14 - 0.14));
    for (let i = 0; i < 2; i++)
      g.add(this.models.box(1.9, 0.14, 0.065, 0xa95643, 0, 0.78 + i * 0.18, -0.23));
    this.group.add(g);
  }
  private garden(ps: Point[]): void {
    // Garden walls stay clear of the nearest road and do not create sealed spawn areas.
    const center = {
      x: ps.reduce((n, p) => n + p.x, 0) / ps.length,
      z: ps.reduce((n, p) => n + p.z, 0) / ps.length,
    };
    for (let i = 0; i < ps.length; i++) {
      const a = ps[i],
        b = ps[(i + 1) % ps.length];
      const expand = (p: Point) => ({
        x: center.x + (p.x - center.x) * 1.38,
        z: center.z + (p.z - center.z) * 1.38,
      });
      const aa = expand(a),
        bb = expand(b),
        mid = { x: (aa.x + bb.x) / 2, z: (aa.z + bb.z) / 2 },
        near = this.map.nearestRoad(mid);
      if (near.distance > near.road.width / 2 + 2 && !this.collision.blocked(mid, 0.3))
        this.wall(aa, bb, 0.6, 0xdbd9c9);
    }
  }
  private publicSpaces(): void {
    for (const s of layout.squares) this.surface(points(s.points), s.material, 0.13);
    for (const apron of layout.aprons) this.surface(points(apron), 'sidewalk', 0.12);
    // Portal: masonry terrace, red benches, plane trees, fountain, small playground.
    const portal = this.map.project([-0.00054, 40.10057]);
    this.wall({ x: portal.x - 5, z: portal.z - 7 }, { x: portal.x + 3, z: portal.z + 7 }, 1.4);
    for (const [dx, dz] of [
      [-3, -5],
      [-4, 3],
      [1, 7],
    ]) {
      const p = { x: portal.x + dx, z: portal.z + dz };
      this.tree(p, 'street', 1.65);
    }
    this.bench({ x: portal.x + 3, z: portal.z + 2 }, 0.2);
    const fountain = this.models.box(
      0.8,
      1.3,
      0.45,
      0xc5bda8,
      portal.x + 4,
      this.terrain.heightAt(portal.x + 4, portal.z - 5) + 0.65,
      portal.z - 5,
      'masonry',
    );
    this.group.add(fountain);
    this.wall(this.map.project([-0.00056, 40.10053]), this.map.project([-0.0006, 40.10078]), 1.65);
    const play = this.map.project([-0.00048, 40.10045]),
      py = this.terrain.heightAt(play.x, play.z);
    const frame = new THREE.Group();
    frame.position.set(play.x, py, play.z);
    for (const x of [-1.2, 1.2]) frame.add(this.models.box(0.1, 2.1, 0.1, 0xa95643, x, 1.05, 0));
    frame.add(
      this.models.box(2.6, 0.12, 0.12, 0xa95643, 0, 2.1),
      this.models.box(0.75, 0.07, 0.33, 0x50796a, 0, 0.53),
    );
    for (const x of [-0.3, 0.3]) frame.add(this.models.box(0.025, 1.54, 0.025, 0x696b5c, x, 1.3));
    this.group.add(frame);
    // Hospital square's small colored play surface and pruned trees.
    const hospital = this.map.project([-0.00124, 40.10317]);
    this.tree(hospital, 'street', 0.9);
    this.bench({ x: hospital.x + 2.7, z: hospital.z });
    // Calvari's rising garden has a recognisable line of cypresses and retaining wall.
    const calvari = this.map.project([-0.00191, 40.10348]);
    for (let i = 0; i < 7; i++)
      this.tree(
        { x: calvari.x + 4 - i * 0.9, z: calvari.z - i * 4.0 },
        'cypress',
        0.8 + (i % 2) * 0.1,
      );
    this.wall(
      { x: calvari.x - 1, z: calvari.z + 4 },
      { x: calvari.x - 7, z: calvari.z - 28 },
      1.2,
      0xc09c7f,
    );
    // Palm-lined Molí de Foc approach.
    const moli = this.map.project([-0.00158, 40.0987]);
    for (let i = 0; i < 5; i++)
      this.tree({ x: moli.x + 6 + i * 2.6, z: moli.z - i * 8 }, 'palm', 0.9);
    this.schoolEntrance();
    // Fine street furniture follows measured curb offsets rather than broad generic pavements.
    for (const road of this.map.roads) {
      if (
        ![
          "carrer d'Enmig",
          'Carrer de Baix la Vila',
          'Carrer Cabanes',
          'Carrer de les Eres',
        ].includes(road.name)
      )
        continue;
      for (let i = 1; i < road.points.length; i++) {
        const a = road.points[i - 1],
          b = road.points[i],
          len = distance(a, b);
        for (let d = 2; d < len; d += 7)
          for (const side of [-1, 1]) {
            const offset = road.width / 2 + road.sidewalk * 0.42;
            const p = {
              x: a.x + ((b.x - a.x) * d) / len + (((b.z - a.z) * offset) / len) * side,
              z: a.z + ((b.z - a.z) * d) / len - (((b.x - a.x) * offset) / len) * side,
            };
            if (this.collision.blocked(p, 0.23)) continue;
            const y = this.terrain.heightAt(p.x, p.z);
            if (road.surface === 'paving') {
              const bollard = this.mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.69, 5), 0x4d554c);
              bollard.position.set(p.x, y + 0.35, p.z);
              this.group.add(bollard);
            }
            if (side === 1 && Math.floor(d / 7) % 3 === 0) {
              const lamp = this.models.lamp();
              lamp.scale.setScalar(0.69);
              lamp.position.set(p.x, y, p.z);
              this.group.add(lamp);
            }
          }
      }
    }
  }
  private schoolEntrance(): void {
    const p = this.map.project([-0.00166, 40.101286]),
      g = new THREE.Group();
    g.position.set(p.x, this.terrain.heightAt(p.x, p.z) + 0.1, p.z);
    g.rotation.y = (110 * Math.PI) / 180;
    const solid = (x: number, z: number, w: number, d: number, h: number, color: number) => {
      g.add(this.models.box(w, h, d, color, x, h / 2, z));
      const center = {
        x: p.x + Math.cos(g.rotation.y) * x + Math.sin(g.rotation.y) * z,
        z: p.z - Math.sin(g.rotation.y) * x + Math.cos(g.rotation.y) * z,
      };
      const poly = rectangle(center.x, center.z, w, d, g.rotation.y);
      this.collision.add(poly);
      this.outlines.push(poly);
    };
    solid(-0.8, -2.1, 6.5, 0.2, 2.65, 0xb9bdb1);
    solid(-4.4, -1.05, 0.25, 2.3, 2.8, 0xc8c5b9);
    solid(1.9, -1.0, 0.25, 2.5, 2.8, 0xc8c5b9);
    g.add(this.models.box(9.2, 0.32, 4.6, 0xcac8ba, 0, 2.83, -1.9));
    g.add(this.models.box(9.0, 0.65, 0.34, 0xa89d84, 0, 3.23, -2.8, 'masonry'));
    for (let i = 0; i < 24; i++)
      g.add(this.models.box(0.025, 1.0, 0.035, 0x444c42, -4.4 + i * 0.38, 3.98, -2.68));
    for (let i = 0; i < 7; i++) {
      const h = (i + 1) * 0.38,
        z = 0.35 - i * 0.53;
      g.add(this.models.box(1.72, h, 0.56, 0xcac5b5, 3.04, h / 2, z));
      g.add(
        this.models.box(
          0.04,
          0.95,
          0.04,
          [0xad594b, 0x4e7c66, 0xe0b650, 0x587da0][i % 4],
          3.85,
          h + 0.5,
          z,
        ),
      );
    }
    this.plane(g, -0.75, 1.1, -1.98, 1.1, 2.05, 'door-green');
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const c = canvas.getContext('2d')!;
    c.fillStyle = '#eee9d9';
    c.fillRect(0, 0, 512, 96);
    c.fillStyle = '#394b42';
    c.font = 'bold 33px sans-serif';
    c.textAlign = 'center';
    c.fillText('EL TRESCAIRE', 256, 39);
    c.font = '19px sans-serif';
    c.fillText('AULARI DE LA POBLA TORNESA', 256, 72);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.models.assets.textures.set('school-sign', texture);
    this.plane(g, -0.6, 2.35, 0.025, 2.5, 0.48, 'school-sign');
    this.group.add(g);
  }
  private orchards(): void {
    for (const area of layout.orchards) {
      const ps = points(area),
        minX = Math.min(...ps.map((p) => p.x)),
        maxX = Math.max(...ps.map((p) => p.x)),
        minZ = Math.min(...ps.map((p) => p.z)),
        maxZ = Math.max(...ps.map((p) => p.z));
      for (let x = minX + 2; x < maxX; x += 5.1)
        for (let z = minZ + 2; z < maxZ; z += 5.4) {
          const p = { x: x + (this.random() - 0.5) * 0.6, z: z + (this.random() - 0.5) * 0.6 },
            near = this.map.nearestRoad(p);
          if (
            pointInPolygon(p, ps) &&
            !this.collision.blocked(p, 2) &&
            near.distance > near.road.width / 2 + 2.0
          )
            this.tree(p, 'olive', 0.65 + this.random() * 0.25);
        }
    }
  }
}
