import * as THREE from 'three';
import { AssetLibrary } from './AssetLibrary';
export interface PersonModel {
  group: THREE.Group;
  limbs: THREE.Group[];
}
export class ModelFactory {
  constructor(readonly assets: AssetLibrary) {}
  box(
    w: number,
    h: number,
    d: number,
    color: number,
    x = 0,
    y = 0,
    z = 0,
    texture?: string,
  ): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.assets.material(color, texture));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
  person(shirt = 0xe7bb65, skin = 0xc88e68, hair = 0x302b2b, customKey = 'npc'): PersonModel {
    const imported = this.assets.customModel(customKey);
    if (imported) return { group: imported, limbs: [] };
    const group = new THREE.Group(),
      limbs: THREE.Group[] = [];
    group.add(this.box(0.7, 0.75, 0.4, shirt, 0, 1.2, 0));
    group.add(this.box(0.44, 0.49, 0.44, skin, 0, 1.87, 0));
    group.add(this.box(0.47, 0.17, 0.47, hair, 0, 2.1, -0.015));
    group.add(
      this.box(0.06, 0.045, 0.025, 0x282625, -0.1, 1.94, 0.23),
      this.box(0.06, 0.045, 0.025, 0x282625, 0.1, 1.94, 0.23),
    );
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.2, 0.87, 0);
      leg.add(
        this.box(0.29, 0.69, 0.31, 0x34464a, 0, -0.34, 0),
        this.box(0.32, 0.15, 0.48, 0x242c2c, 0, -0.73, 0.055),
      );
      group.add(leg);
      limbs.push(leg);
      const arm = new THREE.Group();
      arm.position.set(side * 0.48, 1.5, 0);
      arm.add(
        this.box(0.23, 0.35, 0.3, shirt, 0, -0.12, 0),
        this.box(0.21, 0.39, 0.25, skin, 0, -0.45, 0),
      );
      group.add(arm);
      limbs.push(arm);
    }
    return { group, limbs };
  }
  car(color = 0xc9b078): THREE.Group {
    const imported = this.assets.customModel('car');
    if (imported) return imported;
    const car = new THREE.Group();
    car.add(this.box(2.05, 0.63, 4.15, color, 0, 0.73, 0));
    car.add(this.box(1.83, 0.24, 4.32, color, 0, 1.08, 0));
    car.add(this.box(1.72, 0.64, 1.9, 0x334c51, 0, 1.48, -0.25));
    car.add(this.box(1.84, 0.13, 2.06, color, 0, 1.85, -0.25));
    for (const x of [-0.89, 0.89])
      for (const z of [-1.12, 0.61]) car.add(this.box(0.1, 0.69, 0.13, color, x, 1.48, z));
    car.add(this.box(0.09, 0.64, 1.94, color, 0, 1.48, -0.25));
    car.add(
      this.box(2.12, 0.15, 0.15, 0xb4b7a7, 0, 0.56, 2.17),
      this.box(2.12, 0.15, 0.15, 0xb4b7a7, 0, 0.56, -2.17),
    );
    for (const x of [-0.7, 0.7]) {
      car.add(
        this.box(0.5, 0.23, 0.06, 0xffeab1, x, 0.85, 2.11),
        this.box(0.45, 0.2, 0.06, 0xb84f38, x, 0.88, -2.11),
      );
    }
    car.add(this.box(0.5, 0.17, 0.03, 0xeee1b4, 0, 0.64, -2.25));
    for (const x of [-1.03, 1.03])
      for (const z of [-1.28, 1.3]) {
        const wheel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.46, 0.46, 0.24, 8),
          this.assets.material(0x252b2b),
        );
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, 0.49, z);
        wheel.castShadow = true;
        car.add(wheel);
        const hub = new THREE.Mesh(
          new THREE.CylinderGeometry(0.23, 0.23, 0.26, 6),
          this.assets.material(0xa8aca4),
        );
        hub.rotation.z = Math.PI / 2;
        hub.position.copy(wheel.position);
        car.add(hub);
      }
    return car;
  }
  tree(size = 1): THREE.Group {
    const tree = new THREE.Group();
    tree.add(this.box(0.5, 3, 0.5, 0x685c47, 0, 1.5, 0));
    const foliage = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.7, 0),
      this.assets.material(0x687a50),
    );
    foliage.position.y = 4;
    foliage.scale.y = 0.9;
    foliage.castShadow = true;
    tree.add(foliage);
    tree.scale.setScalar(size);
    return tree;
  }
  lamp(): THREE.Group {
    const lamp = new THREE.Group();
    lamp.add(
      this.box(0.15, 5.8, 0.15, 0x384442, 0, 2.9),
      this.box(0.9, 0.12, 0.14, 0x384442, 0.35, 5.75),
      this.box(0.5, 0.2, 0.4, 0xf4d29a, 0.7, 5.62),
    );
    return lamp;
  }
}
