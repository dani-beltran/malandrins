import * as THREE from 'three';
import { seededRandom } from '../core/math';

/** Small original atlases: geometry supplies the building proportions and depth. */
export function makeSceneryTextures(textures: Map<string, THREE.Texture>): void {
  const random = seededRandom(9826);
  const create = (name: string, draw: (c: CanvasRenderingContext2D) => void, repeat = true) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const c = canvas.getContext('2d')!;
    draw(c);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.anisotropy = 4;
    if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    textures.set(name, texture);
  };
  create('plaster', (c) => {
    c.fillStyle = '#f4f2ec';
    c.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 1500; i++) {
      c.fillStyle = random() > 0.5 ? '#b7b09c12' : '#ffffff1a';
      c.fillRect(random() * 128, random() * 128, 2, 1);
    }
  });
  create('masonry', (c) => {
    c.fillStyle = '#a69c86';
    c.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 16)
      for (let x = -12; x < 128; x += 27) {
        c.fillStyle = ['#c7bba2', '#b7a58e', '#ccc0a7', '#b3ab98'][Math.floor(random() * 4)];
        c.fillRect(x + (y % 32 ? 12 : 0), y + 1, 25, 14);
      }
  });
  create('paving', (c) => {
    c.fillStyle = '#8a887e';
    c.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 16)
      for (let x = -16; x < 128; x += 32) {
        c.fillStyle = ['#b0afa4', '#aaa99f', '#b9b5a8', '#aaa89b'][Math.floor(random() * 4)];
        c.fillRect(x + (y % 32 ? 16 : 0) + 1, y + 1, 30, 14);
      }
  });
  create('sidewalk', (c) => {
    c.fillStyle = '#b0a799';
    c.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 32)
      for (let x = 0; x < 128; x += 32) {
        c.fillStyle = ['#d6c7b5', '#d6cbb9', '#ccc0ac', '#ded0ba'][Math.floor(random() * 4)];
        c.fillRect(x + 1, y + 1, 30, 30);
      }
  });
  for (const kind of ['open', 'shutter', 'barred'])
    create(
      `window-${kind}`,
      (c) => {
        c.fillStyle = '#e5dfcf';
        c.fillRect(0, 0, 128, 128);
        c.fillStyle = '#605f52';
        c.fillRect(7, 6, 114, 116);
        c.fillStyle = '#435456';
        c.fillRect(12, 10, 104, 108);
        c.fillStyle = '#627474';
        c.fillRect(14, 12, 43, 100);
        c.fillStyle = '#4c5d5c';
        c.fillRect(70, 12, 43, 100);
        c.fillStyle = '#afa58d';
        c.fillRect(60, 9, 6, 111);
        c.fillRect(10, 63, 108, 4);
        if (kind === 'shutter') {
          c.fillStyle = '#b7b2a2';
          c.fillRect(11, 8, 106, 78);
          c.fillStyle = '#918e80';
          for (let y = 13; y < 85; y += 7) c.fillRect(12, y, 104, 2);
        }
        if (kind === 'barred') {
          c.fillStyle = '#343c36';
          for (let x = 19; x < 120; x += 17) c.fillRect(x, 8, 3, 112);
          c.fillRect(10, 36, 108, 3);
          c.fillRect(10, 86, 108, 3);
        }
      },
      false,
    );
  for (const kind of ['wood', 'green', 'garage'])
    create(
      `door-${kind}`,
      (c) => {
        c.fillStyle = kind === 'wood' ? '#74634b' : kind === 'green' ? '#586e59' : '#b6b4a7';
        c.fillRect(0, 0, 128, 128);
        c.fillStyle = kind === 'garage' ? '#929689' : '#3f4c40';
        for (let x = 5; x < 128; x += kind === 'garage' ? 9 : 21) c.fillRect(x, 0, 2, 128);
        if (kind !== 'garage') {
          c.fillRect(0, 8, 128, 5);
          c.fillRect(0, 69, 128, 4);
          c.fillRect(61, 0, 4, 128);
        }
        c.fillStyle = '#c2b697';
        c.fillRect(106, 64, 4, 8);
      },
      false,
    );
  create(
    'iron-railing',
    (c) => {
      c.clearRect(0, 0, 128, 128);
      c.fillStyle = '#36413b';
      c.fillRect(0, 4, 128, 5);
      c.fillRect(0, 118, 128, 4);
      for (let x = 3; x < 128; x += 18) c.fillRect(x, 5, 3, 116);
    },
    false,
  );
}
