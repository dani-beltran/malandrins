import * as THREE from 'three';
import { ModelFactory } from '../assets/ModelFactory';
import { bridgePoint, locateOnBridge } from './BridgeLayout';
import { TravelSurface, type Bridge } from './TravelSurface';
import { CollisionWorld } from './CollisionWorld';
import { closestOnSegment, distance, rectangle, type Point } from '../core/math';
import type { MapAdapter } from './MapAdapter';

/** Blender arch shells supply the masonry. Decks, approaches and barriers share the
 * same travel surface as the player; the river remains on the survey below. */
export class BridgeScenery {
  readonly group = new THREE.Group();
  constructor(
    private surface: TravelSurface,
    private models: ModelFactory,
    private collision: CollisionWorld,
    private map: MapAdapter,
  ) {}

  build(): THREE.Group {
    for (const bridge of this.surface.bridges) {
      this.deck(bridge);
      this.arch(bridge);
      this.edges(bridge);
    }
    return this.group;
  }

  private deck(b: Bridge): void {
    const sections = this.surface.sections(b, b.approachStart, b.approachEnd, 2);
    for (let i = 1; i < sections.length; i++) {
      const ps = [
        bridgePoint(b, sections[i - 1], -b.width / 2),
        bridgePoint(b, sections[i], -b.width / 2),
        bridgePoint(b, sections[i], b.width / 2),
        bridgePoint(b, sections[i - 1], b.width / 2),
      ];
      const mesh = new THREE.Mesh(
        this.surface.drapeGeometry(ps, 0.035),
        this.models.assets.material(0xc6b99e),
      );
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  private arch(bridge: Bridge): void {
    const length = bridge.end - bridge.start;
    const nominal = bridge.modelSpan;
    const model = this.models.assets.customModel(`bridge-stone-${nominal}`);
    if (!model) throw new Error(`Missing Blender bridge model: bridge-stone-${nominal}`);
    model.updateMatrixWorld(true);
    const sourceDepth = -new THREE.Box3().setFromObject(model).min.y;
    const verticalScale = sourceDepth > 0 ? Math.min(1, bridge.masonryDepth / sourceDepth) : 1;
    model.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      // Bake export transforms and fit beneath the existing road. Compress around
      // the authored deck top (Y=0); barriers retain their normal human height.
      const source = o.geometry.clone().applyMatrix4(o.matrixWorld);
      const geometry = sliceShell(
        source,
        this.surface
          .sections(bridge, bridge.start, bridge.end, 1.5)
          .map((s) => ((s - bridge.start) / length - 0.5) * nominal),
      );
      source.dispose();
      const positions = geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        const side = (positions.getX(i) * bridge.width) / 5;
        const along = bridge.start + (positions.getZ(i) / nominal + 0.5) * length;
        const p = bridgePoint(bridge, along, side);
        positions.setXYZ(
          i,
          p.x,
          this.surface.gridHeightAt(p.x, p.z) + positions.getY(i) * verticalScale,
          p.z,
        );
      }
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, o.material);
      mesh.name = `${bridge.id}:masonry`;
      mesh.userData.verticalScale = verticalScale;
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
    });
  }

  private edgePoint(b: Bridge, d: number, side: number): Point {
    return bridgePoint(b, d, side * (b.width / 2 - 0.12));
  }

  private edges(b: Bridge): void {
    const sections = this.surface.sections(b, b.approachStart, b.approachEnd, 1);
    for (const side of [-1, 1]) {
      for (let i = 1; i < sections.length; i++) {
        const a = this.edgePoint(b, sections[i - 1], side),
          c = this.edgePoint(b, sections[i], side);
        const mid = { x: (a.x + c.x) / 2, z: (a.z + c.z) / 2 };
        // Leave side-road junctions open at their existing road elevation.
        const onDeck = sections[i] > b.start && sections[i - 1] < b.end;
        if (
          this.surface.bridges.some((other) => {
            if (other === b) return false;
            const q = locateOnBridge(other, mid);
            return (
              q.distance < other.width / 2 - 0.1 &&
              q.along > other.approachStart + 1 &&
              q.along < other.approachEnd - 1
            );
          })
        )
          continue;
        if (this.sideRoadAt(b, mid)) continue;
        const ya = this.surface.heightAt(a.x, a.z),
          yc = this.surface.heightAt(c.x, c.z);
        const len = distance(a, c),
          angle = Math.atan2(c.x - a.x, c.z - a.z);
        this.collision.add(rectangle(mid.x, mid.z, 0.18, len + 0.12, angle));
        for (const h of [0.45, 0.86]) this.beam(a, ya + h, c, yc + h, 0.025, 0x51534a);
        this.beam(a, ya + 0.12, c, yc + 0.12, 0.15, 0xa89b7f);
        // Small foundation cheeks meet the bank along the approaches.
        if (!onDeck) this.retainingFace(a, c, ya, yc);
      }
      const posts = this.surface.sections(b, b.approachStart, b.approachEnd, 3);
      for (const d of posts) {
        const p = this.edgePoint(b, d, side);
        if (this.sideRoadAt(b, p)) continue;
        const y = this.surface.heightAt(p.x, p.z);
        this.group.add(this.models.box(0.065, 1.05, 0.065, 0x55574e, p.x, y + 0.6, p.z));
        this.group.add(this.models.box(0.073, 0.2, 0.073, 0x9b4f44, p.x, y + 1.1, p.z));
      }
    }
  }

  private sideRoadAt(b: Bridge, p: Point): boolean {
    for (const road of this.map.roads) {
      // A point on a continuation of this route is not a side junction.
      if (road.points.every((q) => locateOnBridge(b, q).distance < 0.1)) continue;
      for (let i = 1; i < road.points.length; i++)
        if (
          distance(p, closestOnSegment(p, road.points[i - 1], road.points[i])) <
          road.width / 2 + 0.5
        )
          return true;
    }
    return false;
  }

  private beam(a: Point, ya: number, b: Point, yb: number, thickness: number, color: number): void {
    const start = new THREE.Vector3(a.x, ya, a.z),
      end = new THREE.Vector3(b.x, yb, b.z);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(thickness, thickness, start.distanceTo(end)),
      this.models.assets.material(color),
    );
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), end.sub(start).normalize());
    mesh.castShadow = true;
    this.group.add(mesh);
  }

  private retainingFace(a: Point, b: Point, ya: number, yb: number): void {
    const ga = this.surface.terrain.heightAt(a.x, a.z) - 0.2,
      gb = this.surface.terrain.heightAt(b.x, b.z) - 0.2;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [a.x, ya, a.z, b.x, yb, b.z, a.x, ga, a.z, b.x, yb, b.z, b.x, gb, b.z, a.x, ga, a.z],
        3,
      ),
    );
    geometry.computeVertexNormals();
    const material = this.models.assets.material(0xa89b7e);
    material.side = THREE.DoubleSide;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    this.group.add(mesh);
  }
}

