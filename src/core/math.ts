export interface Point {
  x: number;
  z: number;
}
export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
export function seededRandom(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function closestOnSegment(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    length2 = dx * dx + dz * dz;
  const t = length2 ? clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / length2, 0, 1) : 0;
  return { x: a.x + t * dx, z: a.z + t * dz };
}
export function pointInPolygon(p: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x)
      inside = !inside;
  }
  return inside;
}
export function circleIntersectsPolygon(p: Point, radius: number, polygon: Point[]): boolean {
  return (
    pointInPolygon(p, polygon) ||
    polygon.some(
      (a, i) => distance(p, closestOnSegment(p, a, polygon[(i + 1) % polygon.length])) < radius,
    )
  );
}
export function rectangle(
  x: number,
  z: number,
  width: number,
  depth: number,
  angle: number,
): Point[] {
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([a, b]) => ({
    x: x + ((a * width) / 2) * Math.cos(angle) + ((b * depth) / 2) * Math.sin(angle),
    z: z - ((a * width) / 2) * Math.sin(angle) + ((b * depth) / 2) * Math.cos(angle),
  }));
}
