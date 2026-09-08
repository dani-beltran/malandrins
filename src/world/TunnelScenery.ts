import * as THREE from 'three';
import type { ModelFactory } from '../assets/ModelFactory';
import { bridgePoint, locateOnBridge, roadDeckWidth } from './BridgeLayout';
import { TunnelSurface, TUNNEL_CLEARANCE, TUNNEL_SLAB, type Tunnel } from './TunnelSurface';
import type { Point } from '../core/math';

/** Concrete box passages with open portals and retaining cheeks on both approaches. */
export class TunnelScenery {
  readonly group = new THREE.Group();
  private concrete: THREE.MeshLambertMaterial;
  constructor(
    private surface: TunnelSurface,
    private models: ModelFactory,
  ) {
    this.concrete = models.assets.material(0xb8b5a6).clone();
    this.concrete.side = THREE.DoubleSide;
  }
  build(): THREE.Group {
    for (const t of this.surface.tunnels) {
      const sections = this.surface.sections(t);
      for (let i = 1; i < sections.length; i++) {
        const a = sections[i - 1],
          b = sections[i];
        const covered = a >= t.start && b <= t.end;
        const leftA = bridgePoint(t, a, -t.width / 2),
          leftB = bridgePoint(t, b, -t.width / 2);
        const rightA = bridgePoint(t, a, t.width / 2),
          rightB = bridgePoint(t, b, t.width / 2);
        const floor = new THREE.Mesh(
          this.surface.terrain.drapeGeometry([leftA, leftB, rightB, rightA], 0.04, this.surface),
          this.models.assets.material(covered ? 0x8c887b : 0xafa38a),
        );
        floor.receiveShadow = true;
        this.group.add(floor);
        for (const side of [-1, 1]) {
          const p = bridgePoint(t, a, (side * t.width) / 2),
            q = bridgePoint(t, b, (side * t.width) / 2);
          const outerP = bridgePoint(t, a, side * (t.width / 2 + 0.5));
          const outerQ = bridgePoint(t, b, side * (t.width / 2 + 0.5));
          const yp = this.surface.heightAt(p.x, p.z),
            yq = this.surface.heightAt(q.x, q.z);
          const topP = this.surface.terrain.heightAt(p.x, p.z),
            topQ = this.surface.terrain.heightAt(q.x, q.z);
          this.face([
            [p, yp - 0.1],
            [q, yq - 0.1],
            [q, topQ],
            [p, topP],
          ]);
          this.face([
            [p, topP],
            [q, topQ],
            [outerQ, topQ],
            [outerP, topP],
          ]);
          this.face([
            [outerP, yp - 0.2],
            [outerQ, yq - 0.2],
            [outerQ, topQ],
            [outerP, topP],
          ]);
        }
        if (covered) {
          const ps = [
            bridgePoint(t, a, -t.width / 2 - 0.5),
            bridgePoint(t, b, -t.width / 2 - 0.5),
            bridgePoint(t, b, t.width / 2 + 0.5),
            bridgePoint(t, a, t.width / 2 + 0.5),
          ];
          const roof = new THREE.Mesh(this.surface.terrain.drapeGeometry(ps, 0.015), this.concrete);
          roof.castShadow = roof.receiveShadow = true;
          this.group.add(roof);
          this.face(ps.map((p) => [p, t.floorHeight + TUNNEL_CLEARANCE]));
        }
      }
      for (const s of [t.start, t.end]) this.portal(t, s);
      this.guardrails(t);
    }
    return this.group;
  }
  private face(vertices: [Point, number][]): void {
    const values: number[] = [];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const [p, y] = vertices[i];
      values.push(p.x, y, p.z);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(values, 3));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, this.concrete);
    mesh.castShadow = mesh.receiveShadow = true;
    this.group.add(mesh);
  }
  private portal(t: Tunnel, s: number): void {
    const left = bridgePoint(t, s, -t.width / 2 - 0.5),
      right = bridgePoint(t, s, t.width / 2 + 0.5);
    const ceiling = t.floorHeight + TUNNEL_CLEARANCE;
    this.face([
      [left, ceiling],
      [right, ceiling],
      [right, this.surface.terrain.heightAt(right.x, right.z)],
      [left, this.surface.terrain.heightAt(left.x, left.z)],
    ]);
    // A white clearance plate echoes the reference without adding a gameplay prompt.
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#e9e7db';
    ctx.fillRect(0, 0, 256, 96);
    ctx.fillStyle = '#343b3b';
    ctx.font = 'bold 64px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('2,50', 128, 70);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.34),
      new THREE.MeshLambertMaterial({ map: texture, side: THREE.DoubleSide }),
    );
    const p = bridgePoint(t, s + (s === t.start ? -0.03 : 0.03));
    sign.position.set(p.x, ceiling + TUNNEL_SLAB / 2, p.z);
    sign.rotation.y = Math.atan2(-(right.z - left.z), right.x - left.x);
    if (s === t.start) sign.rotation.y += Math.PI;
    this.group.add(sign);
  }
  private guardrails(t: Tunnel): void {
    for (const road of t.highways)
      for (let i = 1; i < road.points.length; i++) {
        const a = road.points[i - 1],
          b = road.points[i];
        const length = Math.hypot(b.x - a.x, b.z - a.z);
        const count = Math.max(1, Math.ceil(length / 2));
        for (const side of [-1, 1])
          for (let j = 0; j < count; j++) {
            const point = (fraction: number) => ({
              x:
                a.x +
                (b.x - a.x) * fraction +
                (((b.z - a.z) / length) * side * roadDeckWidth(road)) / 2,
              z:
                a.z +
                (b.z - a.z) * fraction -
                (((b.x - a.x) / length) * side * roadDeckWidth(road)) / 2,
            });
            const p = point(j / count),
              q = point((j + 1) / count);
            if (locateOnBridge(t, p).distance > t.width / 2 + 12) continue;
            const yp = this.surface.terrain.heightAt(p.x, p.z),
              yq = this.surface.terrain.heightAt(q.x, q.z);
            const beam = this.models.box(
              0.13,
              0.28,
              Math.hypot(q.x - p.x, q.z - p.z),
              0x9ca5a0,
              (p.x + q.x) / 2,
              (yp + yq) / 2 + 0.85,
              (p.z + q.z) / 2,
            );
            beam.rotation.set(
              -Math.atan2(yq - yp, length / count),
              Math.atan2(q.x - p.x, q.z - p.z),
              0,
              'YXZ',
            );
            this.group.add(beam, this.models.box(0.12, 0.95, 0.12, 0x777f7b, p.x, yp + 0.48, p.z));
          }
      }
  }
}
