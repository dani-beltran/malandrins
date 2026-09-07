import * as THREE from 'three';
import { ModelFactory } from '../assets/ModelFactory';
import { Input } from '../core/Input';
import { CollisionWorld } from '../world/CollisionWorld';
import { clamp, type Point } from '../core/math';
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
  ) {
    this.initial = { position: { ...p }, heading };
    this.object = factory.car(color);
    this.object.position.set(p.x, 0.12, p.z);
    this.object.rotation.y = heading;
  }
  reset(): void {
    this.speed = 0;
    this.occupied = false;
    this.heading = this.initial.heading;
    this.object.position.set(this.initial.position.x, 0.12, this.initial.position.z);
    this.object.rotation.set(0, this.heading, 0);
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
    const next = collision.move(this.position, dx, dz, 2.2),
      travel = Math.hypot(next.x - this.position.x, next.z - this.position.z);
    if (travel < Math.hypot(dx, dz) * 0.5) this.speed *= 0.4;
    this.position.x = next.x;
    this.position.z = next.z;
    this.object.rotation.y = this.heading;
    this.object.rotation.z = steer * this.speed * 0.0009;
  }
  exitPosition(collision: CollisionWorld): Point | null {
    for (const [side, along] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      const p = {
        x:
          this.position.x +
          Math.cos(this.heading) * side * 2.8 +
          Math.sin(this.heading) * along * 3.4,
        z:
          this.position.z -
          Math.sin(this.heading) * side * 2.8 +
          Math.cos(this.heading) * along * 3.4,
      };
      if (!collision.blocked(p, 0.65)) return p;
    }
    return null;
  }
}
