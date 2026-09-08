import * as THREE from 'three';
import { ModelFactory, type PersonModel } from '../assets/ModelFactory';
import { Input } from '../core/Input';
import { CollisionWorld } from '../world/CollisionWorld';
import type { Point } from '../core/math';
import type { HeightSurface } from '../world/TravelSurface';
import { ENTITY_SCALE } from './dimensions';
export class Player {
  readonly model: PersonModel;
  readonly position = new THREE.Vector3();
  private gait = 0;
  moving = false;
  constructor(
    factory: ModelFactory,
    p: Point,
    private terrain: HeightSurface,
  ) {
    this.model = factory.person(0xe2d3af, 0xc99874, 0x3c302b, 'player');
    this.model.group.scale.multiplyScalar(ENTITY_SCALE);
    this.teleport(p);
  }
  get object(): THREE.Group {
    return this.model.group;
  }
  teleport(p: Point): void {
    this.position.set(p.x, this.terrain.heightAt(p.x, p.z) + 0.12, p.z);
    this.object.position.copy(this.position);
  }
  update(dt: number, input: Input, collision: CollisionWorld, cameraYaw: number): void {
    const forward = input.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']),
      right = input.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);
    const length = Math.hypot(forward, right),
      speed = input.down('ShiftLeft', 'ShiftRight') ? 13 : 7.5;
    const dx = length
      ? ((-Math.sin(cameraYaw) * forward + Math.cos(cameraYaw) * right) / length) * speed * dt
      : 0;
    const dz = length
      ? ((-Math.cos(cameraYaw) * forward - Math.sin(cameraYaw) * right) / length) * speed * dt
      : 0;
    const next = collision.move(this.position, dx, dz, 0.48 * ENTITY_SCALE);
    this.moving = length > 0;
    this.position.x = next.x;
    this.position.z = next.z;
    this.position.y = this.terrain.heightAt(next.x, next.z) + 0.12;
    this.object.position.copy(this.position);
    if (length) {
      this.object.rotation.y = Math.atan2(dx, dz);
      this.gait += dt * speed * 1.25;
    }
    this.model.limbs.forEach(
      (limb, i) =>
        (limb.rotation.x = this.moving
          ? Math.sin(this.gait + (i < 2 ? 0 : Math.PI)) * (i % 2 === 0 ? 0.55 : -0.45)
          : 0),
    );
  }
}
