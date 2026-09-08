import * as THREE from 'three';
import { ModelFactory } from '../assets/ModelFactory';
import { Input } from '../core/Input';
import { CollisionWorld } from '../world/CollisionWorld';
import { clamp, type Point } from '../core/math';
import { TravelSurface, type HeightSurface } from '../world/TravelSurface';
import { ENTITY_SCALE } from './dimensions';
export class Vehicle {
  readonly object: THREE.Group;
  speed = 0;
  occupied = false;
  private initial: { position: Point; heading: number };
  constructor(
    readonly id: number,
    readonly name: string,
    factory: ModelFactory,
    p: Point,
    public heading: number,
    color: number,
    private terrain: HeightSurface,
  ) {
    this.initial = { position: { ...p }, heading };
    this.object = factory.car(color);
    this.object.scale.multiplyScalar(ENTITY_SCALE);
    this.object.position.set(p.x, this.terrain.heightAt(p.x, p.z) + 0.12, p.z);
    this.ground();
  }
  reset(): void {
    this.speed = 0;
    this.occupied = false;
    this.heading = this.initial.heading;
    this.object.position.set(
      this.initial.position.x,
      this.terrain.heightAt(this.initial.position.x, this.initial.position.z) + 0.12,
      this.initial.position.z,
    );
    this.ground();
  }
  get position(): THREE.Vector3 {
    return this.object.position;
  }
  update(dt: number, input: Input, collision: CollisionWorld): void {
    const throttle = input.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']),
      steer = input.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);
    const brake = input.down('Space');
    this.speed += throttle * dt * (throttle * this.speed < 0 ? 32 : 16);
    this.speed *= Math.exp(-dt * (brake ? 4.4 : throttle === 0 ? 1.2 : 0.24));
    this.speed = clamp(this.speed, -12, 36);
    if (Math.abs(this.speed) < 0.035) this.speed = 0;
    this.heading -= steer * dt * clamp(this.speed / 9, -1, 1) * (brake ? 2.6 : 1.6);
    const dx = Math.sin(this.heading) * this.speed * dt,
      dz = Math.cos(this.heading) * this.speed * dt;
    const next = collision.move(this.position, dx, dz, 2.2 * ENTITY_SCALE),
      travel = Math.hypot(next.x - this.position.x, next.z - this.position.z);
    if (travel < Math.hypot(dx, dz) * 0.5) this.speed *= 0.4;
    this.position.x = next.x;
    this.position.z = next.z;
    this.ground(steer * this.speed * 0.0009);
  }
  private ground(lean = 0): void {
    const sin = Math.sin(this.heading),
      cos = Math.cos(this.heading);
    const sample = (side: number, along: number) =>
      this.terrain.heightAt(
        this.position.x + cos * side + sin * along,
        this.position.z - sin * side + cos * along,
        this.position.y,
      );
    const halfWidth = 0.95 * ENTITY_SCALE,
      halfLength = 1.35 * ENTITY_SCALE;
    const fl = sample(-halfWidth, halfLength),
      fr = sample(halfWidth, halfLength);
    const bl = sample(-halfWidth, -halfLength),
      br = sample(halfWidth, -halfLength);
    this.position.y = Math.max((fl + fr + bl + br) / 4, sample(0, 0)) + 0.12;
    this.object.rotation.set(
      -Math.atan2((fl + fr - bl - br) / 2, halfLength * 2),
      this.heading,
      Math.atan2((fr + br - fl - bl) / 2, halfWidth * 2) + lean,
      'YXZ',
    );
  }
  exitPosition(collision: CollisionWorld): (Point & { y: number }) | null {
    for (const [side, along] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      const p = {
        y: this.position.y,
        x:
          this.position.x +
          Math.cos(this.heading) * side * 2.8 * ENTITY_SCALE +
          Math.sin(this.heading) * along * 3.4 * ENTITY_SCALE,
        z:
          this.position.z -
          Math.sin(this.heading) * side * 2.8 * ENTITY_SCALE +
          Math.cos(this.heading) * along * 3.4 * ENTITY_SCALE,
      };
      if (
        !collision.blocked(p, 0.65 * ENTITY_SCALE) &&
        (!(this.terrain instanceof TravelSurface) ||
          this.terrain.canExit(this.position, p, 0.65 * ENTITY_SCALE))
      )
        return p;
    }
    return null;
  }
}
