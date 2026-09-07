import * as THREE from 'three';
import type { CharacterDefinition } from '../data/characters';
import { ModelFactory } from '../assets/ModelFactory';
import type { Point } from '../core/math';
export class Npc {
  readonly object: THREE.Group;
  constructor(
    readonly definition: CharacterDefinition,
    factory: ModelFactory,
    p: Point,
  ) {
    this.object = factory.person(definition.color, definition.skin, definition.hair).group;
    this.object.position.set(p.x, 0.12, p.z);
    this.object.rotation.y = definition.name.length;
  }
  get position(): THREE.Vector3 {
    return this.object.position;
  }
  update(time: number, player: THREE.Vector3): void {
    this.object.position.y = 0.12 + Math.sin(time * 1.8 + this.definition.name.length) * 0.018;
    if (this.position.distanceTo(player) < 9)
      this.object.rotation.y = Math.atan2(player.x - this.position.x, player.z - this.position.z);
  }
}
