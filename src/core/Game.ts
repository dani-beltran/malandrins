import * as THREE from 'three';
import { GameRenderer } from './Renderer';
import { Input } from './Input';
import { distance, type Point } from './math';
import { AssetLibrary } from '../assets/AssetLibrary';
import { ModelFactory } from '../assets/ModelFactory';
import { MapAdapter } from '../world/MapAdapter';
import { WorldBuilder } from '../world/WorldBuilder';
import { Terrain } from '../world/Terrain';
import { Player } from '../entities/Player';
import { Vehicle } from '../entities/Vehicle';
import { Npc } from '../entities/Npc';
import { characters } from '../data/characters';
import { I18n } from '../systems/I18n';
import { MissionSystem } from '../systems/MissionSystem';
import { SaveStore, freshSave, type SaveData } from '../systems/SaveStore';
import { AudioSystem } from '../systems/AudioSystem';
import { GameUI, type Screen, type UIAction } from '../ui/GameUI';
import { Minimap, type MapMarker } from '../ui/Minimap';
interface Tape {
  id: number;
  object: THREE.Group;
  position: THREE.Vector3;
  groundHeight: number;
}
export class Game {
  readonly map = new MapAdapter();
  readonly assets = new AssetLibrary();
  readonly input = new Input();
  readonly store = new SaveStore();
  readonly audio = new AudioSystem();
  readonly save: SaveData = this.store.load();
  readonly missions = new MissionSystem(this.save);
  readonly i18n = new I18n(this.save.language);
  readonly graphics: GameRenderer;
  private models!: ModelFactory;
  private world!: WorldBuilder;
  private terrain!: Terrain;
  private player!: Player;
  private vehicles: Vehicle[] = [];
  private npcs: Npc[] = [];
  private tapes: Tape[] = [];
  private car: Vehicle | null = null;
  private ui!: GameUI;
  private minimap!: Minimap;
  private largeMap: Minimap | null = null;
  private activeMarker!: THREE.Mesh;
  private returnScreen: Screen = 'menu';
  private cameraYaw = 0.65;
  private lastTime = 0;
  private elapsed = 0;
  private uiTime = 0;
  private saveTime = 0;
  private frame = 0;
  private disposed = false;
  private cameraTarget = new THREE.Vector3();
  private cameraPosition = new THREE.Vector3();
  private raycaster = new THREE.Raycaster();
  private spawn!: Point;
  private abort = new AbortController();
  constructor(
    canvas: HTMLCanvasElement,
    private root: HTMLElement,
  ) {
    this.graphics = new GameRenderer(canvas);
  }
  async initialize(): Promise<void> {
    const [, terrain] = await Promise.all([this.assets.load(), Terrain.load(this.map)]);
    this.terrain = terrain;
    this.models = new ModelFactory(this.assets);
    const npcPoints = characters.map((c) => {
      const projected = this.map.project(c.coordinate),
        near = this.map.nearestRoad(projected);
      return {
        x: near.point.x + Math.cos(near.angle) * near.road.width * 0.31,
        z: near.point.z - Math.sin(near.angle) * near.road.width * 0.31,
      };
    });
    this.spawn = this.map.nearestRoad(this.map.project([-0.00127, 40.10281])).point;
    const carCoordinates: [number, number][] = [
      [-0.00163, 40.10275],
      [-0.00075, 40.10193],
      [0.00062, 40.10057],
      [-0.00223, 40.1023],
      [0.0016, 40.10263],
      [0.00213, 40.10425],
      [-0.00186, 40.0986],
    ];
    const carSpawns = carCoordinates.map((p) => this.map.nearestRoad(this.map.project(p), true));
    this.world = new WorldBuilder(this.map, this.terrain, this.models, [
      npcPoints[0],
      this.spawn,
      ...npcPoints,
      ...carSpawns.map((c) => c.point),
    ]);
    this.graphics.scene.add(this.world.build());
    this.spawn = this.safePoint(this.spawn, 0.6);
    this.player = new Player(
      this.models,
      this.save.position ? this.safePoint(this.save.position, 0.6) : this.spawn,
      this.terrain,
    );
    this.graphics.scene.add(this.player.object);
    this.npcs = characters.map(
      (c, i) => new Npc(c, this.models, this.safePoint(npcPoints[i], 0.65), this.terrain),
    );
    this.npcs.forEach((n) => this.graphics.scene.add(n.object));
    this.vehicles = carSpawns.map(
      (p, i) =>
        new Vehicle(
          i,
          ['Raval 80', 'Tramuntana', 'Marjal', 'Raval 80', 'Tramuntana', 'Marjal', 'Raval 80'][i],
          this.models,
          this.safePoint(p.point, 2.2),
          p.angle,
          [0xdbbe76, 0x718f88, 0xb0674d, 0xc6c2a7, 0x7d8a9a, 0xad987a, 0xb78359][i],
          this.terrain,
        ),
    );
    this.vehicles.forEach((v) => this.graphics.scene.add(v.object));
    this.createTapes();
    this.activeMarker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.65),
      new THREE.MeshBasicMaterial({ color: 0xffd580 }),
    );
    this.graphics.scene.add(this.activeMarker);
    this.ui = new GameUI(this.root, this.i18n, this.missions, (action, value) =>
      this.action(action, value),
    );
    this.minimap = new Minimap(this.ui.minimapCanvas, this.map, this.world.buildingOutlines);
    this.graphics.setQuality(this.save.quality);
    this.audio.enabled = this.save.audio;
    this.audio.volume = this.save.volume;
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden && this.ui.screen === 'playing') this.pause();
      },
      { signal: this.abort.signal },
    );
    window.addEventListener(
      'blur',
      () => {
        if (this.ui.screen === 'playing') this.pause();
      },
      { signal: this.abort.signal },
    );
    window.addEventListener('pagehide', () => this.persist(), { signal: this.abort.signal });
    this.cameraTarget.copy(this.player.position);
    this.graphics.camera.position.set(
      this.spawn.x + 90,
      this.terrain.heightAt(this.spawn.x, this.spawn.z) + 85,
      this.spawn.z + 115,
    );
    this.frame = requestAnimationFrame((time) => this.tick(time));
  }
  private safePoint(p: Point, radius: number): Point {
    if (!this.world.collision.blocked(p, radius)) return { ...p };
    const nearest = this.map.nearestRoad(p, true).point;
    if (!this.world.collision.blocked(nearest, radius)) return nearest;
    for (let r = 2; r < 35; r += 2)
      for (let i = 0; i < 16; i++) {
        const q = {
          x: nearest.x + Math.cos((i * Math.PI) / 8) * r,
          z: nearest.z + Math.sin((i * Math.PI) / 8) * r,
        };
        if (!this.world.collision.blocked(q, radius)) return q;
      }
    return { ...this.spawn };
  }
  private createTapes(): void {
    const positions: [number, number][] = [
      [-0.0015, 40.10262],
      [-0.00169, 40.10183],
      [-0.00036, 40.10043],
      [0.00054, 40.09999],
      [0.00232, 40.1028],
      [-0.00277, 40.10231],
      [-0.0013, 40.10412],
      [0.00038, 40.1017],
    ];
    this.tapes = positions.map((p, id) => {
      const group = new THREE.Group(),
        point = this.safePoint(this.map.nearestRoad(this.map.project(p)).point, 0.4);
      group.add(
        this.models.box(0.85, 0.55, 0.17, 0xb8a1bf, 0, 0, 0),
        this.models.box(0.63, 0.3, 0.02, 0xeee0b8, 0, 0.02, 0.1),
      );
      for (const side of [-1, 1])
        group.add(this.models.box(0.14, 0.14, 0.03, 0x3e4c44, side * 0.2, 0.02, 0.12));
      const groundHeight = this.terrain.heightAt(point.x, point.z);
      group.position.set(point.x, groundHeight + 1, point.z);
      group.visible = !this.save.tapes.includes(id);
      this.graphics.scene.add(group);
      return { id, object: group, position: group.position, groundHeight };
    });
  }
  private action(action: UIAction, value?: string): void {
    switch (action) {
      case 'play':
        this.start();
        break;
      case 'pause':
        this.pause();
        break;
      case 'resume':
        this.resume();
        break;
      case 'controls':
      case 'settings':
        this.returnScreen = this.ui.screen === 'menu' ? 'menu' : 'paused';
        this.setScreen(action);
        break;
      case 'back':
        this.setScreen(this.returnScreen);
        break;
      case 'map':
        if (this.ui.screen === 'map') this.resume();
        else {
          this.persist();
          this.setScreen('map');
        }
        break;
      case 'language':
        if (value === 'en' || value === 'ca') {
          this.save.language = value;
          this.i18n.set(value);
          this.largeMap = null;
          this.persist();
        }
        break;
      case 'quality':
        if (value === 'retro' || value === 'clear') {
          this.save.quality = value;
          this.graphics.setQuality(value);
          this.persist();
        }
        break;
      case 'audio':
        this.save.audio = !this.save.audio;
        this.audio.setEnabled(this.save.audio);
        this.ui.render();
        this.largeMap = null;
        this.persist();
        break;
      case 'volume':
        this.save.volume = Number(value);
        this.audio.setVolume(this.save.volume);
        this.persist();
        break;
      case 'dialogue':
        this.advanceDialogue();
        break;
      case 'new':
        this.ui.requestReset(true);
        break;
      case 'cancel-reset':
        this.ui.requestReset(false);
        break;
      case 'reset':
        this.reset();
        break;
      case 'rescue':
        this.rescue();
        break;
      case 'fullscreen':
        void this.fullscreen();
        break;
    }
  }
  private start(): void {
    this.save.started = true;
    this.setScreen('playing');
    this.input.clear();
    void this.audio.start();
    const target = this.npcs.find((n) => n.definition.id === this.missions.contactId);
    if (target) {
      this.cameraYaw = Math.atan2(
        this.player.position.x - target.position.x,
        this.player.position.z - target.position.z,
      );
      this.player.object.rotation.y = this.cameraYaw + Math.PI;
    }
    this.snapCamera();
    this.persist();
    this.ui.toast(this.i18n.t('introToast'));
  }
  private pause(): void {
    this.persist();
    this.setScreen('paused');
  }
  private resume(): void {
    this.setScreen('playing');
    this.input.clear();
    void this.audio.start();
  }
  private setScreen(screen: Screen): void {
    this.ui.setScreen(screen);
    this.largeMap = null;
    this.audio.pause(screen !== 'playing');
    this.input.clear();
  }
  private reset(): void {
    const settings = {
      language: this.save.language,
      quality: this.save.quality,
      audio: this.save.audio,
      volume: this.save.volume,
    };
    Object.assign(this.save, freshSave(), settings);
    this.missions.conversation = null;
    if (this.car) {
      this.car.occupied = false;
      this.car.speed = 0;
    }
    this.car = null;
    this.player.object.visible = true;
    this.player.teleport(this.spawn);
    this.tapes.forEach((t) => (t.object.visible = true));
    this.vehicles.forEach((v) => v.reset());
    this.ui.refreshProgress();
    this.start();
  }
  private rescue(): void {
    if (this.car) {
      this.car.speed = 0;
      this.car.occupied = false;
    }
    this.car = null;
    this.player.object.visible = true;
    this.player.teleport(this.spawn);
    this.missions.conversation = null;
    this.resume();
    this.snapCamera();
    this.persist();
    this.ui.toast(this.i18n.t('rescued'));
  }
  private async fullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      this.ui.toast(this.i18n.t('fullscreenFail'));
    }
  }
  private persist(): void {
    if (!this.player) return;
    this.save.position = { x: this.player.position.x, z: this.player.position.z };
    const success = this.store.save(this.save);
    if (!success && this.ui) this.ui.toast(this.i18n.t('saveUnavailable'));
  }
  private advanceDialogue(): void {
    if (this.ui.screen !== 'playing' || !this.missions.conversation) return;
    const result = this.missions.advance();
    this.ui.renderDialogue();
    this.ui.refreshProgress();
    if (result.closed) {
      this.input.clear();
      this.persist();
    }
    if (result.reward) {
      this.audio.chime();
      this.ui.toast(
        result.completed
          ? `${this.i18n.t('completed')} · ${this.i18n.t('completedSub')}`
          : this.i18n.t('reward', { amount: result.reward }),
        result.completed ? 8000 : 4200,
      );
    }
  }
  private vehicleInteraction(): void {
    if (this.car) {
      const point = this.car.exitPosition(this.world.collision);
      if (!point) {
        this.ui.toast(this.i18n.t('blockedExit'));
        return;
      }
      this.player.teleport(point);
      this.player.object.visible = true;
      this.car.occupied = false;
      this.car.speed = 0;
      this.car = null;
      this.audio.engineSpeed(null);
      return;
    }
    const vehicle = this.vehicles
      .filter((v) => distance(this.player.position, v.position) < 5.7)
      .sort(
        (a, b) =>
          distance(a.position, this.player.position) - distance(b.position, this.player.position),
      )[0];
    if (vehicle) {
      this.car = vehicle;
      vehicle.occupied = true;
      this.player.object.visible = false;
      this.player.teleport(vehicle.position);
      this.cameraYaw = vehicle.heading + Math.PI;
    }
  }
  private interactions(): void {
    if (this.input.take('KeyF')) this.vehicleInteraction();
    if (this.car) {
      this.ui.showPrompt('F', this.i18n.t('exitCar'));
      if (this.input.take('KeyH')) this.audio.horn();
      return;
    }
    const npc = this.npcs
      .filter((n) => distance(n.position, this.player.position) < 5.5)
      .sort(
        (a, b) =>
          distance(a.position, this.player.position) - distance(b.position, this.player.position),
      )[0];
    const tape = this.tapes.find(
      (t) => !this.save.tapes.includes(t.id) && distance(t.position, this.player.position) < 2.5,
    );
    const vehicle = this.vehicles.find((v) => distance(v.position, this.player.position) < 5.7);
    // A nearby character must not permanently block collecting a tape beside them.
    if (tape) {
      this.ui.showPrompt('E', this.i18n.t('collect'));
      if (this.input.take('KeyE') && this.missions.collect(tape.id)) {
        tape.object.visible = false;
        this.ui.refreshProgress();
        this.audio.chime();
        this.ui.toast(
          this.save.tapes.length === 8
            ? this.i18n.t('allTapes')
            : this.i18n.t('tapeFound', { count: this.save.tapes.length }),
        );
        this.persist();
      }
    } else if (npc) {
      this.ui.showPrompt('E', this.i18n.t('talk', { name: npc.definition.name }));
      if (this.input.take('KeyE')) {
        this.missions.start(npc.definition);
        this.ui.hidePrompt();
        this.ui.renderDialogue();
        this.player.moving = false;
        this.persist();
      }
    } else if (vehicle) this.ui.showPrompt('F', this.i18n.t('enterCar', { name: vehicle.name }));
    else this.ui.hidePrompt();
  }
  private tick(now: number): void {
    if (this.disposed) return;
    const dt = Math.min((now - this.lastTime) / 1000 || 0, 0.05);
    this.lastTime = now;
    this.elapsed += dt;
    if (this.input.take('Escape')) {
      if (this.ui.screen === 'playing') this.pause();
      else if (this.ui.screen === 'paused' || this.ui.screen === 'map') this.resume();
      else if (this.ui.screen !== 'menu') this.setScreen(this.returnScreen);
    }
    if (
      this.input.take('KeyM') &&
      ['playing', 'map', 'paused'].includes(this.ui.screen) &&
      !this.missions.conversation
    )
      this.action('map');
    if (this.ui.screen === 'playing') {
      if (this.missions.conversation) {
        if (this.input.take('Enter') || this.input.take('Space') || this.input.take('KeyE'))
          this.advanceDialogue();
      } else {
        this.cameraYaw += this.input.axis(['KeyQ'], ['KeyR']) * dt * 1.6 + this.input.cameraDelta;
        if (this.car) {
          this.car.update(dt, this.input, this.world.collision);
          this.player.teleport(this.car.position);
          this.audio.engineSpeed(this.car.speed);
        } else this.player.update(dt, this.input, this.world.collision, this.cameraYaw);
        this.interactions();
      }
      this.npcs.forEach((n) => n.update(this.elapsed, this.player.position));
      this.tapes.forEach((t) => {
        t.object.rotation.y = this.elapsed * 1.3;
        t.position.y = t.groundHeight + 1.1 + Math.sin(this.elapsed * 2 + t.id) * 0.2;
      });
      this.updateCamera(dt);
      this.saveTime += dt;
      if (this.saveTime > 6) {
        this.persist();
        this.saveTime = 0;
      }
    } else if (this.ui.screen === 'menu') {
      this.menuCamera();
    }
    this.updateMarker();
    this.uiTime += dt;
    if (this.uiTime > 0.1) {
      this.updateUI();
      this.uiTime = 0;
    }
    this.graphics.followLight(this.player.position);
    this.graphics.render();
    this.input.endFrame();
    this.frame = requestAnimationFrame((t) => this.tick(t));
  }
  private menuCamera(): void {
    const p = this.map.project([-0.0007, 40.1019]),
      angle = 0.77 + Math.sin(this.elapsed * 0.035) * 0.15;
    const x = p.x + Math.sin(angle) * 170,
      z = p.z + Math.cos(angle) * 170;
    this.graphics.camera.position.set(
      x,
      Math.max(this.terrain.heightAt(p.x, p.z) + 99, this.terrain.heightAt(x, z) + 12),
      z,
    );
    this.graphics.camera.lookAt(p.x - 28, this.terrain.heightAt(p.x - 28, p.z - 38) + 4, p.z - 38);
  }
  private snapCamera(): void {
    this.cameraTarget.copy(this.player.position);
    this.updateCamera(10);
  }
  private updateCamera(dt: number): void {
    const moving = this.car && Math.abs(this.car.speed) > 1;
    if (moving && !this.input.down('KeyQ', 'KeyR') && this.input.cameraDelta === 0) {
      let diff = (this.car!.heading + Math.PI - this.cameraYaw) % (Math.PI * 2);
      if (diff > Math.PI) diff -= Math.PI * 2;
      if (diff < -Math.PI) diff += Math.PI * 2;
      this.cameraYaw += diff * (1 - Math.exp(-dt * 2));
    }
    this.cameraTarget.lerp(this.player.position, 1 - Math.exp(-dt * 10));
    const d = this.car ? 14 + Math.abs(this.car.speed) * 0.12 : 12.5,
      h = this.car ? 8.5 : 8;
    const target = this.cameraTarget.clone().add(new THREE.Vector3(0, 1.9, 0));
    this.cameraPosition.set(
      this.cameraTarget.x + Math.sin(this.cameraYaw) * d,
      this.cameraTarget.y + h,
      this.cameraTarget.z + Math.cos(this.cameraYaw) * d,
    );
    const dir = this.cameraPosition.clone().sub(target),
      length = dir.length();
    this.raycaster.set(target, dir.normalize());
    this.raycaster.far = length;
    const hit = this.raycaster.intersectObjects(this.world.group.children, false)[0];
    if (hit && hit.distance < length)
      this.cameraPosition.copy(target).addScaledVector(dir, Math.max(2.2, hit.distance - 0.7));
    this.graphics.camera.position.lerp(this.cameraPosition, 1 - Math.exp(-dt * 10));
    const camera = this.graphics.camera.position;
    camera.y = Math.max(camera.y, this.terrain.heightAt(camera.x, camera.z) + 1.5);
    this.graphics.camera.lookAt(target);
  }
  private updateMarker(): void {
    const npc = this.npcs.find((n) => n.definition.id === this.missions.contactId);
    this.activeMarker.visible = !!npc;
    if (!npc) {
      this.ui.marker(0, 0, '', false);
      return;
    }
    this.activeMarker.position
      .copy(npc.position)
      .add(new THREE.Vector3(0, 3.6 + Math.sin(this.elapsed * 2) * 0.2, 0));
    this.activeMarker.rotation.y = this.elapsed;
    const projected = this.activeMarker.position
      .clone()
      .add(new THREE.Vector3(0, 1, 0))
      .project(this.graphics.camera);
    this.ui.marker(
      (projected.x * 0.5 + 0.5) * innerWidth,
      (-projected.y * 0.5 + 0.5) * innerHeight,
      `${npc.definition.name} · ${Math.round(distance(npc.position, this.player.position))} m`,
      projected.z < 1 &&
        projected.z > -1 &&
        Math.abs(projected.x) < 0.94 &&
        Math.abs(projected.y) < 0.8,
    );
  }
  private mapMarkers(): MapMarker[] {
    return [
      ...this.npcs.map((n) => ({
        position: n.position,
        kind: 'npc' as const,
        active: n.definition.id === this.missions.contactId,
        name: n.definition.name,
      })),
      ...this.vehicles
        .filter((v) => !v.occupied)
        .map((v) => ({ position: v.position, kind: 'car' as const })),
      ...this.tapes
        .filter((t) => !this.save.tapes.includes(t.id))
        .map((t) => ({ position: t.position, kind: 'tape' as const })),
    ];
  }
  private updateUI(): void {
    const markers = this.mapMarkers();
    if (this.ui.screen === 'playing') {
      this.ui.updateHud(
        this.map.nearestRoad(this.player.position).road.name,
        this.car?.speed ?? null,
      );
      this.minimap.draw(
        this.player.position,
        this.car?.heading ?? this.player.object.rotation.y,
        markers,
      );
    }
    if (this.ui.screen === 'map') {
      if (!this.largeMap) {
        const canvas = this.root.querySelector<HTMLCanvasElement>('#large-map');
        if (canvas) this.largeMap = new Minimap(canvas, this.map, this.world.buildingOutlines);
      }
      this.largeMap?.draw(
        this.player.position,
        this.car?.heading ?? this.player.object.rotation.y,
        markers,
        true,
      );
    }
  }
  getDiagnostics() {
    return {
      screen: this.ui.screen,
      player: { x: this.player.position.x, y: this.player.position.y, z: this.player.position.z },
      terrain: {
        source: 'ICV MDT Castellón / LiDAR-PNOA 2017',
        grid: [this.terrain.metadata.width, this.terrain.metadata.height],
        minHeight: this.terrain.minHeight,
        maxHeight: this.terrain.maxHeight,
        playerGround: this.terrain.heightAt(this.player.position.x, this.player.position.z),
      },
      camera: {
        y: this.graphics.camera.position.y,
        ground: this.terrain.heightAt(
          this.graphics.camera.position.x,
          this.graphics.camera.position.z,
        ),
      },
      cameraYaw: this.cameraYaw,
      vehicle: this.car ? { id: this.car.id, speed: this.car.speed } : null,
      npcs: this.npcs.map((n) => ({
        id: n.definition.id,
        position: { x: n.position.x, y: n.position.y, z: n.position.z },
        ground: this.terrain.heightAt(n.position.x, n.position.z),
      })),
      cars: this.vehicles.map((v) => ({
        id: v.id,
        position: { x: v.position.x, y: v.position.y, z: v.position.z },
        ground: this.terrain.heightAt(v.position.x, v.position.z),
        pitch: v.object.rotation.x,
        roll: v.object.rotation.z,
        heading: v.heading,
      })),
      tapes: this.tapes.map((t) => ({
        id: t.id,
        position: { x: t.position.x, y: t.position.y, z: t.position.z },
        ground: t.groundHeight,
        collected: this.save.tapes.includes(t.id),
      })),
      stage: this.save.stage,
      buildings: this.world.buildingOutlines.length,
      drawCalls: this.graphics.renderer.info.render.calls,
      triangles: this.graphics.renderer.info.render.triangles,
      saveAvailable: this.store.available,
    };
  }
  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.persist();
    this.abort.abort();
    this.input.dispose();
    this.audio.dispose();
    this.graphics.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.assets.dispose();
    this.graphics.dispose();
  }
}
