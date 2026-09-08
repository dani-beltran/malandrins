import type { Language } from '../data/locales';
import type { Quality } from '../core/Renderer';
import type { Point } from '../core/math';
export interface SaveData {
  version: 1;
  stage: number;
  met: string[];
  tapes: number[];
  position: Point | null;
  language: Language;
  quality: Quality;
  audio: boolean;
  volume: number;
  started: boolean;
}
export const freshSave = (): SaveData => ({
  version: 1,
  stage: 0,
  met: [],
  tapes: [],
  position: null,
  language: 'en',
  quality: 'clear',
  audio: true,
  volume: 0.45,
  started: false,
});
export class SaveStore {
  static readonly key = 'malandrins.save.v1';
  available = true;
  load(): SaveData {
    const defaults = freshSave();
    try {
      const raw = localStorage.getItem(SaveStore.key);
      if (!raw) return defaults;
      const s = JSON.parse(raw) as Partial<SaveData>;
      if (s.version !== 1) return defaults;
      return {
        ...defaults,
        stage: Number.isInteger(s.stage) ? Math.max(0, Math.min(5, s.stage!)) : 0,
        met: Array.isArray(s.met) ? [...new Set(s.met.filter((x) => typeof x === 'string'))] : [],
        tapes: Array.isArray(s.tapes)
          ? [...new Set(s.tapes.filter((x) => Number.isInteger(x) && x >= 0 && x < 8))]
          : [],
        position:
          s.position && Number.isFinite(s.position.x) && Number.isFinite(s.position.z)
            ? s.position
            : null,
        language: s.language === 'ca' ? 'ca' : 'en',
        quality: s.quality === 'retro' ? 'retro' : defaults.quality,
        audio: typeof s.audio === 'boolean' ? s.audio : true,
        volume:
          typeof s.volume === 'number' && Number.isFinite(s.volume)
            ? Math.max(0, Math.min(1, s.volume))
            : 0.45,
        started: s.started === true,
      };
    } catch {
      this.available = false;
      return defaults;
    }
  }
  save(data: SaveData): boolean {
    try {
      localStorage.setItem(SaveStore.key, JSON.stringify(data));
      return true;
    } catch {
      this.available = false;
      return false;
    }
  }
}
