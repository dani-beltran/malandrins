import { circleIntersectsPolygon, type Point } from '../core/math';
/** A static spatial hash keeps movement checks local even in a large town. */
export class CollisionWorld {
  private cells = new Map<string, Point[][]>();
  readonly polygons: Point[][] = [];
  constructor(
    private bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
    private cellSize = 24,
  ) {}
  add(polygon: Point[]): void {
    this.polygons.push(polygon);
    const xs = polygon.map((p) => p.x),
      zs = polygon.map((p) => p.z);
    for (
      let x = Math.floor(Math.min(...xs) / this.cellSize);
      x <= Math.floor(Math.max(...xs) / this.cellSize);
      x++
    )
      for (
        let z = Math.floor(Math.min(...zs) / this.cellSize);
        z <= Math.floor(Math.max(...zs) / this.cellSize);
        z++
      ) {
        const key = `${x},${z}`;
        if (!this.cells.has(key)) this.cells.set(key, []);
        this.cells.get(key)!.push(polygon);
      }
  }
  blocked(p: Point, radius: number): boolean {
    const b = this.bounds;
    if (
      p.x - radius < b.minX ||
      p.x + radius > b.maxX ||
      p.z - radius < b.minZ ||
      p.z + radius > b.maxZ
    )
      return true;
    const candidates = new Set<Point[]>();
    for (
      let x = Math.floor((p.x - radius) / this.cellSize);
      x <= Math.floor((p.x + radius) / this.cellSize);
      x++
    )
      for (
        let z = Math.floor((p.z - radius) / this.cellSize);
        z <= Math.floor((p.z + radius) / this.cellSize);
        z++
      )
        for (const poly of this.cells.get(`${x},${z}`) ?? []) candidates.add(poly);
    return [...candidates].some((poly) => circleIntersectsPolygon(p, radius, poly));
  }
  move(p: Point, dx: number, dz: number, radius: number): Point {
    // Substeps prevent fast cars tunneling through narrow buildings.
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / Math.max(radius * 0.65, 0.3)));
    const result = { ...p };
    for (let i = 0; i < steps; i++) {
      if (!this.blocked({ x: result.x + dx / steps, z: result.z }, radius)) result.x += dx / steps;
      if (!this.blocked({ x: result.x, z: result.z + dz / steps }, radius)) result.z += dz / steps;
    }
    return result;
  }
}
