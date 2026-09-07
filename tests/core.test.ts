import { describe, it, expect, vi, afterEach } from 'vitest';
import { MapAdapter } from '../src/world/MapAdapter';
import { CollisionWorld } from '../src/world/CollisionWorld';
import { circleIntersectsPolygon, closestOnSegment, rectangle } from '../src/core/math';
import { MissionSystem } from '../src/systems/MissionSystem';
import { SaveStore, freshSave } from '../src/systems/SaveStore';
import { characters, missionDialogues, missionContacts } from '../src/data/characters';
import { en, ca } from '../src/data/locales';
const bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
afterEach(() => vi.unstubAllGlobals());
describe('La Pobla source geography', () => {
  const map = new MapAdapter();
  it('preserves the real roads and all 19 building footprints', () => {
    expect(map.source.roads).toHaveLength(267);
    expect(map.roads).toHaveLength(270);
    expect(map.buildings).toHaveLength(19);
    expect(map.roads.some((r) => r.name === 'Plaça del Raval')).toBe(true);
  });
  it('projects coordinates in both directions without losing location', () => {
    const p = [-0.00146, 40.10135];
    const result = map.unproject(map.project(p));
    expect(result[0]).toBeCloseTo(p[0], 8);
    expect(result[1]).toBeCloseTo(p[1], 8);
    expect(map.project([-0.0012, 40.1027]).z).toBeLessThan(0);
  });
  it('keeps line strings separate when a road has multiple parts', () => {
    const multi = new MapAdapter({
      bounds: [0, 0, 1, 1],
      roads: [
        {
          n: 'test',
          t: 'residential',
          c: [
            [
              [0, 0],
              [0.1, 0.1],
            ],
            [
              [0.7, 0.7],
              [0.9, 0.9],
            ],
          ],
        },
      ],
      buildings: [],
      areas: [],
      water: [],
      pois: [],
    });
    expect(multi.roads).toHaveLength(2);
    expect(multi.roads.every((r) => r.points.length === 2)).toBe(true);
  });
  it('snaps to a drivable road rather than a footpath', () => {
    const point = map.project([-0.00146, 40.10135]),
      result = map.nearestRoad(point, true);
    expect(['footway', 'pedestrian', 'steps', 'path', 'cycleway']).not.toContain(result.road.type);
    expect(result.distance).toBeLessThan(25);
  });
});
describe('collision and motion', () => {
  it('handles degenerate line segments', () => {
    expect(closestOnSegment({ x: 5, z: 9 }, { x: 1, z: 2 }, { x: 1, z: 2 })).toEqual({
      x: 1,
      z: 2,
    });
  });
  it('detects a circle touching a rotated wall and a circle inside it', () => {
    const poly = rectangle(0, 0, 10, 4, Math.PI / 4);
    expect(circleIntersectsPolygon({ x: 0, z: 0 }, 0.5, poly)).toBe(true);
    expect(circleIntersectsPolygon(poly[0], 0.5, poly)).toBe(true);
    expect(circleIntersectsPolygon({ x: 15, z: 15 }, 0.5, poly)).toBe(false);
  });
  it('prevents a fast car from tunneling through a thin wall', () => {
    const world = new CollisionWorld(bounds);
    world.add(rectangle(0, 0, 1, 40, 0));
    const end = world.move({ x: -20, z: 0 }, 40, 0, 2.2);
    expect(end.x).toBeLessThan(-2.5);
    expect(world.blocked(end, 2.2)).toBe(false);
  });
  it('slides along a wall while stopping normal motion', () => {
    const world = new CollisionWorld(bounds);
    world.add(rectangle(0, 0, 2, 60, 0));
    const end = world.move({ x: -3, z: -15 }, 6, 20, 0.5);
    expect(end.x).toBeLessThan(-1.4);
    expect(end.z).toBeCloseTo(5);
  });
  it('queries neighboring hash cells for large collision radii', () => {
    const world = new CollisionWorld(bounds, 10);
    world.add(rectangle(11, 0, 1, 5, 0));
    expect(world.blocked({ x: 8, z: 0 }, 3)).toBe(true);
  });
  it('contains the player within the source map bounds', () => {
    const world = new CollisionWorld(bounds);
    const end = world.move({ x: 99, z: 0 }, 50, 0, 0.5);
    expect(end.x).toBeLessThanOrEqual(99.5);
  });
});
describe('story and localization', () => {
  it('awards each favour only after its complete dialogue and finishes all five', () => {
    const mission = new MissionSystem(freshSave());
    for (let i = 0; i < 5; i++) {
      const contact = characters.find((c) => c.id === missionContacts[i])!;
      mission.start(contact);
      for (let n = 0; n < missionDialogues[i].length - 1; n++) {
        expect(mission.advance().reward).toBe(0);
        expect(mission.save.stage).toBe(i);
      }
      expect(mission.advance()).toEqual({ closed: true, reward: 75, completed: i === 4 });
    }
    expect(mission.contactId).toBeNull();
    expect(mission.money).toBe(525);
    mission.start(characters[0]);
    expect(mission.advance().reward).toBe(0);
    expect(mission.save.stage).toBe(5);
  });
  it('lets the player meet contacts out of order without skipping missions', () => {
    const m = new MissionSystem(freshSave());
    m.start(characters.find((c) => c.id === 'marina')!);
    expect(m.advance().reward).toBe(0);
    expect(m.save.stage).toBe(0);
    expect(m.metCount).toBe(1);
  });
  it('makes tape rewards idempotent', () => {
    const m = new MissionSystem(freshSave());
    expect(m.collect(0)).toBe(true);
    expect(m.collect(0)).toBe(false);
    expect(m.collect(8)).toBe(false);
    expect(m.money).toBe(175);
  });
  it('has complete English and Catalan UI, character and story text', () => {
    expect(Object.keys(ca).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(ca[key].length).toBeGreaterThan(0);
      const params = (s: string) => s.match(/\{\w+\}/g)?.sort() ?? [];
      expect(params(ca[key])).toEqual(params(en[key]));
    }
    expect(characters).toHaveLength(16);
    expect(new Set(characters.map((c) => c.id)).size).toBe(16);
    for (const c of characters)
      for (const l of [c.role, ...c.lines]) {
        expect(l.en).toBeTruthy();
        expect(l.ca).toBeTruthy();
      }
    for (const lines of missionDialogues)
      for (const line of lines) {
        expect(line.en).toBeTruthy();
        expect(line.ca).toBeTruthy();
      }
  });
});
describe('saved game resilience', () => {
  it('recovers from corrupt storage', () => {
    vi.stubGlobal('localStorage', { getItem: () => '{broken' });
    expect(new SaveStore().load()).toEqual(freshSave());
  });
  it('validates values, removes duplicate rewards, and rejects non-finite coordinates', () => {
    vi.stubGlobal('localStorage', {
      getItem: () =>
        JSON.stringify({
          version: 1,
          stage: 99,
          tapes: [0, 0, -1, 7, 80],
          language: 'ca',
          quality: 'invalid',
          position: { x: 'NaN', z: 4 },
          volume: 5,
        }),
    });
    const s = new SaveStore().load();
    expect(s.stage).toBe(5);
    expect(s.tapes).toEqual([0, 7]);
    expect(s.position).toBeNull();
    expect(s.language).toBe('ca');
    expect(s.volume).toBe(1);
    expect(s.quality).toBe('retro');
  });
  it('keeps playing when browser storage is denied', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw Error('denied');
      },
      setItem: () => {
        throw Error('denied');
      },
    });
    const store = new SaveStore();
    expect(store.load()).toEqual(freshSave());
    expect(store.save(freshSave())).toBe(false);
    expect(store.available).toBe(false);
  });
});
