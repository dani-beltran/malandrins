import { MapAdapter } from '../world/MapAdapter';
import type { Point } from '../core/math';
export interface MapMarker {
  position: Point;
  kind: 'npc' | 'car' | 'tape';
  active?: boolean;
  name?: string;
}
export class Minimap {
  private context: CanvasRenderingContext2D;
  constructor(
    private canvas: HTMLCanvasElement,
    private map: MapAdapter,
    private buildings: Point[][],
  ) {
    this.context = canvas.getContext('2d')!;
  }
  draw(player: Point, heading: number, markers: MapMarker[], large = false): void {
    const rect = this.canvas.getBoundingClientRect(),
      ratio = Math.min(devicePixelRatio, 2),
      w = Math.max(1, Math.round(rect.width * ratio)),
      h = Math.max(1, Math.round(rect.height * ratio));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const c = this.context,
      range = large
        ? Math.max(600, Math.min(1100, Math.abs(player.x) + Math.abs(player.z) + 320))
        : 170;
    const scale = Math.min(w, h) / range,
      center =
        large && Math.abs(player.x) < 230 && Math.abs(player.z) < 270 ? { x: -5, z: -40 } : player;
    const x = (p: Point) => w / 2 + (p.x - center.x) * scale,
      z = (p: Point) => h / 2 + (p.z - center.z) * scale;
    c.fillStyle = large ? '#263c37' : '#253b35';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#ffffff06';
    c.lineWidth = 1;
    for (let i = 0; i < w; i += 32 * ratio) {
      c.beginPath();
      c.moveTo(i, 0);
      c.lineTo(i, h);
      c.stroke();
    }
    for (let i = 0; i < h; i += 32 * ratio) {
      c.beginPath();
      c.moveTo(0, i);
      c.lineTo(w, i);
      c.stroke();
    }
    const path = (points: Point[]) => {
      c.beginPath();
      points.forEach((p, i) => (i ? c.lineTo(x(p), z(p)) : c.moveTo(x(p), z(p))));
    };
    for (const water of this.map.water) {
      path(water);
      c.strokeStyle = '#5c8985';
      c.lineWidth = Math.max(1, 4 * scale);
      c.stroke();
    }
    for (const b of this.buildings) {
      path(b);
      c.closePath();
      c.fillStyle = '#647464';
      c.fill();
    }
    for (const road of this.map.roads) {
      path(road.points);
      c.strokeStyle = road.width < 5 ? '#7b8270' : '#bab8a0';
      c.lineWidth = Math.max(1, road.width * scale * 0.85);
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.stroke();
    }
    const target = markers.find((m) => m.active);
    if (target) {
      c.beginPath();
      c.moveTo(x(player), z(player));
      c.lineTo(x(target.position), z(target.position));
      c.setLineDash([4 * ratio, 5 * ratio]);
      c.lineWidth = ratio;
      c.strokeStyle = '#eacc8588';
      c.stroke();
      c.setLineDash([]);
    }
    for (const marker of markers) {
      const px = x(marker.position),
        pz = z(marker.position),
        r = (marker.active ? 5 : marker.kind === 'npc' ? 2.5 : 3) * ratio;
      if (px < 0 || pz < 0 || px > w || pz > h) continue;
      c.save();
      c.translate(px, pz);
      c.fillStyle = marker.active
        ? '#f4cd7d'
        : marker.kind === 'npc'
          ? '#cfbe9c'
          : marker.kind === 'car'
            ? '#87b6b4'
            : '#c5a2c9';
      c.strokeStyle = '#203a33';
      c.lineWidth = 1.5 * ratio;
      if (marker.active || marker.kind === 'tape') {
        c.rotate(Math.PI / 4);
        c.fillRect(-r, -r, r * 2, r * 2);
        c.strokeRect(-r, -r, r * 2, r * 2);
      } else if (marker.kind === 'car') {
        c.fillRect(-r, -r * 0.7, r * 2, r * 1.4);
      } else {
        c.beginPath();
        c.arc(0, 0, r, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
      if (large && marker.name && (marker.active || marker.kind === 'npc')) {
        c.font = `${marker.active ? 'bold ' : ''}${11 * ratio}px monospace`;
        c.fillStyle = marker.active ? '#f4cd7d' : '#d7d7bf';
        c.fillText(marker.name, px + 8 * ratio, pz - 6 * ratio);
      }
    }
    if (target && !large) {
      let tx = x(target.position) - w / 2,
        tz = z(target.position) - h / 2;
      if (Math.abs(tx) > w * 0.44 || Math.abs(tz) > h * 0.44) {
        const s = Math.min((w * 0.42) / Math.abs(tx), (h * 0.42) / Math.abs(tz));
        tx *= s;
        tz *= s;
        c.save();
        c.translate(w / 2 + tx, h / 2 + tz);
        c.rotate(Math.atan2(tz, tx));
        c.beginPath();
        c.moveTo(5 * ratio, 0);
        c.lineTo(-4 * ratio, -4 * ratio);
        c.lineTo(-4 * ratio, 4 * ratio);
        c.closePath();
        c.fillStyle = '#f4cd7d';
        c.fill();
        c.restore();
      }
    }
    c.save();
    c.translate(x(player), z(player));
    c.rotate(-heading);
    c.beginPath();
    c.moveTo(0, 7 * ratio);
    c.lineTo(-4.7 * ratio, -5 * ratio);
    c.lineTo(0, -3 * ratio);
    c.lineTo(4.7 * ratio, -5 * ratio);
    c.closePath();
    c.fillStyle = '#f8efe0';
    c.strokeStyle = '#1e332e';
    c.lineWidth = 1.5 * ratio;
    c.fill();
    c.stroke();
    c.restore();
    c.font = `bold ${11 * ratio}px monospace`;
    c.fillStyle = '#e7d5b1';
    c.fillText('N', 12 * ratio, 20 * ratio);
    if (large) {
      c.fillStyle = '#cfceb8';
      c.font = `${10 * ratio}px monospace`;
      c.fillText('100 m', 20 * ratio, h - 24 * ratio);
      c.fillRect(20 * ratio, h - 18 * ratio, 100 * scale, 2 * ratio);
    }
  }
}
