import {
  characters,
  missionContacts,
  missionDialogues,
  type CharacterDefinition,
} from '../data/characters';
import type { Localized, TranslationKey } from '../data/locales';
import type { SaveData } from './SaveStore';
export interface Conversation {
  character: CharacterDefinition;
  lines: Localized[];
  index: number;
  missionStage: number | null;
}
export class MissionSystem {
  conversation: Conversation | null = null;
  constructor(readonly save: SaveData) {}
  get contactId(): string | null {
    return missionContacts[this.save.stage] ?? null;
  }
  get objectiveKey(): TranslationKey {
    return `stage${this.save.stage}` as TranslationKey;
  }
  get money(): number {
    return 150 + this.save.stage * 75 + this.save.tapes.length * 25;
  }
  start(character: CharacterDefinition): Conversation {
    if (!this.save.met.includes(character.id)) this.save.met.push(character.id);
    const missionStage = character.id === this.contactId ? this.save.stage : null;
    return (this.conversation = {
      character,
      lines: missionStage === null ? character.lines : missionDialogues[missionStage],
      index: 0,
      missionStage,
    });
  }
  advance(): { closed: boolean; reward: number; completed: boolean } {
    const c = this.conversation;
    if (!c) return { closed: false, reward: 0, completed: false };
    if (c.index < c.lines.length - 1) {
      c.index++;
      return { closed: false, reward: 0, completed: false };
    }
    const reward = c.missionStage === this.save.stage ? 75 : 0;
    if (reward) this.save.stage = Math.min(5, this.save.stage + 1);
    this.conversation = null;
    return { closed: true, reward, completed: reward > 0 && this.save.stage === 5 };
  }
  collect(id: number): boolean {
    if (this.save.tapes.includes(id) || id < 0 || id > 7) return false;
    this.save.tapes.push(id);
    return true;
  }
  get metCount(): number {
    return this.save.met.filter((id) => characters.some((c) => c.id === id)).length;
  }
}
