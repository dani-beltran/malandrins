import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { seededRandom } from '../core/math';
import { assetConfig } from './config';
import { makeSceneryTextures } from './SceneryTextures';
export class AssetLibrary {
  private materials = new Map<string, THREE.MeshLambertMaterial>();
  private models = new Map<string, THREE.Object3D>();
  readonly textures = new Map<string, THREE.Texture>();
  async load(): Promise<void> {
    this.makeTextures();
    makeSceneryTextures(this.textures);
    await Promise.all([
      ...[
        'church',
        'prison',
        'townhall',
        'publichall',
        'passage',
        ...[8, 16, 32, 64, 128].map((n) => `bridge-stone-${n}`),
      ].map(async (key) => {
        const model = (
          await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}assets/scenery/${key}.glb`)
        ).scene;
        model.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          const convert = (m: THREE.Material) => {
            const source = m as THREE.MeshStandardMaterial;
            const result = this.material(source.color.getHex());
            m.dispose();
            return result;
          };
          object.material = Array.isArray(object.material)
            ? object.material.map(convert)
            : convert(object.material);
        });
        this.models.set(key, model);
      }),
      new THREE.TextureLoader()
        .loadAsync(`${import.meta.env.BASE_URL}assets/scenery/landcover.jpg`)
        .then((texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = 4;
          this.textures.set('landcover', texture);
        }),
      ...Object.entries(assetConfig.models).map(async ([key, url]) => {
        try {
          if (url) this.models.set(key, (await new GLTFLoader().loadAsync(url)).scene);
        } catch (error) {
          console.warn(`Custom ${key} model could not load; using built-in model.`, error);
        }
      }),
      ...Object.entries(assetConfig.textures).map(async ([key, url]) => {
        try {
          if (url) {
            const texture = await new THREE.TextureLoader().loadAsync(url);
            this.configure(texture);
            this.textures.get(key)?.dispose();
            this.textures.set(key, texture);
          }
        } catch (error) {
          console.warn(`Custom ${key} texture could not load; using built-in texture.`, error);
        }
      }),
    ]);
  }
  customModel(key: string): THREE.Group | undefined {
    const template = this.models.get(key);
    if (!template) return;
    const group = new THREE.Group();
    group.add(clone(template));
    group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return group;
  }
  material(color: number | string, texture?: string): THREE.MeshLambertMaterial {
    const key = `${color}-${texture ?? ''}`;
    if (!this.materials.has(key))
      this.materials.set(
        key,
        new THREE.MeshLambertMaterial({
          color,
          map: texture ? this.textures.get(texture) : null,
          flatShading: true,
        }),
      );
    return this.materials.get(key)!;
  }
  /** Bake per-object tint into vertex colors so adjacent buildings with the
   * same texture share a draw call, even when their plaster colors differ. */
  batchMaterial(source: THREE.MeshLambertMaterial): THREE.MeshLambertMaterial {
    const key = `batch:${source.map?.uuid ?? 'solid'}:${source.side}:${source.alphaTest}`;
    if (!this.materials.has(key))
      this.materials.set(
        key,
        new THREE.MeshLambertMaterial({
          color: 0xffffff,
          map: source.map,
          vertexColors: true,
          flatShading: true,
          side: source.side,
          alphaTest: source.alphaTest,
        }),
      );
    return this.materials.get(key)!;
  }
  private configure(texture: THREE.Texture): void {
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.generateMipmaps = false;
  }
  private makeTextures(): void {
    const random = seededRandom(1989);
    for (const name of ['facade', 'roof', 'asphalt']) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 64;
      const c = canvas.getContext('2d')!;
      c.fillStyle = name === 'facade' ? '#e7dec6' : name === 'roof' ? '#d5c1a2' : '#777975';
      c.fillRect(0, 0, 64, 64);
      for (let i = 0; i < 650; i++) {
        c.fillStyle = random() > 0.5 ? '#ffffff0d' : '#00000010';
        c.fillRect(Math.floor(random() * 64), Math.floor(random() * 64), 2, 1);
      }
      if (name === 'facade') {
        for (const y of [8, 30])
          for (const x of [9, 39]) {
            c.fillStyle = '#aca58f';
            c.fillRect(x - 2, y - 2, 18, 18);
            c.fillStyle = '#384c49';
            c.fillRect(x, y, 14, 15);
            c.fillStyle = '#849490';
            c.fillRect(x + 2, y + 1, 4, 12);
            c.fillStyle = '#293e3a';
            c.fillRect(x + 7, y, 2, 15);
            c.fillStyle = '#f0e5c9';
            c.fillRect(x - 3, y + 15, 20, 2);
          }
        c.fillStyle = '#635c4c';
        c.fillRect(25, 48, 13, 16);
        c.fillStyle = '#2e423c';
        c.fillRect(27, 49, 9, 15);
        c.fillStyle = '#bfac79';
        c.fillRect(34, 56, 1, 2);
        c.fillStyle = '#c0b79e';
        c.fillRect(0, 62, 64, 2);
      }
      if (name === 'roof') {
        for (let y = 0; y < 64; y += 8) {
          c.fillStyle = '#a9957b';
          c.fillRect(0, y, 64, 1);
          for (let x = 0; x < 64; x += 8) {
            c.fillStyle = '#e1cbae';
            c.fillRect(x + (y % 16 === 0 ? 0 : 4), y + 1, 2, 6);
          }
        }
      }
      const texture = new THREE.CanvasTexture(canvas);
      this.configure(texture);
      this.textures.set(name, texture);
    }
  }
  dispose(): void {
    for (const m of this.materials.values()) m.dispose();
    for (const t of this.textures.values()) t.dispose();
  }
}
