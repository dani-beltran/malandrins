import layout from '../data/scenery/town-layout.json' with { type: 'json' };
import type { Point } from '../core/math';
export const sceneryLayout = layout;
export const layoutPoints = (ps: number[][]): Point[] => ps.map(([x, z]) => ({ x, z }));
export function landmarkFootprints(b: (typeof layout.landmarks)[number]): Point[][] {
  if (b.id !== 'passage') return [layoutPoints(b.points)];
  const [x, z] = b.position;
  return [-1, 1].map((side) =>
    [
      [-0.27, 0],
      [0.27, 0],
      [0.27, -b.depth],
      [-0.27, -b.depth],
    ].map(([u, v]) => {
      u += side * (b.width / 2 - 0.27);
      return {
        x: x + Math.cos(b.rotation) * u + Math.sin(b.rotation) * v,
        z: z - Math.sin(b.rotation) * u + Math.cos(b.rotation) * v,
      };
    }),
  );
}