/** Split long Blender faces before bending, including exact road corners. */
function sliceShell(source: THREE.BufferGeometry, cuts: number[]): THREE.BufferGeometry {
  const vertices: number[] = [],
    positions = source.getAttribute('position'),
    index = source.index;
  const clip = (ps: THREE.Vector3[], boundary: number, sign: number): THREE.Vector3[] => {
    const result: THREE.Vector3[] = [];
    for (let i = 0; i < ps.length; i++) {
      const a = ps[i],
        b = ps[(i + 1) % ps.length],
        da = sign * (a.z - boundary),
        db = sign * (b.z - boundary);
      if (da >= -1e-7) result.push(a);
      if ((da > 0 && db < 0) || (da < 0 && db > 0)) result.push(a.clone().lerp(b, da / (da - db)));
    }
    return result;
  };
  for (let i = 0; i < (index?.count ?? positions.count); i += 3) {
    const triangle = [0, 1, 2].map((j) =>
      new THREE.Vector3().fromBufferAttribute(positions, index ? index.getX(i + j) : i + j),
    );
    // The exact travel-grid mesh supplies the paving. A second, coarser Blender
    // top can cut through it after fitting to uneven banks, especially when low.
    if (triangle.every((p) => Math.abs(p.y) < 1e-5)) continue;
    const min = Math.min(...triangle.map((p) => p.z)),
      max = Math.max(...triangle.map((p) => p.z));
    const localCuts = [
      min - 1e-5,
      ...cuts.filter((c) => c > min + 1e-5 && c < max - 1e-5),
      max + 1e-5,
    ];
    for (let j = 1; j < localCuts.length; j++) {
      const polygon = clip(clip(triangle, localCuts[j - 1], 1), localCuts[j], -1);
      for (let k = 1; k + 1 < polygon.length; k++)
        for (const p of [polygon[0], polygon[k], polygon[k + 1]]) vertices.push(p.x, p.y, p.z);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  return geometry;
}
