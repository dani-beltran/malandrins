import { I18n } from '../systems/I18n';
import { MissionSystem } from '../systems/MissionSystem';
import { portrait, placeholderPortrait } from './portraits';
import type { TranslationKey } from '../data/locales';
export type Screen = 'menu' | 'playing' | 'paused' | 'controls' | 'settings' | 'map';
export type UIAction =
  | 'play'
  | 'pause'
  | 'resume'
  | 'controls'
  | 'settings'
  | 'back'
  | 'map'
  | 'language'
  | 'quality'
  | 'audio'
  | 'volume'
  | 'dialogue'
  | 'new'
  | 'reset'
  | 'cancel-reset'
  | 'rescue'
  | 'fullscreen';
const esc = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export class GameUI {
  screen: Screen = 'menu';
  private hud: HTMLElement;
  private overlay: HTMLElement;
  private dialogue: HTMLElement;
  private prompt: HTMLElement;
  private toastElement: HTMLElement;
  private toastTimer = 0;
  private confirmReset = false;
  private lastPrompt = '';
  readonly minimapCanvas: HTMLCanvasElement;
  constructor(
    private root: HTMLElement,
    readonly i18n: I18n,
    private missions: MissionSystem,
    private onAction: (action: UIAction, value?: string) => void,
  ) {
    root.innerHTML = `<div class="film-grain" aria-hidden="true"></div><div id="hud" hidden></div><div id="overlay"></div><div id="interaction" hidden></div><div id="dialogue" hidden></div><div id="toast" role="status" aria-live="polite" hidden></div><div id="world-marker" hidden><span>◇</span><small></small></div>`;
    this.hud = root.querySelector('#hud')!;
    this.overlay = root.querySelector('#overlay')!;
    this.dialogue = root.querySelector('#dialogue')!;
    this.prompt = root.querySelector('#interaction')!;
    this.toastElement = root.querySelector('#toast')!;
    this.minimapCanvas = document.createElement('canvas');
    this.minimapCanvas.setAttribute('aria-label', 'Town minimap');
    root.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLElement>('button[data-action]');
      if (button) this.onAction(button.dataset.action as UIAction, button.dataset.value);
    });
    root.addEventListener('change', (e) => {
      const el = e.target as HTMLSelectElement | HTMLInputElement;
      if (el.dataset.action) this.onAction(el.dataset.action as UIAction, el.value);
    });
    i18n.onChange(() => this.render());
    this.render();
  }
  private t(key: TranslationKey, vars: Record<string, string | number> = {}): string {
    return esc(this.i18n.t(key, vars));
  }
  private languages(): string {
    return `<div class="language-switch" aria-label="${this.t('language')}"><button data-action="language" data-value="en" class="${this.i18n.language === 'en' ? 'selected' : ''}" aria-pressed="${this.i18n.language === 'en'}">EN</button><span>/</span><button data-action="language" data-value="ca" class="${this.i18n.language === 'ca' ? 'selected' : ''}" aria-pressed="${this.i18n.language === 'ca'}">CA</button></div>`;
  }
  setScreen(screen: Screen): void {
    this.screen = screen;
    this.confirmReset = false;
    this.render();
  }
  requestReset(show: boolean): void {
    this.confirmReset = show;
    this.render();
  }
  render(): void {
    this.renderHud();
    this.hud.hidden = !['playing', 'map'].includes(this.screen);
    this.overlay.hidden = this.screen === 'playing';
    this.prompt.hidden = true;
    this.lastPrompt = '';
    const brand = `<span class="brand-mark">M</span><span class="brand-name">MALANDRINS<span class="brand-dot">01</span></span>`;
    const header = `<header class="menu-header"><div class="brand">${brand}</div><div class="header-right"><span class="edition">${this.t('edition')}</span>${this.languages()}</div></header>`;
    const credit = `<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">${this.t('credit')}</a><span>${this.t('creditSuffix')}</span>`;
    if (this.screen === 'menu') {
      this.overlay.innerHTML = `<section class="title-screen">${header}<main class="title-content"><div class="eyebrow"><span class="little-star">✳</span> ${this.t('chapter')} <span class="eyebrow-line"></span> ${this.t('chapterName')}</div><p class="tagline">${this.t('tagline')}</p><h1>MALANDRINS<span class="title-period">.</span></h1><p class="intro-copy">${this.t('subtitle').replaceAll('\n', '<br>')}</p><div class="start-actions"><button class="primary-button" data-action="play"><span class="button-symbol">▶</span>${this.t(this.missions.save.started ? 'continue' : 'play')}<span class="button-arrow">↗</span></button><button class="text-button" data-action="controls">${this.t('controls')} <span>↗</span></button></div><div class="menu-links"><button data-action="settings">${this.t('settings')}</button>${this.missions.save.started ? `<span>·</span><button data-action="new">${this.t('newGame')}</button>` : ''}</div><div class="title-note"><span class="tiny-square"></span>${this.t('menuNote')}</div></main><aside class="location-stamp"><span class="stamp-top">◈ &nbsp; ${this.t('location')}</span><span class="stamp-coords">40°06′ N &nbsp; 00°00′ W</span><span class="stamp-bottom">${this.t('about')}</span></aside><footer class="title-footer"><span>${this.t('keyboard')} <i></i> ${this.t('tip')}</span><div class="map-credit">${credit}</div></footer><div class="vertical-edition">M / 1998 &nbsp; — &nbsp; VOL. 01</div></section>`;
    } else if (this.screen === 'paused') {
      this.overlay.innerHTML = `<section class="modal-screen">${header}<main class="panel pause-panel"><p class="eyebrow">${this.t('paused')}</p><h2>${this.t('pause')}</h2><p class="panel-subtitle">${this.t('chapterName')} <span class="separator">/</span> ${this.missions.save.stage === 5 ? this.t('freeRoam') : this.t('step', { current: this.missions.save.stage + 1 })}</p><button class="primary-button" data-action="resume">${this.t('resume')}<span>↗</span></button><div class="pause-links"><button data-action="map">${this.t('map')} <kbd>M</kbd></button><button data-action="controls">${this.t('controls')} ↗</button><button data-action="settings">${this.t('settings')} ↗</button><button data-action="rescue">${this.t('rescue')} ↗</button></div><p class="rescue-note">${this.t('rescueNote')}</p><div class="progress-row"><div><strong>${this.missions.metCount}<span>/16</span></strong><small>${this.t('met')}</small></div><div><strong>${this.missions.save.tapes.length}<span>/8</span></strong><small>${this.t('tapes')}</small></div><span class="save-tag">● ${this.t('saved')}</span></div></main></section>`;
    } else if (this.screen === 'controls') {
      const rows: [TranslationKey, string][] = [
        ['move', 'W A S D / ↑ ← ↓ →'],
        ['run', 'SHIFT'],
        ['interact', 'E'],
        ['vehicle', 'F'],
        ['brake', 'SPACE'],
        ['camera', 'Q / R + MOUSE'],
        ['horn', 'H'],
        ['map', 'M'],
        ['pauseKey', 'ESC'],
      ];
      this.overlay.innerHTML = `<section class="modal-screen">${header}<main class="panel controls-panel"><button class="back-button" data-action="back">← ${this.t('back')}</button><p class="eyebrow">${this.t('keyboard')}</p><h2>${this.t('controls')}</h2><div class="controls-columns"><div class="control-list">${rows.map(([key, code]) => `<div><span>${this.t(key)}</span><kbd>${code}</kbd></div>`).join('')}</div><div class="control-notes"><span>01 / ${this.t('walk')}</span><p>${this.t('walkHelp')}</p><span>02 / ${this.t('drive')}</span><p>${this.t('driveHelp')}</p><span>03 / ${this.t('interact')}</span><p>${this.t('dialogueHelp')}</p></div></div></main></section>`;
    } else if (this.screen === 'settings') {
      const save = this.missions.save;
      this.overlay.innerHTML = `<section class="modal-screen">${header}<main class="panel settings-panel"><button class="back-button" data-action="back">← ${this.t('back')}</button><p class="eyebrow">MALANDRINS / ${this.t('settings')}</p><h2>${this.t('settings')}</h2><div class="setting-row"><label>${this.t('language')}</label>${this.languages()}</div><div class="setting-row"><label for="quality-select">${this.t('graphics')}</label><select id="quality-select" data-action="quality"><option value="retro" ${save.quality === 'retro' ? 'selected' : ''}>${this.t('retro')}</option><option value="clear" ${save.quality === 'clear' ? 'selected' : ''}>${this.t('clear')}</option></select></div><div class="setting-row"><span>${this.t('music')}</span><button class="toggle ${save.audio ? 'active' : ''}" data-action="audio" aria-pressed="${save.audio}">${this.t(save.audio ? 'on' : 'off')} <i></i></button></div><div class="setting-row"><label for="volume">${this.t('volume')}</label><input type="range" id="volume" min="0" max="1" step=".05" value="${save.volume}" data-action="volume"></div><div class="setting-row"><span>${this.t('fullscreen')}</span><button class="small-button" data-action="fullscreen">⛶</button></div><div class="radio-card"><span class="radio-icon">▥</span><div><strong>${this.t('soundLabel')}</strong><p>${this.t('soundTrack')}</p></div><span class="equalizer">▂▆▃▇▅</span></div></main></section>`;
    } else if (this.screen === 'map') {
      this.overlay.innerHTML = `<section class="map-screen"><div class="map-heading"><div><p class="eyebrow">${this.t('mapSubtitle')}</p><h2>${this.t('mapTitle')}</h2></div><button class="small-button" data-action="resume">${this.t('closeMap')} <kbd>M</kbd></button></div><div class="map-layout"><canvas id="large-map" aria-label="${this.t('map')}"></canvas><aside class="map-sidebar"><span class="eyebrow">${this.t('objective')}</span><h3>${this.t('chapterName')}</h3><p>${this.t(this.missions.objectiveKey)}</p><div class="map-legend">${(['you', 'contact', 'crew', 'car', 'tape'] as const).map((key, i) => `<div><i class="legend-dot dot-${i}"></i>${this.t(key)}</div>`).join('')}</div><p class="map-help">${this.t('mapLegend')}</p><div class="map-credit">${credit}</div></aside></div></section>`;
    } else this.overlay.innerHTML = '';
    if (this.confirmReset)
      this.overlay.insertAdjacentHTML(
        'beforeend',
        `<div class="confirm-backdrop"><div class="confirm-panel" role="alertdialog" aria-modal="true"><h3>${this.t('resetConfirm')}</h3><button class="primary-button" data-action="reset">${this.t('confirm')}</button><button class="text-button" data-action="cancel-reset">${this.t('cancel')}</button></div></div>`,
      );
    this.renderDialogue();
  }
  private renderHud(): void {
    this.hud.innerHTML = `<div class="hud-top"><div class="hud-brand">M<span> / </span><small>MALANDRINS</small></div><div class="hud-status"><span class="wallet">€${String(this.missions.money).padStart(5, '0')}</span><button class="hud-icon" data-action="pause" aria-label="${this.t('pauseKey')}">Ⅱ</button></div></div><div class="mission-panel"><span class="mission-number">${this.missions.save.stage === 5 ? '✓' : String(this.missions.save.stage + 1).padStart(2, '0')}</span><div><span class="eyebrow">${this.t('objective')}</span><h3>${this.t(this.missions.save.stage === 5 ? 'missionComplete' : 'chapterName')}</h3><p id="objective-text">${this.t(this.missions.objectiveKey)}</p></div></div><div class="hud-bottom-left"><div class="minimap-frame"><div class="minimap-content"></div><button class="map-open" data-action="map" aria-label="${this.t('map')}"><kbd>M</kbd> ↗</button></div><div class="street-label"><span>●</span><strong id="street-name">Plaça del Raval</strong></div></div><div class="hud-bottom-right"><div class="radio-label"><span class="equalizer">▂▅▃▆</span><button data-action="audio">${this.t(this.missions.save.audio ? 'soundLabel' : 'soundOff')}</button></div><div class="speed-display"><strong id="speed-value">${this.t('onFoot')}</strong><span id="speed-unit"></span></div><div class="key-hints"><span><kbd>F</kbd> ${this.t('vehicle')}</span><span><kbd>E</kbd> ${this.t('interact')}</span><span><kbd>ESC</kbd> ${this.t('pauseKey')}</span></div></div>`;
    this.hud.querySelector('.minimap-content')!.append(this.minimapCanvas);
  }
  updateHud(street: string, speed: number | null): void {
    this.hud.querySelector('#street-name')!.textContent = street || this.i18n.t('location');
    this.hud.querySelector('#speed-value')!.textContent =
      speed === null
        ? this.i18n.t('onFoot')
        : String(Math.round(Math.abs(speed) * 3.6)).padStart(2, '0');
    this.hud.querySelector('#speed-unit')!.textContent = speed === null ? '' : this.i18n.t('speed');
    this.hud.querySelector('.speed-display')!.classList.toggle('driving', speed !== null);
  }
  refreshProgress(): void {
    this.renderHud();
  }
  showPrompt(key: string, text: string): void {
    const value = `${key}:${text}`;
    if (value !== this.lastPrompt) {
      this.prompt.innerHTML = `<kbd>${esc(key)}</kbd><span>${esc(text)}</span>`;
      this.lastPrompt = value;
    }
    this.prompt.hidden = this.screen !== 'playing' || !!this.missions.conversation;
  }
  hidePrompt(): void {
    this.prompt.hidden = true;
  }
  renderDialogue(): void {
    const conversation = this.missions.conversation;
    this.dialogue.hidden = !conversation || this.screen !== 'playing';
    if (!conversation) return;
    const { character, lines, index } = conversation;
    this.dialogue.innerHTML = `<div class="portrait-frame"><img src="${esc(portrait(character))}" alt="${esc(character.name)}" width="96" height="112"/><span>${esc(character.name.slice(0, 2).toUpperCase())}</span></div><div class="dialogue-content"><div class="speaker-row"><div><h3>${esc(character.name)}</h3><span>${esc(this.i18n.text(character.role))}</span></div><span class="dialogue-count">${String(index + 1).padStart(2, '0')} / ${String(lines.length).padStart(2, '0')}</span></div><p class="dialogue-text" aria-live="polite">${esc(this.i18n.text(lines[index]))}</p><button class="dialogue-next" data-action="dialogue">${this.t(index === lines.length - 1 ? 'endDialogue' : 'continueDialogue')} <kbd>↵</kbd></button></div>`;
    this.dialogue.querySelector('img')!.addEventListener(
      'error',
      (e) => {
        (e.target as HTMLImageElement).src = placeholderPortrait(character);
      },
      { once: true },
    );
  }
  toast(text: string, duration = 4200): void {
    window.clearTimeout(this.toastTimer);
    this.toastElement.textContent = text;
    this.toastElement.hidden = false;
    this.toastTimer = window.setTimeout(() => {
      this.toastElement.hidden = true;
    }, duration);
  }
  marker(x: number, y: number, text: string, visible: boolean): void {
    const marker = this.root.querySelector<HTMLElement>('#world-marker')!;
    marker.hidden = !visible || this.screen !== 'playing' || !!this.missions.conversation;
    if (!visible) return;
    marker.style.transform = `translate(${x}px,${y}px)`;
    marker.querySelector('small')!.textContent = text;
  }
}
